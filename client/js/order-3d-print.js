/**
 * Замовити 3D-друк — мультизавантаження моделей з окремим прев'ю та ціною.
 */

const THREE_BASE = "https://esm.sh/three@0.170.0";
const API_ANALYZE = "/api/print3d/analyze-model";
const API_REQUEST = "/api/print3d/request";
const API_ORDER = "/api/print3d/order";
const MAX_BYTES = 50 * 1024 * 1024;
const DEBOUNCE_MS = 400;

let threeMods = null;
let debounceTimer = null;
let modelSeq = 1;
const modelItems = [];
let pendingOrderState = null;
let checkoutCityOptions = [];
let checkoutCityDropdownVisible = false;
let checkoutCitySearchTimer = null;
let checkoutCitySelectionInProgress = false;
let checkoutBranchOptions = [];
let checkoutBranchDropdownVisible = false;
let checkoutBranchSelectionInProgress = false;
const COLOR_PRESETS = [
  { id: "white", name: "Білий", hex: "#f5f5f4" },
  { id: "black", name: "Чорний", hex: "#222222" },
  { id: "gray", name: "Сірий", hex: "#9ca3af" },
  { id: "red", name: "Червоний", hex: "#dc2626" },
  { id: "blue", name: "Синій", hex: "#2563eb" },
  { id: "green", name: "Зелений", hex: "#16a34a" },
  { id: "yellow", name: "Жовтий", hex: "#facc15" },
  { id: "orange", name: "Помаранчевий", hex: "#f59e0b" }
];
const DEFAULT_COLOR = COLOR_PRESETS[7].hex;

async function loadThreeMods() {
  if (threeMods) return threeMods;
  const THREE = await import(THREE_BASE);
  const { STLLoader } = await import(`${THREE_BASE}/examples/jsm/loaders/STLLoader.js`);
  const { OBJLoader } = await import(`${THREE_BASE}/examples/jsm/loaders/OBJLoader.js`);
  const { OrbitControls } = await import(`${THREE_BASE}/examples/jsm/controls/OrbitControls.js`);
  threeMods = { THREE, STLLoader, OBJLoader, OrbitControls };
  return threeMods;
}

