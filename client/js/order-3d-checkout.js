const PROFILE_STORAGE_KEY = "userProfile";
const PRINT3D_PENDING_KEY = "print3dCheckoutPending";
const PRINT3D_DB_NAME = "evrykaPrint3dDb";
const PRINT3D_DB_STORE = "pendingFiles";

let cityOptions = [];
let cityDropdownVisible = false;
let citySearchTimer = null;
let citySelectionInProgress = false;
let branchOptions = [];
let branchDropdownVisible = false;
let branchSelectionInProgress = false;
let orderSubmitting = false;

const pendingState = {
  meta: null,
  files: new Map()
};

function capitalizeCityInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zа-яіїєґ])/giu, (m, s, l) => `${s}${l.toUpperCase()}`);
}

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  const current = getProfile() || {};
  const merged = {
    ...current,
    ...(profile || {}),
    delivery: {
      ...(current.delivery || {}),
      ...((profile || {}).delivery || {})
    }
  };
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(merged));
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(PRINT3D_DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PRINT3D_DB_STORE)) {
        db.createObjectStore(PRINT3D_DB_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error("IndexedDB unavailable"));
  });
}

async function dbGet(id) {
  const db = await openDb();
  const row = await new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT3D_DB_STORE, "readonly");
    const req = tx.objectStore(PRINT3D_DB_STORE).get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Failed to read pending file"));
  });
  db.close();
  return row;
}

async function dbDelete(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(PRINT3D_DB_STORE, "readwrite");
    tx.objectStore(PRINT3D_DB_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("Failed to delete pending file"));
  });
  db.close();
}

