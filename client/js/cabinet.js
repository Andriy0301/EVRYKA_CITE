const PROFILE_STORAGE_KEY = "userProfile";
let cabCityOptions = [];
let cabBranchOptions = [];
let cabCityDropdownVisible = false;
let cabBranchDropdownVisible = false;
let cabCitySearchTimer = null;
let cabCitySelectionInProgress = false;

function getProfile() {
  return JSON.parse(localStorage.getItem(PROFILE_STORAGE_KEY) || "null");
}

function setProfile(profile) {
  localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

function showCabinetMessage(message = "", isError = true) {
  const el = document.getElementById("cabinetMessage");
  if (!el) return;
  el.innerText = message;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function renderInitials(profile) {
  const initialsEl = document.getElementById("authInitials");
  const authIcon = document.getElementById("authIcon");
  if (!initialsEl) return;
  const first = String(profile?.name || "").trim().charAt(0).toUpperCase();
  const second = String(profile?.lastName || "").trim().charAt(0).toUpperCase();
  const initials = `${first}${second || ""}`;
  if (!initials.trim()) {
    initialsEl.style.display = "none";
    initialsEl.innerText = "";
    if (authIcon) authIcon.style.display = "block";
    return;
  }
  initialsEl.innerText = initials;
  initialsEl.style.display = "flex";
  if (authIcon) authIcon.style.display = "none";
}

function capitalizeCityInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zа-яіїєґ])/giu, (match, separator, letter) => `${separator}${letter.toUpperCase()}`);
}

function fillCabinet(profile) {
  document.getElementById("cabName").value = profile?.name || "";
  document.getElementById("cabLastName").value = profile?.lastName || "";
  document.getElementById("cabPhone").value = profile?.phone || "";
  document.getElementById("cabEmail").value = profile?.email || "";
  document.getElementById("cabProvider").value = profile?.delivery?.provider || "nova_poshta";
  document.getElementById("cabDeliveryType").value = profile?.delivery?.deliveryType || "warehouse";
  document.getElementById("cabCity").value = profile?.delivery?.city || "";
  document.getElementById("cabCityRef").value = profile?.delivery?.cityRef || "";
  document.getElementById("cabBranch").value = profile?.delivery?.branchText || profile?.delivery?.branch || "";
  document.getElementById("cabBranchRef").value = profile?.delivery?.branch || "";
  document.getElementById("cabAddress").value = profile?.delivery?.address || "";
}

function setupCabinetDeliveryUI() {
  const providerEl = document.getElementById("cabProvider");
  const deliveryTypeEl = document.getElementById("cabDeliveryType");
  const deliveryTypeWrap = document.getElementById("cabDeliveryTypeWrap");
  const cityWrap = document.getElementById("cabCityWrap");
  const cityEl = document.getElementById("cabCity");
  const cityRefEl = document.getElementById("cabCityRef");
  const branchWrap = document.getElementById("cabBranchWrap");
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  const addressWrap = document.getElementById("cabAddressWrap");
  const addressEl = document.getElementById("cabAddress");

  const applyVisibility = () => {
    const provider = providerEl.value;
    const deliveryType = deliveryTypeEl.value;
    const isNova = provider === "nova_poshta";

    deliveryTypeWrap.style.display = isNova ? "grid" : "none";
    cityWrap.style.display = "grid";
    branchWrap.style.display = isNova && deliveryType === "address" ? "none" : "grid";
    addressWrap.style.display = isNova && deliveryType === "address" ? "grid" : "none";
    cityEl.placeholder = isNova ? "Почніть вводити місто..." : "Місто";
    branchWrap.firstChild.textContent = deliveryType === "postomat" ? "Обрати поштомат" : "Обрати відділення";
    branchEl.placeholder = deliveryType === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    branchEl.required = isNova && deliveryType !== "address";
    addressEl.required = isNova && deliveryType === "address";

    if (!isNova) {
      cityRefEl.value = "";
      branchRefEl.value = "";
      cabBranchOptions = [];
      renderCabBranchSuggestions([]);
    }
  };

  providerEl.addEventListener("change", applyVisibility);
  deliveryTypeEl.addEventListener("change", async () => {
    branchRefEl.value = "";
    branchEl.value = "";
    cabBranchOptions = [];
    renderCabBranchSuggestions([]);
    applyVisibility();
    if (providerEl.value === "nova_poshta" && cityRefEl.value) {
      await loadCabWarehouses(cityRefEl.value, deliveryTypeEl.value);
    }
  });
  applyVisibility();
}