function extOf(name) {
  const n = String(name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : "";
}

function getClientProfile() {
  try {
    return JSON.parse(localStorage.getItem("userProfile") || "null") || null;
  } catch {
    return null;
  }
}

function isAuthorizedProfile(profile) {
  if (!profile) return false;
  const id = String(profile.id || "").trim();
  const email = String(profile.email || "").trim();
  const phone = String(profile.phone || "").trim();
  return Boolean(id || email || phone);
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} грн`;
}

function formatNum(value, unit) {
  return `${Number(value || 0).toFixed(2)} ${unit}`;
}

function currentOptions(els) {
  return {
    material: els.selMaterial.value,
    strength: els.selStrength.value,
    quality: els.selQuality.value
  };
}

function setGlobalErr(els, message) {
  els.err.textContent = message || "";
  els.err.hidden = !message;
}

function syncBodyScrollLock(els) {
  const hasConfirm = Boolean(els.confirmModal && !els.confirmModal.hidden);
  const hasCheckout = Boolean(els.checkoutModal && !els.checkoutModal.hidden);
  document.body.style.overflow = hasConfirm || hasCheckout ? "hidden" : "";
}

function openConfirmModal(els, text) {
  if (!els.confirmModal) return;
  if (els.confirmText && text) els.confirmText.textContent = text;
  els.confirmModal.hidden = false;
  syncBodyScrollLock(els);
}

function closeConfirmModal(els) {
  if (!els.confirmModal) return;
  els.confirmModal.hidden = true;
  syncBodyScrollLock(els);
}

function closeCheckoutModal(els) {
  if (!els.checkoutModal) return;
  els.checkoutModal.hidden = true;
  pendingOrderState = null;
  checkoutCityOptions = [];
  checkoutBranchOptions = [];
  renderCheckoutCitySuggestions(els, []);
  renderCheckoutBranchSuggestions(els, []);
  if (els.checkoutStatus) {
    els.checkoutStatus.hidden = true;
    els.checkoutStatus.textContent = "";
    els.checkoutStatus.classList.remove("is-err", "is-ok");
  }
  syncBodyScrollLock(els);
}

function providerLabel(value) {
  const v = String(value || "").trim();
  if (v === "nova_poshta") return "Нова пошта";
  if (v === "ukrposhta") return "Укрпошта";
  if (v === "courier") return "Кур'єр";
  if (v === "self_pickup") return "Самовивіз";
  return v || "—";
}

function paymentLabel(value) {
  const v = String(value || "").trim();
  if (v === "cod") return "Післяплата";
  if (v === "card_online") return "Оплата карткою онлайн";
  if (v === "bank_transfer") return "Безготівково";
  return v || "—";
}

function capitalizeCityInput(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/(^|\s|-)([a-zа-яіїєґ])/giu, (match, separator, letter) => {
      return `${separator}${letter.toUpperCase()}`;
    });
}

function renderCheckoutCitySuggestions(els, options) {
  const listEl = els.checkoutCitySuggestions;
  if (!listEl) return;
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    checkoutCityDropdownVisible = false;
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
  checkoutCityDropdownVisible = true;
}

function renderCheckoutCityLoading(els) {
  if (!els.checkoutCitySuggestions) return;
  els.checkoutCitySuggestions.innerHTML = '<button type="button" class="city-suggestion-item" disabled>Пошук...</button>';
  els.checkoutCitySuggestions.style.display = "block";
  checkoutCityDropdownVisible = true;
}

function renderCheckoutBranchSuggestions(els, options) {
  const listEl = els.checkoutBranchSuggestions;
  if (!listEl) return;
  if (!options.length) {
    listEl.style.display = "none";
    listEl.innerHTML = "";
    checkoutBranchDropdownVisible = false;
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
  checkoutBranchDropdownVisible = true;
}

async function loadCheckoutWarehouses(els, cityRef, deliveryType, options = {}) {
  const preserveSelection = Boolean(options?.preserveSelection);
  const preselectedBranchRef = String(options?.preselectedBranchRef || "").trim();
  const preselectedBranchText = String(options?.preselectedBranchText || "").trim();
  if (!els.checkoutDeliveryPoint || !els.checkoutBranchRef || !cityRef) return;

  if (!preserveSelection) {
    els.checkoutBranchRef.value = "";
    els.checkoutDeliveryPoint.value = "";
  }
  els.checkoutDeliveryPoint.placeholder = "Завантаження...";
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
      checkoutBranchOptions = [];
      els.checkoutDeliveryPoint.value = "";
      els.checkoutDeliveryPoint.placeholder = "Немає доступних точок";
      renderCheckoutBranchSuggestions(els, []);
      return;
    }
    checkoutBranchOptions = filtered;
    els.checkoutDeliveryPoint.placeholder =
      deliveryType === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    if (preserveSelection && preselectedBranchRef) {
      const matched =
        filtered.find((w) => String(w.Ref || "") === preselectedBranchRef) ||
        filtered.find((w) => String(w.Description || "").trim() === preselectedBranchText);
      if (matched) {
        els.checkoutBranchRef.value = matched.Ref;
        els.checkoutDeliveryPoint.value = matched.Description;
      }
    }
    renderCheckoutBranchSuggestions(els, checkoutBranchOptions);
  } catch {
    checkoutBranchOptions = [];
    els.checkoutDeliveryPoint.value = "";
    els.checkoutDeliveryPoint.placeholder = "Не вдалося завантажити";
    renderCheckoutBranchSuggestions(els, []);
  }
}

function applyCheckoutDeliveryVisibility(els) {
  if (!els.checkoutForm) return;
  const provider = els.checkoutDeliveryProvider?.value || "";
  const deliveryType = els.checkoutDeliveryType?.value || "warehouse";
  const isNova = provider === "nova_poshta";

  if (els.checkoutDeliveryTypeWrap) {
    els.checkoutDeliveryTypeWrap.style.display = isNova ? "grid" : "none";
  }
  if (els.checkoutCityInput) {
    els.checkoutCityInput.placeholder = isNova ? "Почніть вводити місто..." : "Місто";
  }
  if (els.checkoutDeliveryPointLabel) {
    if (isNova && deliveryType === "address") {
      els.checkoutDeliveryPointLabel.firstChild.textContent = "Адреса доставки *";
    } else if (isNova && deliveryType === "postomat") {
      els.checkoutDeliveryPointLabel.firstChild.textContent = "Поштомат *";
    } else {
      els.checkoutDeliveryPointLabel.firstChild.textContent = "Відділення / адреса *";
    }
  }

  if (!isNova) {
    if (els.checkoutCityRef) els.checkoutCityRef.value = "";
    if (els.checkoutBranchRef) els.checkoutBranchRef.value = "";
    checkoutBranchOptions = [];
    renderCheckoutBranchSuggestions(els, []);
    renderCheckoutCitySuggestions(els, []);
    if (els.checkoutDeliveryPoint) {
      els.checkoutDeliveryPoint.placeholder = "Вкажіть відділення або адресу";
    }
    return;
  }

  if (deliveryType === "address") {
    if (els.checkoutBranchRef) els.checkoutBranchRef.value = "";
    checkoutBranchOptions = [];
    renderCheckoutBranchSuggestions(els, []);
    if (els.checkoutDeliveryPoint) {
      els.checkoutDeliveryPoint.placeholder = "Вулиця, будинок, квартира";
    }
  } else if (els.checkoutCityRef?.value) {
    void loadCheckoutWarehouses(els, els.checkoutCityRef.value, deliveryType);
  } else if (els.checkoutDeliveryPoint) {
    els.checkoutDeliveryPoint.placeholder = "Спочатку оберіть місто зі списку";
  }
}

async function onCheckoutCityInput(els) {
  if (!els.checkoutCityInput || !els.checkoutCityRef || !els.checkoutDeliveryProvider) return;
  const normalized = capitalizeCityInput(els.checkoutCityInput.value);
  if (els.checkoutCityInput.value !== normalized) {
    els.checkoutCityInput.value = normalized;
  }
  const query = normalized.trim();
  els.checkoutCityRef.value = "";
  if (checkoutCitySearchTimer) clearTimeout(checkoutCitySearchTimer);
  if (els.checkoutDeliveryProvider.value !== "nova_poshta" || query.length < 1) {
    renderCheckoutCitySuggestions(els, []);
    return;
  }
  const instantMatches = checkoutCityOptions.filter((city) =>
    String(city.Present || "").toLowerCase().includes(query.toLowerCase())
  );
  if (instantMatches.length) renderCheckoutCitySuggestions(els, instantMatches);
  else renderCheckoutCityLoading(els);

  checkoutCitySearchTimer = setTimeout(async () => {
    try {
      checkoutCityOptions = await searchNovaPoshtaCities(query);
      renderCheckoutCitySuggestions(els, checkoutCityOptions);
    } catch {
      renderCheckoutCitySuggestions(els, []);
    }
  }, 40);
}

async function onCheckoutCityChange(els) {
  if (checkoutCitySelectionInProgress) return;
  if (!els.checkoutCityInput || !els.checkoutCityRef || !els.checkoutDeliveryProvider) return;
  if (els.checkoutDeliveryProvider.value !== "nova_poshta") return;

  const normalizedInput = capitalizeCityInput(els.checkoutCityInput.value.trim());
  els.checkoutCityInput.value = normalizedInput;
  let selectedCity = checkoutCityOptions.find((city) => city.Present === normalizedInput);
  if (!selectedCity && normalizedInput.length >= 3) {
    try {
      const freshCities = await searchNovaPoshtaCities(normalizedInput);
      checkoutCityOptions = freshCities;
      selectedCity =
        freshCities.find((city) => city.Present === normalizedInput) ||
        freshCities.find((city) => city.Present.toLowerCase().startsWith(normalizedInput.toLowerCase()));
    } catch {
      selectedCity = null;
    }
  }

  const selectedCityRef = selectedCity?.DeliveryCity || selectedCity?.Ref || "";
  els.checkoutCityRef.value = selectedCityRef;
  if (selectedCityRef) {
    els.checkoutCityInput.value = selectedCity.Present;
    renderCheckoutCitySuggestions(els, []);
    await loadCheckoutWarehouses(els, selectedCityRef, els.checkoutDeliveryType?.value || "warehouse");
  } else {
    if (els.checkoutBranchRef) els.checkoutBranchRef.value = "";
    if (els.checkoutDeliveryPoint) {
      els.checkoutDeliveryPoint.value = "";
      els.checkoutDeliveryPoint.placeholder = "Спочатку оберіть місто зі списку";
    }
    checkoutBranchOptions = [];
    renderCheckoutBranchSuggestions(els, []);
    renderCheckoutCitySuggestions(els, []);
  }
}

function onCheckoutBranchInput(els) {
  if (!els.checkoutDeliveryPoint || !els.checkoutBranchRef) return;
  const query = els.checkoutDeliveryPoint.value.trim().toLowerCase();
  els.checkoutBranchRef.value = "";
  if (!checkoutBranchOptions.length) {
    renderCheckoutBranchSuggestions(els, []);
    return;
  }
  if (!query) {
    renderCheckoutBranchSuggestions(els, checkoutBranchOptions);
    return;
  }
  const filtered = checkoutBranchOptions.filter((w) => (w.Description || "").toLowerCase().includes(query));
  renderCheckoutBranchSuggestions(els, filtered);
}

function onCheckoutBranchChange(els) {
  if (checkoutBranchSelectionInProgress) return;
  if (!els.checkoutDeliveryPoint || !els.checkoutBranchRef) return;
  const query = els.checkoutDeliveryPoint.value.trim().toLowerCase();
  if (!query) {
    els.checkoutBranchRef.value = "";
    renderCheckoutBranchSuggestions(els, []);
    return;
  }
  const exact = checkoutBranchOptions.find((w) => (w.Description || "").toLowerCase() === query);
  if (exact) {
    els.checkoutDeliveryPoint.value = exact.Description;
    els.checkoutBranchRef.value = exact.Ref;
    renderCheckoutBranchSuggestions(els, []);
    return;
  }
  const partial = checkoutBranchOptions.filter((w) => (w.Description || "").toLowerCase().includes(query));
  if (partial.length === 1) {
    els.checkoutDeliveryPoint.value = partial[0].Description;
    els.checkoutBranchRef.value = partial[0].Ref;
  } else {
    els.checkoutBranchRef.value = "";
  }
  renderCheckoutBranchSuggestions(els, []);
}

function bindCheckoutSuggestionEvents(els) {
  if (els.checkoutCitySuggestions) {
    els.checkoutCitySuggestions.addEventListener("mousedown", async (event) => {
      const btn = event.target.closest(".city-suggestion-item");
      if (!btn) return;
      event.preventDefault();
      checkoutCitySelectionInProgress = true;
      if (els.checkoutCityInput) els.checkoutCityInput.value = btn.dataset.name || "";
      if (els.checkoutCityRef) els.checkoutCityRef.value = btn.dataset.ref || "";
      renderCheckoutCitySuggestions(els, []);
      await loadCheckoutWarehouses(els, btn.dataset.ref || "", els.checkoutDeliveryType?.value || "warehouse");
      setTimeout(() => {
        checkoutCitySelectionInProgress = false;
      }, 0);
    });
  }
  if (els.checkoutBranchSuggestions) {
    els.checkoutBranchSuggestions.addEventListener("mousedown", (event) => {
      const btn = event.target.closest(".city-suggestion-item");
      if (!btn || btn.disabled) return;
      event.preventDefault();
      checkoutBranchSelectionInProgress = true;
      if (els.checkoutDeliveryPoint) els.checkoutDeliveryPoint.value = btn.dataset.name || "";
      if (els.checkoutBranchRef) els.checkoutBranchRef.value = btn.dataset.ref || "";
      renderCheckoutBranchSuggestions(els, []);
      setTimeout(() => {
        checkoutBranchSelectionInProgress = false;
      }, 0);
    });
  }
  document.addEventListener("click", (event) => {
    if (els.checkoutCityWrap && !els.checkoutCityWrap.contains(event.target) && checkoutCityDropdownVisible) {
      renderCheckoutCitySuggestions(els, []);
    }
    if (els.checkoutBranchWrap && !els.checkoutBranchWrap.contains(event.target) && checkoutBranchDropdownVisible) {
      renderCheckoutBranchSuggestions(els, []);
    }
  });
}

function showCheckoutForm(els, profile) {
  if (els.checkoutAuthPrompt) els.checkoutAuthPrompt.hidden = true;
  if (els.checkoutForm) els.checkoutForm.hidden = false;
  if (!els.checkoutForm) return;
  const d = profile?.delivery || {};
  const form = els.checkoutForm;
  form.elements.lastName.value = profile?.lastName || "";
  form.elements.name.value = profile?.name || "";
  form.elements.phone.value = profile?.phone || "";
  form.elements.email.value = profile?.email || "";
  form.elements.deliveryProvider.value = d.provider || "nova_poshta";
  form.elements.deliveryType.value = d.deliveryType || "warehouse";
  form.elements.paymentMethod.value = d.paymentMethod || "cod";
  form.elements.city.value = d.city || "";
  form.elements.cityRef.value = d.cityRef || "";
  form.elements.branchRef.value = d.branch || "";
  form.elements.deliveryPoint.value = d.deliveryType === "address" ? (d.address || "") : (d.branchText || "");
  form.elements.orderComment.value = "";
  applyCheckoutDeliveryVisibility(els);
  if (form.elements.deliveryProvider.value === "nova_poshta" && form.elements.cityRef.value && form.elements.deliveryType.value !== "address") {
    void loadCheckoutWarehouses(els, form.elements.cityRef.value, form.elements.deliveryType.value, {
      preserveSelection: true,
      preselectedBranchRef: form.elements.branchRef.value,
      preselectedBranchText: form.elements.deliveryPoint.value
    });
  }
}

function openCheckoutModal(els, valid, total) {
  if (!els.checkoutModal) return;
  const profile = getClientProfile();
  const authorized = isAuthorizedProfile(profile);
  pendingOrderState = { valid, total };
  if (els.checkoutSummary) {
    els.checkoutSummary.textContent = `Моделей: ${valid.length}. Сума до сплати: ${formatMoney(total)}.`;
  }
  if (authorized) {
    showCheckoutForm(els, profile);
  } else {
    if (els.checkoutAuthPrompt) els.checkoutAuthPrompt.hidden = false;
    if (els.checkoutForm) els.checkoutForm.hidden = true;
  }
  if (els.checkoutStatus) {
    els.checkoutStatus.hidden = true;
    els.checkoutStatus.textContent = "";
    els.checkoutStatus.classList.remove("is-err", "is-ok");
  }
  els.checkoutModal.hidden = false;
  syncBodyScrollLock(els);
}

function renderColorPalette(container, selectedHex, onSelect) {
  container.innerHTML = "";
  COLOR_PRESETS.forEach((c) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "print3d-color-chip";
    btn.title = c.name;
    btn.setAttribute("aria-label", c.name);
    btn.style.background = c.hex;
    if (String(selectedHex).toLowerCase() === c.hex.toLowerCase()) {
      btn.classList.add("is-active");
    }
    btn.addEventListener("click", () => {
      onSelect(c.hex);
      renderColorPalette(container, c.hex, onSelect);
    });
    container.appendChild(btn);
  });
}

function createCardElement(item) {
  const card = document.createElement("article");
  card.className = "print3d-model-card";

  const head = document.createElement("div");
  head.className = "print3d-model-head";

  const title = document.createElement("div");
  title.className = "print3d-model-title";
  title.textContent = item.file.name;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "print3d-model-remove";
  removeBtn.textContent = "Видалити";

  const colorWrap = document.createElement("label");
  colorWrap.className = "print3d-model-color";
  colorWrap.textContent = "Колір";
  const colorPalette = document.createElement("div");
  colorPalette.className = "print3d-color-palette";
  colorWrap.appendChild(colorPalette);

  const headRight = document.createElement("div");
  headRight.style.display = "inline-flex";
  headRight.style.alignItems = "center";
  headRight.style.gap = "8px";
  headRight.append(colorWrap, removeBtn);

  head.append(title, headRight);

  const body = document.createElement("div");
  body.className = "print3d-model-body";

  const previewWrap = document.createElement("div");
  const canvasHost = document.createElement("div");
  canvasHost.className = "print3d-canvas-wrap print3d-canvas-wrap--card";
  canvasHost.innerHTML = "<p class=\"print3d-canvas-empty\">Завантаження прев'ю...</p>";
  const hint = document.createElement("p");
  hint.className = "print3d-canvas-hint";
  hint.textContent = "Обертання: затисніть ЛКМ і рухайте";
  previewWrap.append(canvasHost, hint);

  const info = document.createElement("div");
  info.className = "print3d-model-info";

  const params = document.createElement("div");
  params.className = "print3d-model-params";
  params.innerHTML = `
    <label>Матеріал
      <select data-param="material">
        <option value="PLA"${item.options.material === "PLA" ? " selected" : ""}>PLA</option>
        <option value="PETG"${item.options.material === "PETG" ? " selected" : ""}>PETG</option>
        <option value="ABS"${item.options.material === "ABS" ? " selected" : ""}>ABS</option>
      </select>
    </label>
    <label>Міцність
      <select data-param="strength">
        <option value="low"${item.options.strength === "low" ? " selected" : ""}>Low (15%)</option>
        <option value="medium"${item.options.strength === "medium" ? " selected" : ""}>Medium (25%)</option>
        <option value="strong"${item.options.strength === "strong" ? " selected" : ""}>Strong (35%)</option>
        <option value="high"${item.options.strength === "high" ? " selected" : ""}>High (50%)</option>
        <option value="ultra"${item.options.strength === "ultra" ? " selected" : ""}>Ultra (70%)</option>
      </select>
    </label>
    <label>Якість
      <select data-param="quality">
        <option value="draft"${item.options.quality === "draft" ? " selected" : ""}>Draft</option>
        <option value="normal"${item.options.quality === "normal" ? " selected" : ""}>Normal</option>
        <option value="fine"${item.options.quality === "fine" ? " selected" : ""}>Fine</option>
      </select>
    </label>
  `;

  const commentBox = document.createElement("div");
  commentBox.className = "print3d-model-comment";
  const commentBtn = document.createElement("button");
  commentBtn.type = "button";
  commentBtn.className = "print3d-comment-toggle";
  commentBtn.textContent = "Додати коментар";
  const commentWrap = document.createElement("div");
  commentWrap.hidden = true;
  const commentInput = document.createElement("textarea");
  commentInput.placeholder = "Коментар до цієї моделі (за потреби)";
  commentInput.rows = 3;
  commentWrap.appendChild(commentInput);
  commentBox.append(commentBtn, commentWrap);

  const status = document.createElement("div");
  status.className = "print3d-card-status";

  const err = document.createElement("div");
  err.className = "print3d-card-err";
  err.hidden = true;

  const stats = document.createElement("div");
  stats.className = "print3d-result-grid print3d-result-grid--card";
  stats.innerHTML = `
    <div class="print3d-result-item"><strong>Об'єм</strong><span class="print3d-val" data-k="volume">—</span></div>
    <div class="print3d-result-item"><strong>Вага</strong><span class="print3d-val" data-k="weight">—</span></div>
    <div class="print3d-result-item"><strong>Час</strong><span class="print3d-val" data-k="time">—</span></div>
    <div class="print3d-result-item print3d-result-item--price"><strong>Ціна</strong><span class="print3d-val" data-k="price">—</span></div>
  `;

  info.append(params, commentBox, status, err, stats);
  body.append(previewWrap, info);
  card.append(head, body);

  return {
    card,
    removeBtn,
    canvasHost,
    status,
    err,
    colorPalette,
    selMaterial: params.querySelector('select[data-param="material"]'),
    selStrength: params.querySelector('select[data-param="strength"]'),
    selQuality: params.querySelector('select[data-param="quality"]'),
    commentBtn,
    commentWrap,
    commentInput,
    cells: {
      volume: stats.querySelector('[data-k="volume"]'),
      weight: stats.querySelector('[data-k="weight"]'),
      time: stats.querySelector('[data-k="time"]'),
      price: stats.querySelector('[data-k="price"]')
    }
  };
}

function applyColorToObject(THREE, object, colorHex) {
  const color = new THREE.Color(colorHex || DEFAULT_COLOR);
  object.traverse?.((c) => {
    if (!c.isMesh) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => {
      if (m && "color" in m) m.color.copy(color);
    });
  });
  if (object.isMesh && object.material) {
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    mats.forEach((m) => {
      if (m && "color" in m) m.color.copy(color);
    });
  }
}

function updateCard(item) {
  const ui = item.ui;
  if (!ui) return;

  if (item.loading) {
    ui.status.textContent = "Розрахунок...";
  } else if (item.error) {
    ui.status.textContent = "";
  } else if (item.analysis) {
    ui.status.textContent = "Розраховано";
  } else {
    ui.status.textContent = "";
  }

  if (item.error) {
    ui.err.hidden = false;
    ui.err.textContent = item.error;
  } else {
    ui.err.hidden = true;
    ui.err.textContent = "";
  }

  if (!item.analysis) {
    ui.cells.volume.textContent = "—";
    ui.cells.weight.textContent = "—";
    ui.cells.time.textContent = "—";
    ui.cells.price.textContent = "—";
    return;
  }

  ui.cells.volume.textContent = formatNum(item.analysis.volume, "см³");
  ui.cells.weight.textContent = formatNum(item.analysis.estimatedWeight, "г");
  ui.cells.time.textContent = formatNum(item.analysis.printTimeHours, "год");
  ui.cells.price.textContent = formatMoney(item.analysis.price);
}

function updateSummary(els) {
  const valid = modelItems.filter((x) => x.analysis && !x.error);
  if (!valid.length) {
    els.totalBox.hidden = true;
    els.totalRows.innerHTML = "";
    els.totalPrice.textContent = "0 грн";
    return;
  }

  let sum = 0;
  els.totalRows.innerHTML = "";
  valid.forEach((item) => {
    sum += Number(item.analysis.price || 0);
    const row = document.createElement("div");
    row.className = "print3d-total-row";
    const left = document.createElement("span");
    left.className = "print3d-total-row-left";
    const dot = document.createElement("i");
    dot.className = "print3d-color-dot";
    dot.style.background = item.color || DEFAULT_COLOR;
    const name = document.createElement("span");
    name.textContent = item.comment ? `${item.file.name} (є коментар)` : item.file.name;
    left.append(dot, name);
    const price = document.createElement("span");
    price.textContent = formatMoney(item.analysis.price);
    row.append(left, price);
    els.totalRows.appendChild(row);
  });

  els.totalPrice.textContent = formatMoney(sum);
  els.totalBox.hidden = false;
}

function normalizeAndFit(THREE, object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = 80;
  const scale = target / maxDim;
  object.scale.setScalar(scale);

  const box2 = new THREE.Box3().setFromObject(object);
  const center = box2.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const sphere = box2.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 10);
  const dist = radius * 2.6;

  camera.near = Math.max(dist / 1000, 0.01);
  camera.far = dist * 20;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function mountPreview(item) {
  const host = item.ui.canvasHost;
  const ext = extOf(item.file.name);

  if (ext !== "stl" && ext !== "obj") {
    host.innerHTML = '<p class="print3d-canvas-empty">Перегляд доступний для STL/OBJ</p>';
    return;
  }

  const { THREE, STLLoader, OBJLoader, OrbitControls } = await loadThreeMods();
  host.innerHTML = "";

  const rect = host.getBoundingClientRect();
  const w = Math.max(rect.width, 260);
  const h = Math.max(rect.height, 240);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfcfaf7);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xfff1dc, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(50, 70, 80);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff6ea, 0.8);
  fill.position.set(-40, 28, -30);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const fileUrl = URL.createObjectURL(item.file);
  let object = null;

  try {
    if (ext === "stl") {
      const geometry = await new Promise((resolve, reject) => {
        const loader = new STLLoader();
        loader.load(fileUrl, resolve, undefined, reject);
      });
      const material = new THREE.MeshStandardMaterial({
        color: item.color || DEFAULT_COLOR,
        metalness: 0.04,
        roughness: 0.38
      });
      object = new THREE.Mesh(geometry, material);
    } else {
      object = await new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(fileUrl, resolve, undefined, reject);
      });
      object.traverse((c) => {
        if (c.isMesh) {
          c.material = new THREE.MeshStandardMaterial({
            color: item.color || DEFAULT_COLOR,
            metalness: 0.05,
            roughness: 0.42
          });
        }
      });
    }
  } catch (e) {
    console.error("[preview]", e);
    host.innerHTML = '<p class="print3d-canvas-empty">Не вдалося показати модель</p>';
    URL.revokeObjectURL(fileUrl);
    renderer.dispose();
    return;
  }

  URL.revokeObjectURL(fileUrl);
  scene.add(object);
  applyColorToObject(THREE, object, item.color);
  item.applyPreviewColor = (hex) => applyColorToObject(THREE, object, hex);
  normalizeAndFit(THREE, object, camera, controls);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const onResize = () => {
    const r = host.getBoundingClientRect();
    const nw = Math.max(r.width, 260);
    const nh = Math.max(r.height, 240);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  };
  window.addEventListener("resize", onResize);

  item.disposePreview = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    scene.remove(object);
    object.traverse?.((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => m.dispose && m.dispose());
      }
    });
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach((m) => m.dispose && m.dispose());
    }
    renderer.dispose();
    if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
  };
}

async function analyzeItem(item, els) {
  item.loading = true;
  item.error = "";
  updateCard(item);

  try {
    const fd = new FormData();
    fd.set("file", item.file);
    const opts = item.options || currentOptions(els);
    fd.set("material", opts.material);
    fd.set("strength", opts.strength);
    fd.set("quality", opts.quality);

    const res = await fetch(API_ANALYZE, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Помилка сервера");
    item.analysis = data;
    item.error = "";
  } catch (e) {
    item.analysis = null;
    item.error = e instanceof Error ? e.message : "Помилка розрахунку";
  } finally {
    item.loading = false;
    updateCard(item);
    updateSummary(els);
  }
}

function removeItem(id, els) {
  const idx = modelItems.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const item = modelItems[idx];
  if (item.disposePreview) item.disposePreview();
  if (item.ui?.card?.parentNode) item.ui.card.parentNode.removeChild(item.ui.card);
  modelItems.splice(idx, 1);
  updateSummary(els);
}

function addFiles(files, els) {
  const all = Array.from(files || []);
  if (!all.length) return;

  const errors = [];
  all.forEach((file) => {
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: більше 50 МБ`);
      return;
    }

    const item = {
      id: `m${Date.now()}_${modelSeq++}`,
      file,
      loading: false,
      error: "",
      analysis: null,
      options: currentOptions(els),
      comment: "",
      color: els.orderColorHex || DEFAULT_COLOR,
      customColor: false,
      disposePreview: null,
      applyPreviewColor: null,
      ui: null
    };

    item.ui = createCardElement(item);
    item.ui.removeBtn.addEventListener("click", () => removeItem(item.id, els));
    renderColorPalette(item.ui.colorPalette, item.color, (hex) => {
      item.color = hex;
      item.customColor = true;
      if (item.applyPreviewColor) item.applyPreviewColor(item.color);
      updateSummary(els);
    });
    item.ui.selMaterial.addEventListener("change", () => {
      item.options.material = item.ui.selMaterial.value;
      void analyzeItem(item, els);
    });
    item.ui.selStrength.addEventListener("change", () => {
      item.options.strength = item.ui.selStrength.value;
      void analyzeItem(item, els);
    });
    item.ui.selQuality.addEventListener("change", () => {
      item.options.quality = item.ui.selQuality.value;
      void analyzeItem(item, els);
    });
    item.ui.commentBtn.addEventListener("click", () => {
      item.ui.commentWrap.hidden = !item.ui.commentWrap.hidden;
      item.ui.commentBtn.textContent = item.ui.commentWrap.hidden ? "Додати коментар" : "Сховати коментар";
    });
    item.ui.commentInput.addEventListener("input", () => {
      item.comment = item.ui.commentInput.value.trim();
      updateSummary(els);
    });
    els.modelsGrid.appendChild(item.ui.card);
    modelItems.push(item);

    void mountPreview(item).catch((e) => {
      console.error("[mountPreview]", e);
      item.ui.canvasHost.innerHTML = "<p class=\"print3d-canvas-empty\">Не вдалося завантажити прев'ю</p>";
    });
    void analyzeItem(item, els);
  });

  if (errors.length) {
    setGlobalErr(els, errors.join("; "));
  } else {
    setGlobalErr(els, "");
  }
}

