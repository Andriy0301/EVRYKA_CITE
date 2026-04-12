const ORDER_PROFILE_STORAGE_KEY = "userProfile";
const ORDER_CHECKOUT_ITEMS_KEY = "checkoutItems";
let cityOptions = [];
let cityDropdownVisible = false;
let citySearchTimer = null;
let citySelectionInProgress = false;
let branchOptions = [];
let branchDropdownVisible = false;

function capitalizeCityInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zа-яіїєґ])/giu, (match, separator, letter) => {
      return `${separator}${letter.toUpperCase()}`;
    });
}

function getProfile() {
  return JSON.parse(localStorage.getItem(ORDER_PROFILE_STORAGE_KEY) || "null");
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
  localStorage.setItem(ORDER_PROFILE_STORAGE_KEY, JSON.stringify(merged));
}

function getCheckoutItems() {
  const direct = JSON.parse(localStorage.getItem(ORDER_CHECKOUT_ITEMS_KEY) || "[]");
  if (direct.length) return direct;
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function saveCheckoutItems(items) {
  const normalized = (items || [])
    .map((item) => ({
      ...item,
      qty: Math.max(1, Number(item.qty || 1))
    }))
    .filter((item) => Number(item.qty || 0) > 0);

  localStorage.setItem(ORDER_CHECKOUT_ITEMS_KEY, JSON.stringify(normalized));
  return normalized;
}

function getOrderItemImage(item) {
  const candidate = item?.image || item?.images?.[0] || "";
  if (!candidate) return "images/favicon.png";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${API_URL}${candidate}`;
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

function renderItems(items) {
  const container = document.getElementById("orderItems");
  const totalEl = document.getElementById("orderTotal");
  container.innerHTML = "";
  let total = 0;

  items.forEach((item) => {
    const qty = Number(item.qty || 1);
    total += Number(item.price || 0) * qty;
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <img src="${getOrderItemImage(item)}" alt="${item.name}">
      <div style="flex:1;">
        <h4 style="margin:0 0 4px;">${item.name}</h4>
        <p style="margin:0 0 8px;">${item.price} грн x ${qty}</p>
        <div class="qty-wrapper order-qty-wrapper">
          <button type="button" class="qty-btn order-qty-minus" data-id="${item.id}" aria-label="Зменшити кількість">
            <svg viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
          </button>
          <span class="order-qty-value">${qty}</span>
          <button type="button" class="qty-btn order-qty-plus" data-id="${item.id}" aria-label="Збільшити кількість">
            <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </div>
      <button type="button" class="favorite-remove-btn order-remove-btn" data-id="${item.id}">✖</button>
    `;
    container.appendChild(row);
  });

  totalEl.innerText = total;

  container.querySelectorAll(".order-qty-minus").forEach((btn) => {
    btn.addEventListener("click", () => changeOrderItemQty(btn.dataset.id, -1));
  });
  container.querySelectorAll(".order-qty-plus").forEach((btn) => {
    btn.addEventListener("click", () => changeOrderItemQty(btn.dataset.id, 1));
  });
  container.querySelectorAll(".order-remove-btn").forEach((btn) => {
    btn.addEventListener("click", () => removeOrderItem(btn.dataset.id));
  });
}

function changeOrderItemQty(itemId, delta) {
  const items = getCheckoutItems();
  const index = items.findIndex((item) => String(item.id) === String(itemId));
  if (index < 0) return;

  const nextQty = Number(items[index].qty || 1) + Number(delta || 0);
  if (nextQty <= 0) {
    items.splice(index, 1);
  } else {
    items[index].qty = nextQty;
  }

  const updated = saveCheckoutItems(items);
  renderItems(updated);
}

function removeOrderItem(itemId) {
  const items = getCheckoutItems().filter((item) => String(item.id) !== String(itemId));
  const updated = saveCheckoutItems(items);
  renderItems(updated);
}