function renderCabCitySuggestions(options) {
  const listEl = document.getElementById("cabCitySuggestions");
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    cabCityDropdownVisible = false;
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
  cabCityDropdownVisible = true;
}

function renderCabBranchSuggestions(options) {
  const listEl = document.getElementById("cabBranchSuggestions");
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    cabBranchDropdownVisible = false;
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
  cabBranchDropdownVisible = true;
}

async function onCabCityInput() {
  const providerEl = document.getElementById("cabProvider");
  const cityEl = document.getElementById("cabCity");
  const cityRefEl = document.getElementById("cabCityRef");
  const normalized = capitalizeCityInput(cityEl.value);
  if (normalized !== cityEl.value) cityEl.value = normalized;
  const query = normalized.trim();
  cityRefEl.value = "";

  if (cabCitySearchTimer) clearTimeout(cabCitySearchTimer);
  if (providerEl.value !== "nova_poshta" || query.length < 1) {
    renderCabCitySuggestions([]);
    return;
  }

  cabCitySearchTimer = setTimeout(async () => {
    try {
      cabCityOptions = await searchNovaPoshtaCities(query);
      renderCabCitySuggestions(cabCityOptions);
    } catch (_) {
      renderCabCitySuggestions([]);
    }
  }, 80);
}

async function onCabCityChange() {
  if (cabCitySelectionInProgress) return;
  const providerEl = document.getElementById("cabProvider");
  if (providerEl.value !== "nova_poshta") return;

  const cityEl = document.getElementById("cabCity");
  const cityRefEl = document.getElementById("cabCityRef");
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  const deliveryType = document.getElementById("cabDeliveryType").value;
  const normalized = capitalizeCityInput(cityEl.value.trim());
  cityEl.value = normalized;

  let selectedCity = cabCityOptions.find((city) => city.Present === normalized);
  if (!selectedCity && normalized.length >= 2) {
    try {
      const fresh = await searchNovaPoshtaCities(normalized);
      cabCityOptions = fresh;
      selectedCity =
        fresh.find((city) => city.Present === normalized) ||
        fresh.find((city) => city.Present.toLowerCase().startsWith(normalized.toLowerCase()));
    } catch (_) {}
  }

  const ref = selectedCity?.DeliveryCity || selectedCity?.Ref || "";
  cityRefEl.value = ref;
  if (ref) {
    cityEl.value = selectedCity.Present;
    renderCabCitySuggestions([]);
    await loadCabWarehouses(ref, deliveryType);
  } else {
    branchRefEl.value = "";
    branchEl.value = "";
    branchEl.placeholder = "Спочатку оберіть місто зі списку";
    cabBranchOptions = [];
    renderCabBranchSuggestions([]);
  }
}

async function loadCabWarehouses(cityRef, deliveryType) {
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  branchRefEl.value = "";
  branchEl.value = "";
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
    cabBranchOptions = filtered;
    branchEl.placeholder = deliveryType === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    renderCabBranchSuggestions(filtered);
  } catch (_) {
    cabBranchOptions = [];
    branchEl.placeholder = "Не вдалося завантажити";
    renderCabBranchSuggestions([]);
  }
}

function onCabBranchInput() {
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  branchRefEl.value = "";
  if (!cabBranchOptions.length) {
    renderCabBranchSuggestions([]);
    return;
  }
  if (!query) {
    renderCabBranchSuggestions(cabBranchOptions);
    return;
  }
  renderCabBranchSuggestions(
    cabBranchOptions.filter((w) => (w.Description || "").toLowerCase().includes(query))
  );
}

function onCabBranchChange() {
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  const selected =
    cabBranchOptions.find((w) => (w.Description || "").toLowerCase() === query) ||
    cabBranchOptions.find((w) => (w.Description || "").toLowerCase().includes(query));
  if (selected) {
    branchEl.value = selected.Description;
    branchRefEl.value = selected.Ref;
  }
  renderCabBranchSuggestions([]);
}