function initModelMode(els) {
  els.drop.addEventListener("click", () => els.fileInput.click());
  els.drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener("change", () => {
    addFiles(els.fileInput.files, els);
    els.fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) => {
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("is-drag");
    });
  });
  els.drop.addEventListener("dragleave", () => els.drop.classList.remove("is-drag"));
  els.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    els.drop.classList.remove("is-drag");
    addFiles(e.dataTransfer.files, els);
  });

  [els.selMaterial, els.selStrength, els.selQuality].forEach((control) => {
    control.addEventListener("change", () => {
      // Верхні селекти діють як налаштування за замовчуванням для нових моделей.
    });
  });

  renderColorPalette(els.orderColorPalette, els.orderColorHex, (hex) => {
    els.orderColorHex = hex;
    modelItems.forEach((item) => {
      if (item.customColor) return;
      item.color = hex;
      if (item.applyPreviewColor) item.applyPreviewColor(hex);
      if (item.ui?.colorPalette) {
        renderColorPalette(item.ui.colorPalette, item.color, (modelHex) => {
          item.color = modelHex;
          item.customColor = true;
          if (item.applyPreviewColor) item.applyPreviewColor(modelHex);
          updateSummary(els);
        });
      }
    });
    updateSummary(els);
  });

  els.btnOrder.addEventListener("click", async () => {
    const valid = modelItems.filter((x) => x.analysis && !x.error);
    const total = valid.reduce((sum, x) => sum + Number(x.analysis.price || 0), 0);
    if (!valid.length) {
      alert("Спочатку додайте STL/OBJ і дочекайтесь розрахунку.");
      return;
    }
    openCheckoutModal(els, valid, total);
  });
}

