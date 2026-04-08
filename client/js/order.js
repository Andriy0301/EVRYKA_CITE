const PROFILE_STORAGE_KEY = "userProfile";
const CHECKOUT_ITEMS_KEY = "checkoutItems";
let cityOptions = [];
let cityDropdownVisible = false;
let citySearchTimer = null;

function capitalizeCityInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zа-яіїєґ])/giu, (match, separator, letter) => {
      return `${separator}${letter.toUpperCase()}`;
    });
}

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function getCheckoutItems() {
  const direct = JSON.parse(localStorage.getItem(CHECKOUT_ITEMS_KEY) || "[]");
  if (direct.length) return direct;
  return JSON.parse(localStorage.getItem("cart") || "[]");
}

function fillForm(profile) {
  document.getElementById("orderName").value = profile?.name || "";
  document.getElementById("orderLastName").value = profile?.lastName || "";
  document.getElementById("orderMiddleName").value = profile?.middleName || "";
  document.getElementById("orderPhone").value = profile?.phone || "";
  document.getElementById("orderEmail").value = profile?.email || "";
  document.getElementById("orderProvider").value = profile?.delivery?.provider || "";
  document.getElementById("orderDeliveryType").value = profile?.delivery?.deliveryType || "warehouse";
  document.getElementById("orderCity").value = profile?.delivery?.city || "";
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
    row.className = "favorite-item";
    row.innerHTML = `
      <img src="${API_URL}${item.image || item.images?.[0] || ""}" alt="${item.name}">
      <div style="flex:1;">
        <h4 style="margin:0 0 4px;">${item.name}</h4>
        <p style="margin:0;">${item.price} грн x ${qty}</p>
      </div>
    `;
    container.appendChild(row);
  });

  totalEl.innerText = total;
}

