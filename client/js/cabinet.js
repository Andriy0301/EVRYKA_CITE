const PROFILE_STORAGE_KEY = "userProfile";
const FAVORITES_STORAGE_KEY = "favorites";
let cabCityOptions = [];
let cabBranchOptions = [];
let cabCityDropdownVisible = false;
let cabBranchDropdownVisible = false;
let cabCitySearchTimer = null;
let cabCitySelectionInProgress = false;
let cabBranchSelectionInProgress = false;

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

function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem(FAVORITES_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveFavorites(items) {
  const next = Array.isArray(items) ? items : [];
  localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(next));
  const profile = getProfile();
  if (profile?.id && typeof saveUserFavorites === "function") {
    saveUserFavorites(profile, next).catch(() => null);
  }
}

async function hydrateFavoritesFromProfile(profile) {
  if (!profile?.id || typeof getUserFavorites !== "function") return;
  try {
    const data = await getUserFavorites(profile);
    const items = Array.isArray(data?.items) ? data.items : [];
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(items));
  } catch {
    // fallback to local data
  }
}

function resolveFavoriteImageSrc(item) {
  const candidate = item?.image || item?.images?.[0] || "";
  if (!candidate) return "images/favicon.png";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${API_URL}${candidate}`;
}

function goToProduct(id) {
  if (!id) return;
  window.location.href = `product.html?id=${encodeURIComponent(id)}`;
}

function renderFavoritesList() {
  const container = document.getElementById("favoritesItems");
  if (!container) return;
  const favorites = getFavorites();
  container.innerHTML = "";

  if (!favorites.length) {
    container.innerHTML = "<p style='text-align:center;'>Немає обраних товарів</p>";
    return;
  }

  favorites.forEach((item) => {
    const div = document.createElement("div");
    div.className = "cart-item";
    div.innerHTML = `
      <img src="${resolveFavoriteImageSrc(item)}" alt="${item?.name || "Товар"}">
      <div class="cart-info">
        <h4>${item?.name || "Товар"}</h4>
        <p>${Number(item?.price || 0)} грн</p>
      </div>
      <button type="button" class="remove-btn" aria-label="Прибрати з обраного">✖</button>
    `;
    div.addEventListener("click", () => goToProduct(item?.id));
    const removeBtn = div.querySelector(".remove-btn");
    removeBtn?.addEventListener("click", (event) => {
      event.stopPropagation();
      const next = getFavorites().filter((entry) => Number(entry?.id) !== Number(item?.id));
      saveFavorites(next);
      renderFavoritesList();
    });
    container.appendChild(div);
  });
}

function toggleFavorites(open) {
  const sidebar = document.getElementById("favoritesSidebar");
  const overlay = document.getElementById("favoritesOverlay");
  if (!sidebar || !overlay) return;
  if (open) {
    sidebar.classList.add("active");
    overlay.classList.add("active");
    renderFavoritesList();
    return;
  }
  sidebar.classList.remove("active");
  overlay.classList.remove("active");
}

function clearFavorites() {
  saveFavorites([]);
  renderFavoritesList();
}

function showCabinetMessage(message = "", isError = true) {
  const el = document.getElementById("cabinetMessage");
  if (!el) return;
  el.innerText = message;
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

function formatCabOrderDate(value) {
  try {
    return new Date(value).toLocaleString("uk-UA");
  } catch {
    return value || "-";
  }
}

function getCabOrderItemImage(item) {
  const candidate = item?.image || item?.images?.[0] || "";
  if (!candidate) return "images/favicon.png";
  if (/^https?:\/\//i.test(candidate)) return candidate;
  return `${API_URL}${candidate}`;
}

function getCabOrderLifecycleLabel(order) {
  const status = String(order?.orderStatus || "new").trim();
  if (status === "cancelled") return "Скасовано";
  return "Активне";
}

function isCabOrderCancelled(order) {
  return String(order?.orderStatus || "").trim() === "cancelled";
}

function getCabPaymentMethod(order) {
  return String(order?.customer?.delivery?.paymentMethod || order?.delivery?.paymentMethod || "")
    .trim()
    .toLowerCase();
}

function getCabPaymentMethodLabel(order) {
  const method = getCabPaymentMethod(order);
  if (method === "cod") return "Оплата при отриманні";
  if (method === "mono" || method === "monobank") return "Оплата через Monobank";
  if (!method) return "Не вказано";
  return "Оплата наперед";
}

function getCabPaymentStatusMeta(order) {
  const method = getCabPaymentMethod(order);
  const rawStatus = String(order?.payment?.status || "").trim().toLowerCase();
  if (method === "cod") {
    return {
      label: "При отриманні",
      icon: "💵",
      tone: "is-cod"
    };
  }
  if (rawStatus === "paid" || rawStatus === "success") {
    return {
      label: "Оплачено",
      icon: "✅",
      tone: "is-paid"
    };
  }
  return {
    label: "Не оплачено",
    icon: "🕒",
    tone: "is-unpaid"
  };
}

function getCabPaymentBadgeHtml(order) {
  const methodLabel = getCabPaymentMethodLabel(order);
  const statusMeta = getCabPaymentStatusMeta(order);
  return `<span class="cab-order-payment-badge ${statusMeta.tone}">${statusMeta.icon} Спосіб оплати: ${methodLabel}</span>`;
}

function getCabPaymentStatusHtml(order) {
  const statusMeta = getCabPaymentStatusMeta(order);
  return `<span class="cab-payment-status ${statusMeta.tone}">${statusMeta.label}</span>`;
}

function getCabSummaryStatusBadgeHtml(order) {
  if (isCabOrderCancelled(order)) {
    return `<span class="cab-order-status-badge is-cancelled">⛔ Скасовано</span>`;
  }
  return order?.ttn
    ? `<span class="cab-order-status-badge is-loading" data-ttn-status="${order.ttn}">⏳ Перевіряємо...</span>`
    : `<span class="cab-order-status-badge is-neutral">ℹ️ ТТН відсутня</span>`;
}

function canCancelCabinetOrder(order) {
  if (!order) return false;
  if (String(order?.orderStatus || "").trim() === "cancelled") return false;
  const deliveryStage = String(order?.deliveryStatus?.stage || "").trim();
  if (deliveryStage === "picked_up") return false;
  return true;
}

function getCabCancelButtonHtml(orderType, order) {
  if (!canCancelCabinetOrder(order)) return "";
  return `
    <button type="button" class="cab-cancel-order-btn" data-cancel-type="${orderType}" data-cancel-id="${order?.id || ""}" data-cancel-number="${order?.orderNumber || ""}">
      <span aria-hidden="true">✕</span>
      <span>Скасувати замовлення</span>
    </button>
  `;
}

function showCabCancelReasonDialog(orderLabel) {
  return new Promise((resolve) => {
    const reasons = [
      "Передумав(ла)",
      "Хочу змінити замовлення",
      "Довгий термін очікування",
      "Інше"
    ];
    const overlay = document.createElement("div");
    overlay.className = "cab-cancel-modal";

    const modal = document.createElement("div");
    modal.className = "cab-cancel-modal__card";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="cab-cancel-modal__header">
        <h3 class="cab-cancel-modal__title">Скасування замовлення</h3>
        <p class="cab-cancel-modal__subtitle">${orderLabel || "Оберіть причину скасування"}</p>
      </div>
      <label class="cab-cancel-modal__field">
        <span>Причина</span>
        <div class="cab-cancel-modal__reason-grid" role="listbox" aria-label="Причина скасування">
          ${reasons
            .map((reason) => `<button type="button" class="cab-cancel-modal__reason-option" data-reason="${reason}">${reason}</button>`)
            .join("")}
        </div>
      </label>
      <label class="cab-cancel-modal__field">
        <span>Коментар (необов'язково)</span>
        <input id="cabCancelReasonComment" class="cab-cancel-modal__control" type="text" placeholder="Деталі причини">
      </label>
      <div class="cab-cancel-modal__actions">
        <button type="button" id="cabCancelReasonClose" class="cab-cancel-modal__btn cab-cancel-modal__btn--ghost">Закрити</button>
        <button type="button" id="cabCancelReasonConfirm" class="cab-cancel-modal__btn cab-cancel-modal__btn--danger">Підтвердити</button>
      </div>
    `;

    const onEsc = (event) => {
      if (event.key === "Escape") close(null);
    };
    function close(result) {
      document.removeEventListener("keydown", onEsc);
      overlay.remove();
      resolve(result);
    }

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });
    document.addEventListener("keydown", onEsc);

    const closeBtn = modal.querySelector("#cabCancelReasonClose");
    const confirmBtn = modal.querySelector("#cabCancelReasonConfirm");
    const reasonComment = modal.querySelector("#cabCancelReasonComment");
    const reasonButtons = Array.from(modal.querySelectorAll(".cab-cancel-modal__reason-option"));
    let selectedReason = "";

    const selectReason = (reason) => {
      selectedReason = String(reason || "").trim();
      reasonButtons.forEach((btn) => {
        btn.classList.toggle("is-selected", btn.dataset.reason === selectedReason);
        btn.setAttribute("aria-selected", btn.dataset.reason === selectedReason ? "true" : "false");
      });
    };

    reasonButtons.forEach((btn) => {
      btn.addEventListener("click", () => selectReason(btn.dataset.reason || ""));
    });

    closeBtn?.addEventListener("click", () => close(null));
    confirmBtn?.addEventListener("click", () => {
      const comment = String(reasonComment?.value || "").trim();
      const reason = comment || selectedReason;
      if (!reason) {
        reasonButtons[0]?.focus();
        return;
      }
      close(reason);
    });

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    setTimeout(() => {
      reasonButtons[0]?.focus();
    }, 0);
  });
}