async function submitCheckoutOrder(els) {
  if (!pendingOrderState?.valid?.length) {
    throw new Error("Немає моделей для оформлення");
  }
  const form = els.checkoutForm;
  const data = new FormData(form);
  const customer = {
    name: String(data.get("name") || "").trim(),
    lastName: String(data.get("lastName") || "").trim(),
    phone: String(data.get("phone") || "").trim(),
    email: String(data.get("email") || "").trim().toLowerCase(),
    deliveryProvider: String(data.get("deliveryProvider") || "").trim(),
    deliveryType: String(data.get("deliveryType") || "warehouse").trim(),
    paymentMethod: String(data.get("paymentMethod") || "").trim(),
    city: String(data.get("city") || "").trim(),
    cityRef: String(data.get("cityRef") || "").trim(),
    branchRef: String(data.get("branchRef") || "").trim(),
    deliveryPoint: String(data.get("deliveryPoint") || "").trim(),
    orderComment: String(data.get("orderComment") || "").trim()
  };

  if (!customer.name || !customer.lastName || !customer.phone || !customer.email) {
    throw new Error("Заповніть ПІБ, телефон та email");
  }
  if (!customer.deliveryProvider || !customer.paymentMethod || !customer.city || !customer.deliveryPoint) {
    throw new Error("Заповніть дані доставки та оплати");
  }
  if (customer.deliveryProvider === "nova_poshta") {
    if (!customer.cityRef) {
      throw new Error("Оберіть місто зі списку Нової пошти");
    }
    if (customer.deliveryType !== "address" && !customer.branchRef) {
      throw new Error("Оберіть відділення або поштомат зі списку");
    }
  }

  const profile = getClientProfile();
  const authorized = isAuthorizedProfile(profile);
  const valid = pendingOrderState.valid;
  const total = pendingOrderState.total;

  const fd = new FormData();
  valid.forEach((item) => {
    fd.append("files", item.file, item.file.name);
  });
  const modelsMeta = valid.map((item) => ({
    name: item.file.name,
    material: item.options?.material,
    strength: item.options?.strength,
    quality: item.options?.quality,
    color: item.color,
    comment: item.comment || "",
    price: Number(item.analysis?.price || 0)
  }));
  fd.set("modelsMeta", JSON.stringify(modelsMeta));
  fd.set("orderColor", els.orderColorHex || "");
  fd.set("total", String(total));
  fd.set("userName", customer.name);
  fd.set("userLastName", customer.lastName);
  fd.set("userEmail", customer.email);
  fd.set("userPhone", customer.phone);
  fd.set("userDeliveryProvider", customer.deliveryProvider);
  fd.set("userDeliveryType", customer.deliveryType);
  fd.set("userPaymentMethod", customer.paymentMethod);
  fd.set("userCity", customer.city);
  fd.set("userCityRef", customer.cityRef);
  fd.set("userBranchRef", customer.branchRef);
  fd.set("userDeliveryPoint", customer.deliveryPoint);
  fd.set("userOrderComment", customer.orderComment);
  fd.set("userIsGuest", authorized ? "0" : "1");
  if (profile?.id) fd.set("userId", String(profile.id));
  if (profile?.clientId) fd.set("userClientId", String(profile.clientId));

  const res = await fetch(API_ORDER, { method: "POST", body: fd });
  const responseData = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(responseData.error || "Не вдалося надіслати замовлення");

  if (authorized && profile) {
    const updated = {
      ...profile,
      name: customer.name,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      delivery: {
        ...(profile.delivery || {}),
        provider: customer.deliveryProvider,
        deliveryType: customer.deliveryType,
        paymentMethod: customer.paymentMethod,
        city: customer.city,
        cityRef: customer.cityRef,
        branch: customer.branchRef,
        branchText: customer.deliveryType === "address" ? "" : customer.deliveryPoint,
        address: customer.deliveryType === "address" ? customer.deliveryPoint : ""
      }
    };
    localStorage.setItem("userProfile", JSON.stringify(updated));
  }
  closeCheckoutModal(els);
  openConfirmModal(
    els,
    `Ваше замовлення прийняте та починає виконуватись. Орієнтовний термін виготовлення: 1–2 дні. Моделей: ${valid.length}. Сума: ${formatMoney(total)}. Доставка: ${providerLabel(customer.deliveryProvider)}. Оплата: ${paymentLabel(customer.paymentMethod)}.`
  );
}