function showMessage(msg, isError = true) {
  const el = document.getElementById("orderMessage");
  el.innerText = msg;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function setupDeliveryUI() {
  const providerEl = document.getElementById("orderProvider");
  const deliveryTypeEl = document.getElementById("orderDeliveryType");
  const deliveryTypeWrap = document.getElementById("deliveryTypeWrap");
  const branchWrap = document.getElementById("branchWrap");
  const branchLabel = branchWrap.querySelector("label") || branchWrap;
  const branchEl = document.getElementById("orderBranch");
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

    branchLabel.firstChild.textContent = deliveryType === "postomat" ? "Обрати поштомат" : "Обрати відділення";
    branchEl.required = isNova && deliveryType !== "address";
    addressEl.required = isNova && deliveryType === "address";
    middleNameEl.required = isNova && deliveryType === "address";

    if (!isNova) {
      cityRefEl.value = "";
      branchEl.innerHTML = `<option value="">Вкажіть відділення вручну</option>`;
    }

    if (!hasProvider) {
      cityRefEl.value = "";
      cityEl.value = "";
      addressEl.value = "";
      middleNameEl.value = "";
      branchEl.innerHTML = `<option value="">Спочатку оберіть службу доставки</option>`;
      renderCitySuggestions([]);
    }
  };

  providerEl.addEventListener("change", applyVisibility);
  deliveryTypeEl.addEventListener("change", async () => {
    applyVisibility();
    if (providerEl.value === "nova_poshta" && cityRefEl.value) {
      await loadWarehouses(cityRefEl.value, deliveryTypeEl.value);
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

  if (providerEl.value !== "nova_poshta" || query.length < 3) {
    renderCitySuggestions([]);
    return;
  }

  citySearchTimer = setTimeout(async () => {
    try {
      cityOptions = await searchNovaPoshtaCities(query);
      renderCitySuggestions(cityOptions);
    } catch (error) {
      renderCitySuggestions([]);
      showMessage(error.message || "Не вдалося знайти місто");
    }
  }, 350);
}

async function onCityChange() {
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

  cityRefEl.value = selectedCity?.Ref || "";
  if (selectedCity?.Ref) {
    cityEl.value = selectedCity.Present;
    renderCitySuggestions([]);
    await loadWarehouses(selectedCity.Ref, deliveryType);
  } else {
    renderCitySuggestions([]);
    document.getElementById("orderBranch").innerHTML = `<option value="">Спочатку оберіть місто зі списку</option>`;
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
        `<button type="button" class="city-suggestion-item" data-ref="${city.Ref}" data-name="${city.Present}">${city.Present}</button>`
    )
    .join("");

  listEl.style.display = "block";
  cityDropdownVisible = true;
}

function bindCitySuggestionEvents() {
  const listEl = document.getElementById("citySuggestions");
  const cityEl = document.getElementById("orderCity");
  const cityRefEl = document.getElementById("orderCityRef");
  const deliveryTypeEl = document.getElementById("orderDeliveryType");

  listEl.addEventListener("click", async (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn) return;

    const cityName = btn.dataset.name || "";
    const cityRef = btn.dataset.ref || "";
    cityEl.value = cityName;
    cityRefEl.value = cityRef;
    renderCitySuggestions([]);
    await loadWarehouses(cityRef, deliveryTypeEl.value);
  });

  document.addEventListener("click", (event) => {
    const wrap = document.getElementById("cityWrap");
    if (!wrap.contains(event.target) && cityDropdownVisible) {
      renderCitySuggestions([]);
    }
  });
}

async function loadWarehouses(cityRef, deliveryType) {
  const branchEl = document.getElementById("orderBranch");
  if (!cityRef) return;
  branchEl.innerHTML = `<option value="">Завантаження...</option>`;
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
      branchEl.innerHTML = `<option value="">Немає доступних точок</option>`;
      return;
    }

    branchEl.innerHTML = [
      `<option value="">Оберіть зі списку</option>`,
      ...filtered.map((w) => `<option value="${w.Ref}">${w.Description}</option>`)
    ].join("");
  } catch (error) {
    branchEl.innerHTML = `<option value="">Не вдалося завантажити</option>`;
    showMessage(error.message || "Помилка завантаження відділень");
  }
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
      city: document.getElementById("orderCity").value.trim(),
      cityRef: document.getElementById("orderCityRef").value.trim(),
      branch: document.getElementById("orderBranch").value.trim(),
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
    if (profile.id) {
      const updated = await updateUserProfile(profile);
      setProfile(updated);
    } else {
      setProfile(profile);
    }

    if (profile.delivery.provider === "nova_poshta") {
      const totalCost = items.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 1), 0);
      const ttnResult = await createNovaPoshtaTtn({
        recipientName: profile.name,
        recipientLastName: profile.lastName,
        recipientMiddleName: profile.middleName,
        recipientPhone: profile.phone,
        cityRef: profile.delivery.cityRef,
        warehouseRef: profile.delivery.branch,
        address: profile.delivery.address,
        deliveryType: profile.delivery.deliveryType,
        cost: totalCost,
        cargoDescription: items.slice(0, 3).map((item) => item.name).join(", ")
      });
      showMessage(`Замовлення оформлено. ТТН: ${ttnResult.ttn}`, false);
    } else {
      showMessage("Замовлення оформлено успішно", false);
    }

    await trackPopularity(items.map((item) => ({ productId: item.id, qty: item.qty || 1 })));
    localStorage.removeItem(CHECKOUT_ITEMS_KEY);
    localStorage.removeItem("cart");
  } catch (error) {
    showMessage(error.message || "Не вдалося оформити замовлення");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const items = getCheckoutItems();
  fillForm(getProfile());
  setupDeliveryUI();
  renderItems(items);
  bindCitySuggestionEvents();
  document.getElementById("orderCity").addEventListener("input", onCityInput);
  document.getElementById("orderCity").addEventListener("change", onCityChange);
  document.getElementById("orderCity").addEventListener("blur", onCityChange);
  document.getElementById("orderForm").addEventListener("submit", submitOrder);
});