function getCabDeliveryStatusMeta(track) {
  const statusText = String(track?.status || "").trim();
  const statusCode = String(track?.statusCode || "").trim();
  if (!statusText) {
    return { label: "Статус доставки невідомий", tone: "neutral", icon: "ℹ️" };
  }

  const pickedUpCodes = new Set(["9", "10", "11"]);
  const awaitingCodes = new Set(["7", "8"]);
  const createdCodes = new Set(["1", "2"]);
  const inTransitCodes = new Set(["3", "4", "5", "6"]);
  const normalizedText = statusText.toLowerCase();

  if (
    createdCodes.has(statusCode) ||
    normalizedText.includes("створен") ||
    normalizedText.includes("очікує передач") ||
    normalizedText.includes("ще не передано")
  ) {
    return { label: "ТТН створена, очікує передачі в НП", tone: "neutral", icon: "🧾" };
  }

  if (pickedUpCodes.has(statusCode)) return { label: "Отримано клієнтом", tone: "arrived", icon: "✅" };
  if (awaitingCodes.has(statusCode)) return { label: "Прибуло у відділення", tone: "arrived", icon: "📦" };
  if (inTransitCodes.has(statusCode)) return { label: "У дорозі", tone: "transit", icon: "🚚" };
  return { label: statusText, tone: "neutral", icon: "ℹ️" };
}