function initRequestForm(form, statusEl) {
  const fileInput = form.querySelector('input[name="attachment"]');
  const fileBtn = document.getElementById("print3dRequestFileBtn");
  const fileNameEl = document.getElementById("print3dRequestFileName");
  const defaultFileText = "Файл не вибрано";
  if (fileInput && fileNameEl) {
    if (fileBtn) {
      fileBtn.addEventListener("click", () => fileInput.click());
    }
    fileInput.addEventListener("change", () => {
      fileNameEl.textContent = fileInput.files?.[0]?.name || defaultFileText;
    });
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;
    statusEl.classList.remove("is-ok", "is-err");
    const fd = new FormData(form);
    const profile = getClientProfile();
    if (profile?.id) fd.set("userId", String(profile.id));
    if (profile?.clientId) fd.set("clientId", String(profile.clientId));
    if (!fd.get("email") && profile?.email) fd.set("email", String(profile.email));
    if (!fd.get("phone") && profile?.phone) fd.set("phone", String(profile.phone));
    const att = fd.get("attachment");
    if (att instanceof File && att.size > MAX_BYTES) {
      statusEl.hidden = false;
      statusEl.classList.add("is-err");
      statusEl.textContent = "Файл завеликий (максимум 50 МБ).";
      return;
    }
    try {
      const res = await fetch(API_REQUEST, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Помилка");
      statusEl.hidden = false;
      statusEl.classList.add("is-ok");
      statusEl.textContent = "Запит надіслано. Дякуємо!";
      form.reset();
      if (fileNameEl) fileNameEl.textContent = defaultFileText;
    } catch (err) {
      statusEl.hidden = false;
      statusEl.classList.add("is-err");
      statusEl.textContent = err instanceof Error ? err.message : "Не вдалося надіслати";
    }
  });
}