function bindCabinetSuggestionEvents() {
  const cityList = document.getElementById("cabCitySuggestions");
  const cityEl = document.getElementById("cabCity");
  const cityRefEl = document.getElementById("cabCityRef");
  const deliveryTypeEl = document.getElementById("cabDeliveryType");

  cityList.addEventListener("mousedown", async (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn) return;
    event.preventDefault();
    cabCitySelectionInProgress = true;
    cityEl.value = btn.dataset.name || "";
    cityRefEl.value = btn.dataset.ref || "";
    renderCabCitySuggestions([]);
    await loadCabWarehouses(cityRefEl.value, deliveryTypeEl.value);
    setTimeout(() => {
      cabCitySelectionInProgress = false;
    }, 0);
  });

  const branchList = document.getElementById("cabBranchSuggestions");
  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  branchList.addEventListener("mousedown", (event) => {
    const btn = event.target.closest(".city-suggestion-item");
    if (!btn) return;
    event.preventDefault();
    branchEl.value = btn.dataset.name || "";
    branchRefEl.value = btn.dataset.ref || "";
    renderCabBranchSuggestions([]);
  });

  document.addEventListener("click", (event) => {
    const cityWrap = document.getElementById("cabCityWrap");
    const branchWrap = document.getElementById("cabBranchWrap");
    if (!cityWrap.contains(event.target) && cabCityDropdownVisible) {
      renderCabCitySuggestions([]);
    }
    if (!branchWrap.contains(event.target) && cabBranchDropdownVisible) {
      renderCabBranchSuggestions([]);
    }
  });
}

async function saveCabinet(e) {
  e.preventDefault();
  const current = getProfile();
  if (!current?.id && !current?.email && !current?.phone) {
    showCabinetMessage("Потрібно увійти в акаунт повторно");
    return;
  }

  const name = document.getElementById("cabName").value.trim();
  const lastName = document.getElementById("cabLastName").value.trim();
  const phone = document.getElementById("cabPhone").value.trim();
  const email = (document.getElementById("cabEmail").value || current?.email || "").trim();

  if (!name || !lastName || !phone || !email) {
    showCabinetMessage("Обов'язкові поля: ім'я, прізвище, телефон, email");
    return;
  }

  const payload = {
    id: current.id,
    email: email,
    name: name,
    lastName: lastName,
    phone: phone,
    delivery: {
      provider: document.getElementById("cabProvider").value,
      deliveryType: document.getElementById("cabDeliveryType").value,
      city: document.getElementById("cabCity").value.trim(),
      cityRef: document.getElementById("cabCityRef").value.trim(),
      branch: document.getElementById("cabBranchRef").value.trim(),
      branchText: document.getElementById("cabBranch").value.trim(),
      address: document.getElementById("cabAddress").value.trim()
    }
  };

  try {
    const updated = await updateUserProfile(payload);
    setProfile(updated);
    renderInitials(updated);
    showCabinetMessage("Дані профілю збережено", false);
  } catch (error) {
    console.error("Не вдалося зберегти профіль", error);
    showCabinetMessage(error.message || "Не вдалося зберегти зміни профілю");
  }
}

function logout() {
  localStorage.removeItem(PROFILE_STORAGE_KEY);
  window.location.href = "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const profile = getProfile();
  if (!profile?.id) {
    window.location.href = "index.html";
    return;
  }

  fillCabinet(profile);
  setupCabinetDeliveryUI();
  bindCabinetSuggestionEvents();
  document.getElementById("cabCity").addEventListener("input", onCabCityInput);
  document.getElementById("cabCity").addEventListener("change", onCabCityChange);
  document.getElementById("cabCity").addEventListener("blur", onCabCityChange);
  document.getElementById("cabBranch").addEventListener("input", onCabBranchInput);
  document.getElementById("cabBranch").addEventListener("change", onCabBranchChange);
  document.getElementById("cabBranch").addEventListener("blur", onCabBranchChange);
  document.getElementById("cabBranch").addEventListener("focus", () => {
    if (cabBranchOptions.length) onCabBranchInput();
  });
  renderInitials(profile);
  const authBtn = document.getElementById("authBtn");
  if (authBtn) authBtn.addEventListener("click", () => window.location.href = "cabinet.html");
  document.getElementById("cabinetForm").addEventListener("submit", saveCabinet);
  document.getElementById("logoutBtn").addEventListener("click", logout);
});
