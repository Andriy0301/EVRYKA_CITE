const PROFILE_STORAGE_KEY = "userProfile";
const CHECKOUT_ITEMS_KEY = "checkoutItems";
let cityOptions = [];

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
  document.getElementById("orderPhone").value = profile?.phone || "";
  document.getElementById("orderEmail").value = profile?.email || "";
  document.getElementById("orderProvider").value = profile?.delivery?.provider || "nova_poshta";
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
  const cityRefEl = document.getElementById("orderCityRef");

  const applyVisibility = () => {
    const provider = providerEl.value;
    const deliveryType = deliveryTypeEl.value;
    const isNova = provider === "nova_poshta";

    deliveryTypeWrap.style.display = isNova ? "grid" : "none";
    cityEl.placeholder = isNova ? "Почніть вводити місто..." : "Місто";
    branchWrap.style.display = isNova && deliveryType === "address" ? "none" : "grid";
    addressWrap.style.display = isNova && deliveryType === "address" ? "grid" : "none";

    branchLabel.firstChild.textContent = deliveryType === "postomat" ? "Обрати поштомат" : "Обрати відділення";
    branchEl.required = isNova && deliveryType !== "address";
    addressEl.required = isNova && deliveryType === "address";

    if (!isNova) {
      cityRefEl.value = "";
      branchEl.innerHTML = `<option value="">Вкажіть відділення вручну</option>`;
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
  const listEl = document.getElementById("citySuggestions");
  const providerEl = document.getElementById("orderProvider");
  const query = cityEl.value.trim();

  if (providerEl.value !== "nova_poshta" || query.length < 2) return;

  try {
    cityOptions = await searchNovaPoshtaCities(query);
    listEl.innerHTML = cityOptions.map((city) => `<option value="${city.Present}"></option>`).join("");
  } catch (error) {
    showMessage(error.message || "Не вдалося знайти місто");
  }
}

async function onCityChange() {
  const cityEl = document.getElementById("orderCity");
  const cityRefEl = document.getElementById("orderCityRef");
  const providerEl = document.getElementById("orderProvider");
  const deliveryType = document.getElementById("orderDeliveryType").value;
  if (providerEl.value !== "nova_poshta") return;

  const selectedCity = cityOptions.find((city) => city.Present === cityEl.value.trim());
  cityRefEl.value = selectedCity?.Ref || "";
  if (selectedCity?.Ref) {
    await loadWarehouses(selectedCity.Ref, deliveryType);
  }
}

async function loadWarehouses(cityRef, deliveryType) {
  const branchEl = document.getElementById("orderBranch");
  if (!cityRef) return;
  branchEl.innerHTML = `<option value="">Завантаження...</option>`;
  try {
    const warehouses = await getNovaPoshtaWarehouses(cityRef, deliveryType);
    branchEl.innerHTML = [
      `<option value="">Оберіть зі списку</option>`,
      ...warehouses.map((w) => `<option value="${w.Ref}">${w.Description}</option>`)
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

  if (profile.delivery.provider === "nova_poshta") {
    if (!profile.delivery.cityRef) {
      showMessage("Оберіть місто зі списку Нової пошти");
      return;
    }
    if (profile.delivery.deliveryType === "address" && !profile.delivery.address) {
      showMessage("Вкажіть адресу доставки");
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
  document.getElementById("orderCity").addEventListener("input", onCityInput);
  document.getElementById("orderCity").addEventListener("change", onCityChange);
  document.getElementById("orderForm").addEventListener("submit", submitOrder);
});