function init() {
  const tabModel = document.getElementById("print3dTabModel");
  const tabRequest = document.getElementById("print3dTabRequest");
  const panelModel = document.getElementById("print3dPanelModel");
  const panelRequest = document.getElementById("print3dPanelRequest");

  tabModel.addEventListener("click", () => {
    tabModel.classList.add("is-active");
    tabRequest.classList.remove("is-active");
    panelModel.hidden = false;
    panelRequest.hidden = true;
  });

  tabRequest.addEventListener("click", () => {
    tabRequest.classList.add("is-active");
    tabModel.classList.remove("is-active");
    panelRequest.hidden = false;
    panelModel.hidden = true;
  });

  const els = {
    drop: document.getElementById("print3dDrop"),
    fileInput: document.getElementById("print3dFile"),
    selMaterial: document.getElementById("print3dMaterial"),
    selStrength: document.getElementById("print3dStrength"),
    selQuality: document.getElementById("print3dQuality"),
    orderColorPalette: document.getElementById("print3dOrderColorPalette"),
    orderColorHex: DEFAULT_COLOR,
    err: document.getElementById("print3dErr"),
    modelsGrid: document.getElementById("print3dModelsGrid"),
    totalBox: document.getElementById("print3dTotalBox"),
    totalRows: document.getElementById("print3dTotalRows"),
    totalPrice: document.getElementById("print3dTotalPrice"),
    btnOrder: document.getElementById("print3dBtnOrder"),
    checkoutModal: document.getElementById("print3dCheckoutModal"),
    checkoutSummary: document.getElementById("print3dCheckoutSummary"),
    checkoutAuthPrompt: document.getElementById("print3dCheckoutAuthPrompt"),
    checkoutForm: document.getElementById("print3dCheckoutForm"),
    checkoutStatus: document.getElementById("print3dCheckoutStatus"),
    checkoutDeliveryProvider: document.getElementById("print3dCheckoutDeliveryProvider"),
    checkoutDeliveryType: document.getElementById("print3dCheckoutDeliveryType"),
    checkoutDeliveryTypeWrap: document.getElementById("print3dCheckoutDeliveryTypeWrap"),
    checkoutPaymentMethod: document.getElementById("print3dCheckoutPaymentMethod"),
    checkoutCityWrap: document.getElementById("print3dCheckoutCityWrap"),
    checkoutCityInput: document.getElementById("print3dCheckoutCity"),
    checkoutCityRef: document.getElementById("print3dCheckoutCityRef"),
    checkoutCitySuggestions: document.getElementById("print3dCheckoutCitySuggestions"),
    checkoutBranchWrap: document.getElementById("print3dCheckoutBranchWrap"),
    checkoutDeliveryPointLabel: document.getElementById("print3dCheckoutDeliveryPointWrap"),
    checkoutDeliveryPoint: document.getElementById("print3dCheckoutDeliveryPoint"),
    checkoutBranchRef: document.getElementById("print3dCheckoutBranchRef"),
    checkoutBranchSuggestions: document.getElementById("print3dCheckoutBranchSuggestions"),
    checkoutLoginBtn: document.getElementById("print3dCheckoutLoginBtn"),
    checkoutRegisterBtn: document.getElementById("print3dCheckoutRegisterBtn"),
    checkoutGuestBtn: document.getElementById("print3dCheckoutGuestBtn"),
    checkoutSubmit: document.getElementById("print3dCheckoutSubmit"),
    confirmModal: document.getElementById("print3dConfirmModal"),
    confirmText: document.getElementById("print3dConfirmText")
  };

  if (els.checkoutModal) {
    bindCheckoutSuggestionEvents(els);
    els.checkoutModal.querySelectorAll("[data-close-print3d-checkout]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeCheckoutModal(els);
      });
    });
    if (els.checkoutLoginBtn) {
      els.checkoutLoginBtn.addEventListener("click", () => {
        closeCheckoutModal(els);
        if (typeof window.openAuthModal === "function") window.openAuthModal("login");
      });
    }
    if (els.checkoutRegisterBtn) {
      els.checkoutRegisterBtn.addEventListener("click", () => {
        closeCheckoutModal(els);
        if (typeof window.openAuthModal === "function") window.openAuthModal("register");
      });
    }
    if (els.checkoutGuestBtn) {
      els.checkoutGuestBtn.addEventListener("click", () => showCheckoutForm(els, null));
    }
    if (els.checkoutDeliveryProvider) {
      els.checkoutDeliveryProvider.addEventListener("change", () => {
        applyCheckoutDeliveryVisibility(els);
      });
    }
    if (els.checkoutDeliveryType) {
      els.checkoutDeliveryType.addEventListener("change", () => {
        if (els.checkoutBranchRef) els.checkoutBranchRef.value = "";
        if (els.checkoutDeliveryPoint) els.checkoutDeliveryPoint.value = "";
        checkoutBranchOptions = [];
        renderCheckoutBranchSuggestions(els, []);
        applyCheckoutDeliveryVisibility(els);
      });
    }
    if (els.checkoutCityInput) {
      els.checkoutCityInput.addEventListener("input", () => {
        void onCheckoutCityInput(els);
      });
      els.checkoutCityInput.addEventListener("focus", () => {
        if (String(els.checkoutCityInput.value || "").trim().length >= 1) {
          void onCheckoutCityInput(els);
        }
      });
      els.checkoutCityInput.addEventListener("change", () => {
        void onCheckoutCityChange(els);
      });
      els.checkoutCityInput.addEventListener("blur", () => {
        void onCheckoutCityChange(els);
      });
    }
    if (els.checkoutDeliveryPoint) {
      els.checkoutDeliveryPoint.addEventListener("input", () => {
        if (els.checkoutDeliveryProvider?.value === "nova_poshta" && els.checkoutDeliveryType?.value !== "address") {
          onCheckoutBranchInput(els);
        }
      });
      els.checkoutDeliveryPoint.addEventListener("change", () => {
        if (els.checkoutDeliveryProvider?.value === "nova_poshta" && els.checkoutDeliveryType?.value !== "address") {
          onCheckoutBranchChange(els);
        }
      });
      els.checkoutDeliveryPoint.addEventListener("blur", () => {
        if (els.checkoutDeliveryProvider?.value === "nova_poshta" && els.checkoutDeliveryType?.value !== "address") {
          onCheckoutBranchChange(els);
        }
      });
      els.checkoutDeliveryPoint.addEventListener("focus", () => {
        if (
          els.checkoutDeliveryProvider?.value === "nova_poshta" &&
          els.checkoutDeliveryType?.value !== "address" &&
          checkoutBranchOptions.length
        ) {
          onCheckoutBranchInput(els);
        }
      });
    }
    if (els.checkoutForm) {
      els.checkoutForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        if (els.checkoutStatus) {
          els.checkoutStatus.hidden = true;
          els.checkoutStatus.classList.remove("is-err", "is-ok");
          els.checkoutStatus.textContent = "";
        }
        try {
          if (els.checkoutSubmit) els.checkoutSubmit.disabled = true;
          await submitCheckoutOrder(els);
        } catch (err) {
          if (els.checkoutStatus) {
            els.checkoutStatus.hidden = false;
            els.checkoutStatus.classList.add("is-err");
            els.checkoutStatus.textContent = err instanceof Error ? err.message : "Помилка оформлення";
          }
        } finally {
          if (els.checkoutSubmit) els.checkoutSubmit.disabled = false;
        }
      });
    }
  }

  if (els.confirmModal) {
    closeConfirmModal(els);
    els.confirmModal.querySelectorAll("[data-close-print3d-modal]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        closeConfirmModal(els);
      });
    });
    els.confirmModal.addEventListener("click", (e) => {
      if (e.target === els.confirmModal) closeConfirmModal(els);
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && els.checkoutModal && !els.checkoutModal.hidden) {
        closeCheckoutModal(els);
      } else if (e.key === "Escape" && !els.confirmModal.hidden) {
        closeConfirmModal(els);
      }
    });
  }

  initModelMode(els);
  initRequestForm(
    document.getElementById("print3dRequestForm"),
    document.getElementById("print3dRequestStatus")
  );
}

init();