function showMessage(msg, isError = true) {
  const el = document.getElementById("orderMessage");
  el.innerText = msg;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
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

function escapeOrderHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildOrderSuccessDetails(order) {
  const customer = order?.customer || {};
  const delivery = customer?.delivery || {};
  const items = Array.isArray(order?.items) ? order.items : [];
  const itemsHtml = items
    .map((item) => {
      const nameSafe = escapeOrderHtml(item.name);
      const src = getOrderItemImage(item);
      const sum = Number(item.price || 0) * Number(item.qty || 1);
      return `
        <li class="order-success-item">
          <img class="order-success-item-thumb" src="${src}" alt="${nameSafe}" loading="lazy">
          <span class="order-success-item-text">${nameSafe} x ${item.qty} — ${sum} грн</span>
        </li>`;
    })
    .join("");

  return `
    <p><b>ПІБ:</b> ${customer.lastName || ""} ${customer.name || ""} ${customer.middleName || ""}</p>
    <p><b>Телефон:</b> ${customer.phone || "-"}</p>
    <p><b>Email:</b> ${customer.email || "-"}</p>
    <p><b>Служба доставки:</b> ${getProviderTitle(delivery.provider)}</p>
    <p><b>Тип доставки:</b> ${getDeliveryTypeTitle(delivery.deliveryType)}</p>
    <p><b>Оплата:</b> ${getPaymentMethodTitle(delivery.paymentMethod)}</p>
    <p><b>Місто:</b> ${delivery.city || "-"}</p>
    <p><b>Відділення/поштомат:</b> ${delivery.branchText || "-"}</p>
    <p><b>Адреса:</b> ${delivery.address || "-"}</p>
    ${order?.ttn ? `<p><b>ТТН:</b> ${order.ttn}</p>` : ""}
    <p><b>Сума:</b> ${order?.total || 0} грн</p>
    <p><b>Товари:</b></p>
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
  if (!modal) return;
  modal.style.display = "none";
  window.location.href = "index.html";
}

function initOrderSuccessModalEvents() {
  const modal = document.getElementById("orderSuccessModal");
  if (!modal) return;
  modal.addEventListener("click", (event) => {
    if (event.target === modal) {
      closeOrderSuccessModal();
    }
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

    if (!hasProvider) {
      cityRefEl.value = "";
      cityEl.value = "";
      addressEl.value = "";
      middleNameEl.value = "";
      branchRefEl.value = "";
      branchEl.value = "";
      branchEl.placeholder = "Спочатку оберіть службу доставки";
      branchOptions = [];
      renderBranchSuggestions([]);
      renderCitySuggestions([]);
    }
  };

  providerEl.addEventListener("change", applyVisibility);
  deliveryTypeEl.addEventListener("change", async () => {
    const branchEl = document.getElementById("orderBranch");
    const branchRefEl = document.getElementById("orderBranchRef");
    branchEl.value = "";
    branchRefEl.value = "";
    branchOptions = [];
    renderBranchSuggestions([]);
    branchEl.placeholder = deliveryTypeEl.value === "postomat"
      ? "Почніть вводити поштомат..."
      : "Почніть вводити відділення...";

    applyVisibility();
    if (providerEl.value === "nova_poshta" && cityRefEl.value) {
      await loadWarehouses(cityRefEl.value, deliveryTypeEl.value);
      branchEl.focus();
      onBranchInput();
    } else {
      branchEl.placeholder = "Спочатку оберіть місто зі списку";
    }
  });
  applyVisibility();
}

async function onCityInput() {
  const cityEl = document.getElementById("orderCity");
  const providerEl = document.getElementById("orderProvider");
  const cityRefEl = document.getElementById("orderCityRef");
  const normalized = capitalizeCityInput(cityEl.value);
  if (cityEl.value !== normalized) {
    cityEl.value = normalized;
  }
  const query = normalized.trim();
  cityRefEl.value = "";

  if (citySearchTimer) {
    clearTimeout(citySearchTimer);
  }

  if (providerEl.value !== "nova_poshta" || query.length < 1) {
    renderCitySuggestions([]);
    return;
  }

  // Показуємо дропдаун одразу, без очікування відповіді API.
  const instantMatches = cityOptions.filter((city) =>
    String(city.Present || "").toLowerCase().includes(query.toLowerCase())
  );
  if (instantMatches.length) {
    renderCitySuggestions(instantMatches);
  } else {
    renderCityLoading();
  }

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
      selectedCity =
        freshCities.find((city) => city.Present === normalizedInput) ||
        freshCities.find((city) => city.Present.toLowerCase().startsWith(normalizedInput.toLowerCase()));
    } catch (error) {
      showMessage(error.message || "Не вдалося знайти місто");
    }
  }

  const selectedCityRef = selectedCity?.DeliveryCity || selectedCity?.Ref || "";
  cityRefEl.value = selectedCityRef;
  if (selectedCityRef) {
    cityEl.value = selectedCity.Present;
    renderCitySuggestions([]);
    await loadWarehouses(selectedCityRef, deliveryType);
  } else {
    renderCitySuggestions([]);
    const branchEl = document.getElementById("orderBranch");
    const branchRefEl = document.getElementById("orderBranchRef");
    branchRefEl.value = "";
    branchEl.value = "";
    branchEl.placeholder = "Спочатку оберіть місто зі списку";
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

  listEl.innerHTML = options
    .slice(0, 8)
    .map(
      (city) =>
        `<button type="button" class="city-suggestion-item" data-ref="${city.DeliveryCity || city.Ref}" data-name="${city.Present}">${city.Present}</button>`
    )
    .join("");

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

    const cityName = btn.dataset.name || "";
    const cityRef = btn.dataset.ref || "";
    cityEl.value = cityName;
    cityRefEl.value = cityRef;
    renderCitySuggestions([]);
    await loadWarehouses(cityRef, deliveryTypeEl.value);

    // Даємо завершитися blur/change і повертаємо нормальний стан.
    setTimeout(() => {
      citySelectionInProgress = false;
    }, 0);
  });

  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("cityWrap");
    if (!wrap.contains(event.target) && cityDropdownVisible) {
      renderCitySuggestions([]);
    }
  });
}

async function loadWarehouses(cityRef, deliveryType, options = {}) {
  const preserveSelection = Boolean(options?.preserveSelection);
  const preselectedBranchRef = String(options?.preselectedBranchRef || "").trim();
  const preselectedBranchText = String(options?.preselectedBranchText || "").trim();
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  if (!cityRef) return;
  if (!preserveSelection) {
    branchRefEl.value = "";
    branchEl.value = "";
  }
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

    if (!filtered.length) {
      branchOptions = [];
      branchEl.value = "";
      branchEl.placeholder = "Немає доступних точок";
      renderBranchSuggestions([]);
      return;
    }

    branchOptions = filtered;
    branchEl.placeholder = "Почніть вводити відділення...";

    if (preserveSelection && preselectedBranchRef) {
      const matched =
        filtered.find((w) => String(w.Ref || "") === preselectedBranchRef) ||
        filtered.find((w) => String(w.Description || "").trim() === preselectedBranchText);
      if (matched) {
        branchRefEl.value = matched.Ref;
        branchEl.value = matched.Description;
      }
    }

    renderBranchSuggestions(branchOptions);
  } catch (error) {
    branchOptions = [];
    branchEl.value = "";
    branchEl.placeholder = "Не вдалося завантажити";
    renderBranchSuggestions([]);
    showMessage(error.message || "Помилка завантаження відділень");
  }
}

function hydratePrefilledNovaDelivery(profile) {
  const provider = String(profile?.delivery?.provider || "").trim();
  const cityRef = String(profile?.delivery?.cityRef || "").trim();
  if (provider !== "nova_poshta" || !cityRef) return;

  loadWarehouses(cityRef, document.getElementById("orderDeliveryType").value, {
    preserveSelection: true,
    preselectedBranchRef: profile?.delivery?.branch,
    preselectedBranchText: profile?.delivery?.branchText
  });
}

function renderBranchSuggestions(options) {
  const listEl = document.getElementById("branchSuggestions");
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    branchDropdownVisible = false;
    return;
  }

  listEl.innerHTML = options
    .slice(0, 14)
    .map(
      (w) =>
        `<button type="button" class="city-suggestion-item" data-ref="${w.Ref}" data-name="${w.Description}">${w.Description}</button>`
    )
    .join("");
  listEl.style.display = "block";
  branchDropdownVisible = true;
}

function onBranchInput() {
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  branchRefEl.value = "";

  if (!branchOptions.length) {
    renderBranchSuggestions([]);
    return;
  }

  if (!query) {
    renderBranchSuggestions(branchOptions);
    return;
  }

  const filtered = branchOptions.filter((w) => (w.Description || "").toLowerCase().includes(query));
  renderBranchSuggestions(filtered);
}

function onBranchChange() {
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  const selected =
    branchOptions.find((w) => (w.Description || "").toLowerCase() === query) ||
    branchOptions.find((w) => (w.Description || "").toLowerCase().includes(query));
  if (selected) {
    branchEl.value = selected.Description;
    branchRefEl.value = selected.Ref;
  }
  renderBranchSuggestions([]);
}

function bindBranchSuggestionEvents() {
  const listEl = document.getElementById("branchSuggestions");
  const branchEl = document.getElementById("orderBranch");
  const branchRefEl = document.getElementById("orderBranchRef");

  listEl.addEventListener("click", (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn) return;
    branchEl.value = btn.dataset.name || "";
    branchRefEl.value = btn.dataset.ref || "";
    renderBranchSuggestions([]);
  });

  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("branchWrap");
    if (!wrap.contains(event.target) && branchDropdownVisible) {
      renderBranchSuggestions([]);
    }
  });
}

async function submitOrder(e) {
  e.preventDefault();
  const items = getCheckoutItems();
  if (!items.length) {
    showMessage("Немає товарів для оформлення");
    return;
  }

  const profile = {
    id: getProfile()?.id,
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

  if (!profile.name || !profile.lastName || !profile.phone || !profile.email) {
    showMessage("Заповніть контактні дані");
    return;
  }

  if (!profile.delivery.provider) {
    showMessage("Оберіть службу доставки");
    return;
  }

  if (profile.delivery.provider === "nova_poshta") {
    if (!profile.delivery.cityRef) {
      showMessage("Оберіть місто зі списку Нової пошти");
      return;
    }
    if (profile.delivery.deliveryType === "address" && !profile.delivery.address) {
      showMessage("Вкажіть адресу доставки");
      return;
    }
    if (profile.delivery.deliveryType === "address" && !profile.middleName) {
      showMessage("Вкажіть по батькові для адресної доставки");
      return;
    }
    if (profile.delivery.deliveryType !== "address" && !profile.delivery.branch) {
      showMessage("Оберіть відділення або поштомат");
      return;
    }
  }

  try {
    const totalCost = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
    let ttn = "";
    const orderNumber = `EVR-${Date.now().toString().slice(-8)}`;
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
        warehouseRef: profile.delivery.branch,
        address: profile.delivery.address,
        deliveryType: profile.delivery.deliveryType,
        paymentMethod: profile.delivery.paymentMethod,
        orderNumber,
        cost: totalCost,
        cargoDescription: items.slice(0, 3).map((item) => item.name).join(", ")
      });
      ttn = ttnResult.ttn || "";
    }

    const savedOrder = await createOrder({
      customer: profile,
      items,
      orderNumber,
      total: totalCost,
      ttn
    });

    showMessage("", false);
    await trackPopularity(items.map((item) => ({ productId: item.id, qty: item.qty || 1 })));
    localStorage.removeItem(ORDER_CHECKOUT_ITEMS_KEY);
    localStorage.removeItem("cart");
    if (typeof saveUserCart === "function") {
      await saveUserCart(profile, []);
    }
    if (typeof updateCart === "function") {
      updateCart();
    }
    renderItems([]);
    showOrderSuccessModal(savedOrder);
  } catch (error) {
    showMessage(error.message || "Не вдалося оформити замовлення");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const profile = getProfile();
  const items = getCheckoutItems();
  fillForm(profile);
  if (typeof initCatalogCustomSelect === "function") {
    initCatalogCustomSelect("orderPaymentMethod");
    initCatalogCustomSelect("orderProvider");
    initCatalogCustomSelect("orderDeliveryType");
  }
  setupDeliveryUI();
  hydratePrefilledNovaDelivery(profile);
  renderItems(items);
  bindCitySuggestionEvents();
  bindBranchSuggestionEvents();
  const cityInput = document.getElementById("orderCity");
  cityInput.addEventListener("input", onCityInput);
  cityInput.addEventListener("focus", () => {
    if (cityInput.value.trim().length >= 1) {
      onCityInput();
    }
  });
  document.getElementById("orderCity").addEventListener("change", onCityChange);
  document.getElementById("orderCity").addEventListener("blur", onCityChange);
  const branchInput = document.getElementById("orderBranch");
  branchInput.addEventListener("input", onBranchInput);
  branchInput.addEventListener("change", onBranchChange);
  branchInput.addEventListener("blur", onBranchChange);
  branchInput.addEventListener("focus", () => {
    if (branchOptions.length) {
      onBranchInput();
    }
  });
  document.getElementById("orderForm").addEventListener("submit", submitOrder);
  initOrderSuccessModalEvents();
});