function showMessage(msg, isError = true) {
  const el = document.getElementById("orderMessage");
  if (!el) return;
  el.textContent = msg;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function setSubmitLoading(isLoading) {
  const submitBtn = document.querySelector('#orderForm button[type="submit"]');
  if (!submitBtn) return;
  submitBtn.disabled = Boolean(isLoading);
  submitBtn.classList.toggle("is-loading", Boolean(isLoading));
  submitBtn.textContent = isLoading ? "Оформлюємо..." : "Підтвердити замовлення";
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getProviderTitle(provider) {
  if (provider === "nova_poshta") return "Нова пошта";
  if (provider === "ukr_poshta") return "Укрпошта";
  return "-";
}

function getDeliveryTypeTitle(type) {
  if (type === "warehouse") return "Відділення";
  if (type === "postomat") return "Поштомат";
  if (type === "address") return "Адресна доставка";
  return "-";
}

function getPaymentMethodTitle(method) {
  if (method === "cod") return "Оплата при отриманні";
  if (method === "liqpay") return "Оплата LiqPay";
  return "-";
}

function fillForm(profile) {
  document.getElementById("orderName").value = profile?.name || "";
  document.getElementById("orderLastName").value = profile?.lastName || "";
  document.getElementById("orderMiddleName").value = profile?.middleName || "";
  document.getElementById("orderPhone").value = profile?.phone || "";
  document.getElementById("orderEmail").value = profile?.email || "";
  document.getElementById("orderProvider").value = profile?.delivery?.provider || "";
  document.getElementById("orderDeliveryType").value = profile?.delivery?.deliveryType || "warehouse";
  document.getElementById("orderPaymentMethod").value = profile?.delivery?.paymentMethod || "cod";
  document.getElementById("orderCity").value = profile?.delivery?.city || "";
  document.getElementById("orderCityRef").value = profile?.delivery?.cityRef || "";
  document.getElementById("orderBranch").value = profile?.delivery?.branchText || profile?.delivery?.branch || "";
  document.getElementById("orderBranchRef").value = profile?.delivery?.branch || "";
  document.getElementById("orderAddress").value = profile?.delivery?.address || "";
}

function renderItems() {
  const container = document.getElementById("orderItems");
  const totalEl = document.getElementById("orderTotal");
  if (!container || !totalEl) return;
  const models = Array.isArray(pendingState.meta?.models) ? pendingState.meta.models : [];
  container.innerHTML = "";
  let total = 0;

  models.forEach((m) => {
    total += Number(m.price || 0);
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <img src="images/favicon.png" alt="${escapeHtml(m.name)}">
      <div style="flex:1;">
        <h4 style="margin:0 0 4px;">${escapeHtml(m.name)}</h4>
        <p style="margin:0 0 8px;">${Number(m.price || 0).toFixed(2)} грн</p>
        <span style="font-size:13px;color:#5b6470;">Матеріал: ${escapeHtml(m.material || "PLA")} · Міцність: ${escapeHtml(m.strength || "medium")} · Якість: ${escapeHtml(m.quality || "normal")}</span>
      </div>
    `;
    container.appendChild(row);
  });

  totalEl.textContent = total.toFixed(2);
}

function buildOrderSuccessDetails(order) {
  const customer = order?.customer || {};
  const delivery = customer?.delivery || {};
  const items = Array.isArray(order?.modelsMeta) ? order.modelsMeta : [];
  const itemsHtml = items
    .map((item) => {
      const nameSafe = escapeHtml(item.name);
      const sum = Number(item.price || 0);
      return `<li class="order-success-item"><img class="order-success-item-thumb" src="images/favicon.png" alt="${nameSafe}" loading="lazy"><span class="order-success-item-text">${nameSafe} — ${sum.toFixed(2)} грн (${escapeHtml(item.material || "-")}, ${escapeHtml(item.strength || "-")}, ${escapeHtml(item.quality || "-")})</span></li>`;
    })
    .join("");

  return `
    <p><b>ПІБ:</b> ${escapeHtml(`${customer.lastName || ""} ${customer.name || ""} ${customer.middleName || ""}`.trim())}</p>
    <p><b>Телефон:</b> ${escapeHtml(customer.phone || "-")}</p>
    <p><b>Email:</b> ${escapeHtml(customer.email || "-")}</p>
    <p><b>Служба доставки:</b> ${getProviderTitle(delivery.provider)}</p>
    <p><b>Тип доставки:</b> ${getDeliveryTypeTitle(delivery.deliveryType)}</p>
    <p><b>Оплата:</b> ${getPaymentMethodTitle(delivery.paymentMethod)}</p>
    <p><b>Місто:</b> ${escapeHtml(delivery.city || "-")}</p>
    <p><b>Відділення/поштомат:</b> ${escapeHtml(delivery.branchText || "-")}</p>
    <p><b>Адреса:</b> ${escapeHtml(delivery.address || "-")}</p>
    ${order?.ttn ? `<p><b>ТТН:</b> ${escapeHtml(order.ttn)}</p>` : ""}
    <p><b>Сума:</b> ${Number(order?.total || 0).toFixed(2)} грн</p>
    <p><b>Файли:</b></p>
    <ul class="order-success-items">${itemsHtml}</ul>
  `;
}

function showOrderSuccessModal(order) {
  const modal = document.getElementById("orderSuccessModal");
  const num = document.getElementById("orderSuccessNumber");
  const details = document.getElementById("orderSuccessDetails");
  if (!modal || !num || !details) return;
  num.textContent = `Номер замовлення: ${order?.orderNumber || "-"}`;
  details.innerHTML = buildOrderSuccessDetails(order);
  modal.style.display = "flex";
}

function closeOrderSuccessModal() {
  const modal = document.getElementById("orderSuccessModal");
  if (modal) modal.style.display = "none";
  window.location.href = "order-3d-print.html";
}

function initOrderSuccessModalEvents() {
  const modal = document.getElementById("orderSuccessModal");
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeOrderSuccessModal();
  });
}

function setupDeliveryUI() {
  const providerEl = document.getElementById("orderProvider");
  const deliveryTypeEl = document.getElementById("orderDeliveryType");
  const deliveryTypeWrap = document.getElementById("deliveryTypeWrap");
  const branchWrap = document.getElementById("branchWrap");
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  const cityEl = document.getElementById("orderCity");
  const addressWrap = document.getElementById("addressWrap");
  const addressEl = document.getElementById("orderAddress");
  const middleNameWrap = document.getElementById("middleNameWrap");
  const middleNameEl = document.getElementById("orderMiddleName");
  const cityRefEl = document.getElementById("orderCityRef");

  const applyVisibility = () => {
    const provider = providerEl.value;
    const deliveryType = deliveryTypeEl.value;
    const hasProvider = Boolean(provider);
    const isNova = provider === "nova_poshta";
    deliveryTypeWrap.style.display = hasProvider && isNova ? "grid" : "none";
    document.getElementById("cityWrap").style.display = hasProvider ? "grid" : "none";
    cityEl.placeholder = isNova ? "Почніть вводити місто..." : "Місто";
    branchWrap.style.display = !hasProvider || (isNova && deliveryType === "address") ? "none" : "grid";
    addressWrap.style.display = hasProvider && isNova && deliveryType === "address" ? "grid" : "none";
    middleNameWrap.style.display = hasProvider && isNova && deliveryType === "address" ? "grid" : "none";
    branchWrap.firstChild.textContent = deliveryType === "postomat" ? "Обрати поштомат" : "Обрати відділення";
    branchEl.required = isNova && deliveryType !== "address";
    addressEl.required = isNova && deliveryType === "address";
    middleNameEl.required = isNova && deliveryType === "address";
    if (!isNova) {
      cityRefEl.value = "";
      branchRefEl.value = "";
      branchEl.value = "";
      branchEl.placeholder = "Вкажіть відділення вручну";
      branchOptions = [];
      renderBranchSuggestions([]);
    }
  };

  providerEl.addEventListener("change", applyVisibility);
  deliveryTypeEl.addEventListener("change", async () => {
    branchEl.value = "";
    branchRefEl.value = "";
    branchOptions = [];
    renderBranchSuggestions([]);
    branchEl.placeholder = deliveryTypeEl.value === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    applyVisibility();
    if (providerEl.value === "nova_poshta" && cityRefEl.value) {
      await loadWarehouses(cityRefEl.value, deliveryTypeEl.value);
      onBranchInput();
    }
  });
  applyVisibility();
}

async function onCityInput() {
  const cityEl = document.getElementById("orderCity");
  const providerEl = document.getElementById("orderProvider");
  const cityRefEl = document.getElementById("orderCityRef");
  const normalized = capitalizeCityInput(cityEl.value);
  if (cityEl.value !== normalized) cityEl.value = normalized;
  const query = normalized.trim();
  cityRefEl.value = "";
  if (citySearchTimer) clearTimeout(citySearchTimer);
  if (providerEl.value !== "nova_poshta" || query.length < 1) return renderCitySuggestions([]);
  const instant = cityOptions.filter((city) => String(city.Present || "").toLowerCase().includes(query.toLowerCase()));
  if (instant.length) renderCitySuggestions(instant);
  else renderCityLoading();
  citySearchTimer = setTimeout(async () => {
    try {
      cityOptions = await searchNovaPoshtaCities(query);
      renderCitySuggestions(cityOptions);
    } catch (error) {
      renderCitySuggestions([]);
      showMessage(error.message || "Не вдалося знайти місто");
    }
  }, 40);
}

async function onCityChange() {
  if (citySelectionInProgress) return;
  const cityEl = document.getElementById("orderCity");
  const cityRefEl = document.getElementById("orderCityRef");
  const providerEl = document.getElementById("orderProvider");
  const deliveryType = document.getElementById("orderDeliveryType").value;
  if (providerEl.value !== "nova_poshta") return;
  const normalizedInput = capitalizeCityInput(cityEl.value.trim());
  cityEl.value = normalizedInput;
  let selectedCity = cityOptions.find((city) => city.Present === normalizedInput);
  if (!selectedCity && normalizedInput.length >= 3) {
    try {
      const freshCities = await searchNovaPoshtaCities(normalizedInput);
      cityOptions = freshCities;
      selectedCity = freshCities.find((city) => city.Present === normalizedInput) || freshCities.find((city) => city.Present.toLowerCase().startsWith(normalizedInput.toLowerCase()));
    } catch {}
  }
  const selectedCityRef = selectedCity?.DeliveryCity || selectedCity?.Ref || "";
  cityRefEl.value = selectedCityRef;
  if (selectedCityRef) {
    cityEl.value = selectedCity.Present;
    renderCitySuggestions([]);
    await loadWarehouses(selectedCityRef, deliveryType);
  } else {
    renderCitySuggestions([]);
    document.getElementById("orderBranchRef").value = "";
    document.getElementById("orderBranch").value = "";
    document.getElementById("orderBranch").placeholder = "Спочатку оберіть місто зі списку";
    branchOptions = [];
    renderBranchSuggestions([]);
  }
}

function renderCitySuggestions(options) {
  const listEl = document.getElementById("citySuggestions");
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    cityDropdownVisible = false;
    return;
  }
  listEl.innerHTML = options.slice(0, 8).map((city) => `<button type="button" class="city-suggestion-item" data-ref="${city.DeliveryCity || city.Ref}" data-name="${city.Present}">${city.Present}</button>`).join("");
  listEl.style.display = "block";
  cityDropdownVisible = true;
}

function renderCityLoading() {
  const listEl = document.getElementById("citySuggestions");
  listEl.innerHTML = `<button type="button" class="city-suggestion-item" disabled>Пошук...</button>`;
  listEl.style.display = "block";
  cityDropdownVisible = true;
}

function bindCitySuggestionEvents() {
  const listEl = document.getElementById("citySuggestions");
  const cityEl = document.getElementById("orderCity");
  const cityRefEl = document.getElementById("orderCityRef");
  const deliveryTypeEl = document.getElementById("orderDeliveryType");
  listEl.addEventListener("mousedown", async (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn) return;
    event.preventDefault();
    citySelectionInProgress = true;
    cityEl.value = btn.dataset.name || "";
    cityRefEl.value = btn.dataset.ref || "";
    renderCitySuggestions([]);
    await loadWarehouses(cityRefEl.value, deliveryTypeEl.value);
    setTimeout(() => {
      citySelectionInProgress = false;
    }, 0);
  });
  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("cityWrap");
    if (!wrap.contains(event.target) && cityDropdownVisible) renderCitySuggestions([]);
  });
}

async function loadWarehouses(cityRef, deliveryType) {
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  if (!cityRef) return;
  const pendingQuery = String(branchEl.value || "").trim();
  branchRefEl.value = "";
  if (!pendingQuery) branchEl.value = "";
  branchEl.placeholder = "Завантаження...";
  try {
    const warehouses = await getNovaPoshtaWarehouses(cityRef, deliveryType);
    const filtered = warehouses.filter((w) => {
      const text = `${w.Description || ""} ${w.ShortAddress || ""}`.toLowerCase();
      const isPostomat = text.includes("поштомат");
      if (deliveryType === "postomat") return isPostomat;
      if (deliveryType === "warehouse") return !isPostomat;
      return true;
    });
    branchOptions = filtered;
    branchEl.placeholder = deliveryType === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    if (pendingQuery) {
      branchEl.value = pendingQuery;
      renderBranchSuggestions(filterBranchOptionsByQuery(filtered, pendingQuery));
      return;
    }
    renderBranchSuggestions(filtered);
  } catch (error) {
    branchOptions = [];
    branchEl.placeholder = "Не вдалося завантажити";
    renderBranchSuggestions([]);
    showMessage(error.message || "Помилка завантаження відділень");
  }
}

function renderBranchSuggestions(options) {
  const listEl = document.getElementById("branchSuggestions");
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    branchDropdownVisible = false;
    return;
  }
  listEl.innerHTML = options.slice(0, 14).map((w) => `<button type="button" class="city-suggestion-item" data-ref="${w.Ref}" data-name="${w.Description}">${w.Description}</button>`).join("");
  listEl.style.display = "block";
  branchDropdownVisible = true;
}

function filterBranchOptionsByQuery(options, rawQuery) {
  const query = String(rawQuery || "").trim().toLowerCase();
  if (!query) return options;

  // Якщо введено тільки номер (напр. "3"), шукаємо саме відділення/поштомат №3.
  if (/^\d+$/.test(query)) {
    return options.filter((w) => {
      const desc = String(w?.Description || "");
      const match = desc.match(/(?:відділення|поштомат)\s*№\s*(\d+)/i);
      if (match?.[1]) return match[1] === query;
      return false;
    });
  }

  return options.filter((w) => String(w?.Description || "").toLowerCase().includes(query));
}

function onBranchInput() {
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  branchRefEl.value = "";
  if (!branchOptions.length) return renderBranchSuggestions([]);
  if (!query) return renderBranchSuggestions(branchOptions);
  renderBranchSuggestions(filterBranchOptionsByQuery(branchOptions, query));
}

function onBranchChange() {
  if (branchSelectionInProgress) return;
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  if (!query) {
    branchRefEl.value = "";
    return renderBranchSuggestions([]);
  }
  const exact = branchOptions.find((w) => (w.Description || "").toLowerCase() === query);
  if (exact) {
    branchEl.value = exact.Description;
    branchRefEl.value = exact.Ref;
    return renderBranchSuggestions([]);
  }
  const partial = filterBranchOptionsByQuery(branchOptions, query);
  if (partial.length === 1) {
    branchEl.value = partial[0].Description;
    branchRefEl.value = partial[0].Ref;
  } else {
    branchRefEl.value = "";
  }
  renderBranchSuggestions([]);
}

function bindBranchSuggestionEvents() {
  const listEl = document.getElementById("branchSuggestions");
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  listEl.addEventListener("mousedown", (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn || btn.disabled) return;
    event.preventDefault();
    branchSelectionInProgress = true;
    branchEl.value = btn.dataset.name || "";
    branchRefEl.value = btn.dataset.ref || "";
    renderBranchSuggestions([]);
    setTimeout(() => {
      branchSelectionInProgress = false;
    }, 0);
  });
  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("branchWrap");
    if (!wrap.contains(event.target) && branchDropdownVisible) renderBranchSuggestions([]);
  });
}

async function cleanupPending() {
  const models = Array.isArray(pendingState.meta?.models) ? pendingState.meta.models : [];
  await Promise.all(models.map((m) => dbDelete(m.fileKey).catch(() => null)));
  sessionStorage.removeItem(PRINT3D_PENDING_KEY);
  pendingState.meta = null;
  pendingState.files.clear();
}

async function submitOrder(e) {
  e.preventDefault();
  if (orderSubmitting) return;
  const models = Array.isArray(pendingState.meta?.models) ? pendingState.meta.models : [];
  if (!models.length) return showMessage("Немає файлів для оформлення");

  const profile = {
    id: getProfile()?.id,
    clientId: getProfile()?.clientId,
    name: document.getElementById("orderName").value.trim(),
    lastName: document.getElementById("orderLastName").value.trim(),
    middleName: document.getElementById("orderMiddleName").value.trim(),
    phone: document.getElementById("orderPhone").value.trim(),
    email: document.getElementById("orderEmail").value.trim(),
    delivery: {
      provider: document.getElementById("orderProvider").value,
      deliveryType: document.getElementById("orderDeliveryType").value,
      paymentMethod: document.getElementById("orderPaymentMethod").value || "cod",
      city: document.getElementById("orderCity").value.trim(),
      cityRef: document.getElementById("orderCityRef").value.trim(),
      branch: document.getElementById("orderBranchRef").value.trim(),
      branchText: document.getElementById("orderBranch").value.trim(),
      address: document.getElementById("orderAddress").value.trim()
    }
  };

  if (!profile.name || !profile.lastName || !profile.phone || !profile.email) return showMessage("Заповніть контактні дані");
  if (!profile.delivery.provider) return showMessage("Оберіть службу доставки");
  if (profile.delivery.provider === "nova_poshta") {
    if (!profile.delivery.cityRef) return showMessage("Оберіть місто зі списку Нової пошти");
    if (profile.delivery.deliveryType === "address" && !profile.delivery.address) return showMessage("Вкажіть адресу доставки");
    if (profile.delivery.deliveryType === "address" && !profile.middleName) return showMessage("Вкажіть по батькові для адресної доставки");
    if (profile.delivery.deliveryType !== "address" && !profile.delivery.branch) return showMessage("Оберіть відділення або поштомат");
  }

  try {
    orderSubmitting = true;
    setSubmitLoading(true);
    showMessage("Оформлюємо замовлення, зачекайте...", false);
    const totalCost = models.reduce((sum, m) => sum + Number(m.price || 0), 0);
    const orderNumber = `EVR3D-${Date.now().toString().slice(-8)}`;
    let ttn = "";

    if (profile.id) {
      const updated = await updateUserProfile(profile);
      setProfile(updated);
    } else {
      setProfile(profile);
    }

    if (profile.delivery.provider === "nova_poshta") {
      const ttnResult = await createNovaPoshtaTtn({
        recipientName: profile.name,
        recipientLastName: profile.lastName,
        recipientMiddleName: profile.middleName,
        recipientPhone: profile.phone,
        cityRef: profile.delivery.cityRef,
        warehouseRef: profile.delivery.deliveryType === "address" ? profile.delivery.address : profile.delivery.branch,
        address: profile.delivery.address,
        deliveryType: profile.delivery.deliveryType,
        paymentMethod: profile.delivery.paymentMethod,
        orderNumber,
        cost: totalCost,
        cargoDescription: models.slice(0, 3).map((m) => m.name).join(", ")
      });
      ttn = ttnResult.ttn || "";
    }

    const fd = new FormData();
    for (const m of models) {
      const file = pendingState.files.get(m.fileKey);
      if (!file) throw new Error(`Файл ${m.name} не знайдено. Поверніться на попередню сторінку.`);
      fd.append("files", file, file.name);
    }
    fd.set("modelsMeta", JSON.stringify(models.map((m) => ({
      name: m.name,
      material: m.material,
      strength: m.strength,
      quality: m.quality,
      color: m.color,
      comment: m.comment || "",
      price: Number(m.price || 0),
      volume: Number(m.volume || 0),
      estimatedWeight: Number(m.estimatedWeight || 0),
      printTimeHours: Number(m.printTimeHours || 0)
    }))));
    fd.set("orderColor", pendingState.meta?.orderColor || "");
    fd.set("total", String(totalCost));
    fd.set("orderNumber", orderNumber);
    fd.set("ttn", ttn);
    fd.set("userName", profile.name);
    fd.set("userLastName", profile.lastName);
    fd.set("userMiddleName", profile.middleName);
    fd.set("userEmail", profile.email);
    fd.set("userPhone", profile.phone);
    fd.set("userDeliveryProvider", profile.delivery.provider);
    fd.set("userDeliveryType", profile.delivery.deliveryType);
    fd.set("userPaymentMethod", profile.delivery.paymentMethod);
    fd.set("userCity", profile.delivery.city);
    fd.set("userCityRef", profile.delivery.cityRef);
    fd.set("userBranchRef", profile.delivery.branch);
    fd.set("userDeliveryPoint", profile.delivery.deliveryType === "address" ? profile.delivery.address : profile.delivery.branchText);
    fd.set("userIsGuest", profile.id ? "0" : "1");
    if (profile.id) fd.set("userId", String(profile.id));
    if (profile.clientId) fd.set("userClientId", String(profile.clientId));

    const res = await fetch("/api/print3d/order", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Не вдалося оформити 3D-замовлення");

    await cleanupPending();
    showMessage("", false);
    renderItems();
    showOrderSuccessModal({
      orderNumber,
      ttn,
      total: totalCost,
      customer: profile,
      modelsMeta: models
    });
  } catch (error) {
    showMessage(error.message || "Не вдалося оформити замовлення");
  } finally {
    orderSubmitting = false;
    setSubmitLoading(false);
  }
}

async function bootstrapPending() {
  const raw = sessionStorage.getItem(PRINT3D_PENDING_KEY);
  if (!raw) {
    window.location.href = "order-3d-print.html";
    return false;
  }
  let parsed = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(PRINT3D_PENDING_KEY);
    window.location.href = "order-3d-print.html";
    return false;
  }
  const models = Array.isArray(parsed?.models) ? parsed.models : [];
  if (!models.length) {
    sessionStorage.removeItem(PRINT3D_PENDING_KEY);
    window.location.href = "order-3d-print.html";
    return false;
  }
  pendingState.meta = parsed;
  for (const m of models) {
    const row = await dbGet(m.fileKey);
    if (!row?.blob) continue;
    const file = new File([row.blob], row.name || m.name, { type: row.type || m.type || "application/octet-stream" });
    pendingState.files.set(m.fileKey, file);
  }
  return true;
}

document.addEventListener("DOMContentLoaded", async () => {
  const ready = await bootstrapPending();
  if (!ready) return;
  const profile = getProfile();
  fillForm(profile);
  if (typeof initCatalogCustomSelect === "function") {
    initCatalogCustomSelect("orderPaymentMethod");
    initCatalogCustomSelect("orderProvider");
    initCatalogCustomSelect("orderDeliveryType");
  }
  setupDeliveryUI();
  renderItems();
  bindCitySuggestionEvents();
  bindBranchSuggestionEvents();
  document.getElementById("orderCity").addEventListener("input", onCityInput);
  document.getElementById("orderCity").addEventListener("change", onCityChange);
  document.getElementById("orderCity").addEventListener("blur", onCityChange);
  document.getElementById("orderBranch").addEventListener("input", onBranchInput);
  document.getElementById("orderBranch").addEventListener("change", onBranchChange);
  document.getElementById("orderBranch").addEventListener("blur", onBranchChange);
  document.getElementById("orderBranch").addEventListener("focus", () => {
    if (branchOptions.length) onBranchInput();
  });
  document.getElementById("orderForm").addEventListener("submit", submitOrder);
  initOrderSuccessModalEvents();
});