async function refreshCabinetDeliveryStatuses() {
  if (typeof trackNovaPoshtaTtn !== "function") return;

  const statusNodes = Array.from(document.querySelectorAll("[data-ttn-status]"));
  if (!statusNodes.length) return;

  const uniqueTtns = [...new Set(statusNodes.map((node) => String(node.dataset.ttnStatus || "").trim()).filter(Boolean))];
  if (!uniqueTtns.length) return;

  await Promise.all(
    uniqueTtns.map(async (ttn) => {
      let meta = { label: "Статус недоступний", tone: "neutral", icon: "ℹ️" };
      try {
        const track = await trackNovaPoshtaTtn(ttn);
        meta = getCabDeliveryStatusMeta(track);
      } catch (_) {}

      statusNodes
        .filter((node) => String(node.dataset.ttnStatus || "").trim() === ttn)
        .forEach((node) => {
          node.classList.remove("is-loading", "is-arrived", "is-transit", "is-neutral");
          node.classList.add(
            meta.tone === "arrived" ? "is-arrived" : meta.tone === "transit" ? "is-transit" : "is-neutral"
          );
          node.innerText = `${meta.icon} ${meta.label}`;
        });
    })
  );
}

function renderCabinetOrders(data, profile) {
  const list = document.getElementById("cabOrdersList");
  if (!list) return;

  const regularOrders = Array.isArray(data?.orders) ? data.orders : [];
  const print3dOrders = Array.isArray(data?.print3dOrders) ? data.print3dOrders : [];

  const merged = [
    ...regularOrders.map((order, index) => ({
      type: "shop",
      order,
      key: `shop_${order?.id || order?.orderNumber || index}`,
      createdAtTs: new Date(order?.createdAt || 0).getTime() || 0
    })),
    ...print3dOrders.map((order, index) => ({
      type: "print3d",
      order,
      key: `print3d_${order?.id || index}`,
      createdAtTs: new Date(order?.createdAt || 0).getTime() || 0
    }))
  ].sort((a, b) => b.createdAtTs - a.createdAtTs);

  if (!merged.length) {
    list.innerHTML = "<p>Поки що немає оформлених замовлень.</p>";
    return;
  }

  list.innerHTML = merged
    .map((entry, index) => {
      const order = entry.order || {};
      const orderUiId = String(entry.key || index);

      if (entry.type === "print3d") {
        const delivery = order?.delivery || {};
        const isAddress = delivery?.deliveryType === "address";
        const deliveryPoint = isAddress
          ? (delivery?.address || delivery?.point || "-")
          : (delivery?.branchText || delivery?.point || delivery?.address || "-");
        return `
          <article class="cab-order-card ${isCabOrderCancelled(order) ? "is-cancelled" : ""}">
            <button type="button" class="cab-order-summary" data-order-toggle="${orderUiId}">
              <div>
                <span class="cab-order-number">${order?.orderNumber || `3D #${order?.id || "-"}`}</span>
                <p class="cab-order-meta">${formatCabOrderDate(order?.createdAt)}</p>
                <p class="cab-order-status-row">
                  ${getCabSummaryStatusBadgeHtml(order)}
                </p>
                <p class="cab-order-payment-row">
                  ${getCabPaymentBadgeHtml(order)}
                </p>
              </div>
              <div class="cab-order-summary-right">
                <p><b>${Number(order?.total || 0)} грн</b></p>
                <div class="cab-order-thumbs">
                  <span class="cab-order-thumb cab-order-thumb--label">3D</span>
                </div>
              </div>
            </button>
            <div class="cab-order-details" data-order-details="${orderUiId}">
              <p><b>Тип:</b> 3D-друк</p>
              <p><b>Сума:</b> ${Number(order?.total || 0)} грн</p>
              <p><b>Моделей:</b> ${Number(order?.models || 0)}</p>
              <p><b>Колір замовлення:</b> ${order?.orderColor || "-"}</p>
              <p><b>Статус замовлення:</b> ${getCabOrderLifecycleLabel(order)}</p>
              <p><b>Спосіб оплати:</b> ${getCabPaymentMethodLabel(order)}</p>
              <p><b>Статус оплати:</b> ${getCabPaymentStatusHtml(order)}</p>
              <p><b>Доставка:</b> ${delivery?.city || "-"}, ${deliveryPoint}</p>
              ${order?.ttn ? `<p><b>ТТН:</b> ${order.ttn}</p>` : ""}
              <p><b>Статус доставки:</b> ${order?.ttn ? `<span data-ttn-status="${order.ttn}">Перевіряємо...</span>` : "ТТН відсутня"}</p>
              ${getCabCancelButtonHtml("print3d", order)}
            </div>
          </article>
        `;
      }

      const items = Array.isArray(order?.items) ? order.items : [];
      const thumbsHtml = items
        .slice(0, 5)
        .map((item) => `<img class="cab-order-thumb" src="${getCabOrderItemImage(item)}" alt="${item.name}">`)
        .join("");
      const itemsHtml = items
        .map(
          (item) => `
            <li class="cab-order-item-row">
              <img class="cab-order-item-image" src="${getCabOrderItemImage(item)}" alt="${item.name}">
              <div>
                <p><b>${item.name}</b></p>
                <p>${item.qty} x ${Number(item.price || 0)} грн = ${Number(item.price || 0) * Number(item.qty || 1)} грн</p>
              </div>
            </li>
          `
        )
        .join("");
      return `
        <article class="cab-order-card ${isCabOrderCancelled(order) ? "is-cancelled" : ""}">
          <button type="button" class="cab-order-summary" data-order-toggle="${orderUiId}">
            <div>
              <span class="cab-order-number">№ ${order.orderNumber || "-"}</span>
              <p class="cab-order-meta">${formatCabOrderDate(order.createdAt)}</p>
              <p class="cab-order-status-row">
                ${getCabSummaryStatusBadgeHtml(order)}
              </p>
              <p class="cab-order-payment-row">
                ${getCabPaymentBadgeHtml(order)}
              </p>
            </div>
            <div class="cab-order-summary-right">
              <p><b>${Number(order.total || 0)} грн</b></p>
              <div class="cab-order-thumbs">${thumbsHtml}</div>
            </div>
          </button>
          <div class="cab-order-details" data-order-details="${orderUiId}">
            <p><b>Сума:</b> ${Number(order.total || 0)} грн</p>
            <p><b>Статус замовлення:</b> ${getCabOrderLifecycleLabel(order)}</p>
            <p><b>Спосіб оплати:</b> ${getCabPaymentMethodLabel(order)}</p>
            <p><b>Статус оплати:</b> ${getCabPaymentStatusHtml(order)}</p>
            <p><b>Доставка:</b> ${order?.customer?.delivery?.city || "-"}, ${order?.customer?.delivery?.branchText || "-"}</p>
            ${order?.ttn ? `<p><b>ТТН:</b> ${order.ttn}</p>` : ""}
            <p><b>Статус доставки:</b> ${order?.ttn ? `<span data-ttn-status="${order.ttn}">Перевіряємо...</span>` : "ТТН відсутня"}</p>
            <ul class="cab-order-items">${itemsHtml}</ul>
            ${getCabCancelButtonHtml("shop", order)}
          </div>
        </article>
      `;
    })
    .join("");

  list.querySelectorAll("[data-order-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = list.querySelector(`[data-order-details="${btn.dataset.orderToggle}"]`);
      if (!target) return;
      target.classList.toggle("active");
    });
  });

  list.querySelectorAll(".cab-cancel-order-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (typeof cancelMyOrder !== "function") return;
      const orderType = String(btn.dataset.cancelType || "shop").trim();
      const orderId = String(btn.dataset.cancelId || "").trim();
      const orderNumber = String(btn.dataset.cancelNumber || "").trim();
      const reason = await showCabCancelReasonDialog(`Замовлення ${orderNumber || orderId || ""}`);
      if (!reason) return;

      const originalHtml = btn.innerHTML;
      btn.disabled = true;
      btn.innerText = "Скасовуємо...";
      try {
        await cancelMyOrder({
          orderType,
          orderId,
          orderNumber,
          id: profile?.id,
          email: profile?.email,
          phone: profile?.phone,
          reason
        });
        showCabinetMessage("Замовлення скасовано", false);
        await loadCabinetOrders(profile);
      } catch (error) {
        showCabinetMessage(error.message || "Не вдалося скасувати замовлення");
        btn.disabled = false;
        btn.innerHTML = originalHtml;
      }
    });
  });
}

async function loadCabinetOrders(profile) {
  if (typeof getMyOrders !== "function") return;
  const list = document.getElementById("cabOrdersList");
  if (list) list.innerHTML = "<p>Завантаження...</p>";
  try {
    const data = await getMyOrders(profile);
    renderCabinetOrders({
      orders: data?.orders || [],
      print3dOrders: data?.print3dOrders || profile?.print3dOrders || []
    }, profile);
    await refreshCabinetDeliveryStatuses();
  } catch (error) {
    renderCabinetOrders({
      orders: [],
      print3dOrders: profile?.print3dOrders || []
    }, profile);
  }
}

function setupCabinetSections() {
  const personal = document.getElementById("cabPersonalSection");
  const orders = document.getElementById("cabOrdersSection");
  const buttons = Array.from(document.querySelectorAll(".cabinet-nav-btn[data-section]"));
  if (!personal || !orders || !buttons.length) return;

  const show = (section) => {
    personal.style.display = section === "personal" ? "block" : "none";
    orders.style.display = section === "orders" ? "block" : "none";
    buttons.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.section === section);
    });
  };

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => show(btn.dataset.section));
  });
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
  let cabProvider = profile?.delivery?.provider || "";
  if (
    !cabProvider &&
    (profile?.delivery?.city ||
      profile?.delivery?.cityRef ||
      profile?.delivery?.branch ||
      profile?.delivery?.branchText)
  ) {
    cabProvider = "nova_poshta";
  }
  document.getElementById("cabProvider").value = cabProvider;
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

    if (!provider) {
      deliveryTypeWrap.style.display = "none";
      cityWrap.style.display = "none";
      branchWrap.style.display = "none";
      addressWrap.style.display = "none";
      return;
    }

    deliveryTypeWrap.style.display = isNova ? "grid" : "none";
    cityWrap.style.display = "grid";
    branchWrap.style.display = isNova && deliveryType === "address" ? "none" : "grid";
    addressWrap.style.display = isNova && deliveryType === "address" ? "grid" : "none";
    cityEl.placeholder = isNova ? "Почніть вводити місто..." : "Місто";
    branchWrap.firstChild.textContent = deliveryType === "postomat" ? "Обрати поштомат" : "Обрати відділення";
    branchEl.placeholder = deliveryType === "postomat" ? "Почніть вводити поштомат..." : "Почніть вводити відділення...";
    // У профілі поля доставки не обов'язкові.
    branchEl.required = false;
    addressEl.required = false;

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
  if (cabBranchSelectionInProgress) return;

  const branchEl = document.getElementById("cabBranch");
  const branchRefEl = document.getElementById("cabBranchRef");
  const query = branchEl.value.trim().toLowerCase();
  if (!query) {
    branchRefEl.value = "";
    renderCabBranchSuggestions([]);
    return;
  }

  const exact = cabBranchOptions.find((w) => (w.Description || "").toLowerCase() === query);
  if (exact) {
    branchEl.value = exact.Description;
    branchRefEl.value = exact.Ref;
    renderCabBranchSuggestions([]);
    return;
  }

  const partial = cabBranchOptions.filter((w) => (w.Description || "").toLowerCase().includes(query));
  if (partial.length === 1) {
    branchEl.value = partial[0].Description;
    branchRefEl.value = partial[0].Ref;
  } else {
    branchRefEl.value = "";
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
    if (!btn || btn.disabled) return;
    event.preventDefault();
    cabBranchSelectionInProgress = true;
    branchEl.value = btn.dataset.name || "";
    branchRefEl.value = btn.dataset.ref || "";
    renderCabBranchSuggestions([]);
    setTimeout(() => {
      cabBranchSelectionInProgress = false;
    }, 0);
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

document.addEventListener("DOMContentLoaded", async () => {
  const profile = getProfile();
  if (!profile?.id) {
    window.location.href = "index.html";
    return;
  }

  fillCabinet(profile);
  setupCabinetSections();
  setupCabinetDeliveryUI();
  if (typeof initCatalogCustomSelect === "function") {
    initCatalogCustomSelect("cabProvider");
    initCatalogCustomSelect("cabDeliveryType");
  }
  if (typeof syncCatalogSelectUI === "function") {
    const pWrap = document.getElementById("cabProvider")?.closest(".catalog-select-wrap");
    const dWrap = document.getElementById("cabDeliveryType")?.closest(".catalog-select-wrap");
    if (pWrap) syncCatalogSelectUI(pWrap);
    if (dWrap) syncCatalogSelectUI(dWrap);
  }
  loadCabinetOrders(profile);
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
  await hydrateFavoritesFromProfile(profile);
  renderFavoritesList();
  document.getElementById("cabinetForm").addEventListener("submit", saveCabinet);
  document.getElementById("logoutBtn").addEventListener("click", logout);
});
