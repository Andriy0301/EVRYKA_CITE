function showAdminOrdersMessage(message, isError = true) {
  const el = document.getElementById("adminOrdersMessage");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

let adminOrdersCache = null;
let adminAutoSyncAttempted = false;

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function paymentLabel(value) {
  if (value === "mono") return "Оплата Monobank";
  if (value === "cod") return "Оплата при отриманні";
  return value || "-";
}

function deliveryStageLabel(stage) {
  if (stage === "created") return "ТТН створена, очікує передачі в НП";
  if (stage === "picked_up") return "Отримано клієнтом";
  if (stage === "awaiting_pickup") return "Очікує у відділенні/поштоматі";
  if (stage === "in_transit") return "У дорозі";
  return "Невідомо";
}

function formatOrderStatus(order) {
  const ds = order?.deliveryStatus || {};
  const stageLabel = deliveryStageLabel(ds.stage);
  const sourceText = ds.text ? `${stageLabel} (${ds.text})` : stageLabel;
  if (!order?.ttn) return "ТТН відсутня";
  return sourceText;
}

function isAwaitingLong(order) {
  const awaitingSince = String(order?.deliveryStatus?.awaitingPickupSince || "").trim();
  if (!awaitingSince) return false;
  const sinceTs = Date.parse(awaitingSince);
  if (!Number.isFinite(sinceTs)) return false;
  const hours = (Date.now() - sinceTs) / 36e5;
  return hours >= 72;
}

function applyOrderFilter(orders) {
  const filter = document.getElementById("adminOrderFilter")?.value || "all";
  if (filter === "without_ttn") {
    return orders.filter((entry) => !String(entry?.order?.ttn || "").trim());
  }
  if (filter === "picked_up") {
    return orders.filter((entry) => String(entry?.order?.deliveryStatus?.stage || "") === "picked_up");
  }
  if (filter === "awaiting_long") {
    return orders.filter((entry) => String(entry?.order?.deliveryStatus?.stage || "") === "awaiting_pickup" && isAwaitingLong(entry.order));
  }
  return orders;
}

function renderAdminOrders(payload) {
  const list = document.getElementById("adminOrdersList");
  if (!list) return;

  const shopOrders = Array.isArray(payload?.orders) ? payload.orders : [];
  const print3dOrders = Array.isArray(payload?.print3dOrders) ? payload.print3dOrders : [];
  const merged = [
    ...shopOrders.map((order) => ({ kind: "shop", order })),
    ...print3dOrders.map((order) => ({ kind: "print3d", order }))
  ].sort((a, b) => {
    const aTs = new Date(a?.order?.createdAt || 0).getTime() || 0;
    const bTs = new Date(b?.order?.createdAt || 0).getTime() || 0;
    return bTs - aTs;
  });
  const filtered = applyOrderFilter(merged);

  if (!filtered.length) {
    list.innerHTML = `<div class="admin-order-card">Поки немає замовлень.</div>`;
    return;
  }

  list.innerHTML = filtered
    .map((entry) => {
      const order = entry.order || {};
      const delivery = order?.customer?.delivery || {};
      const items = (order?.items || order?.files || [])
        .map((item) => `<li>${escapeHtml(item.name || item.originalname || "Позиція")} x ${Number(item.qty || 1)}</li>`)
        .join("");
      const deliveryPoint = delivery?.branchText || delivery?.point || "-";
      return `
        <article class="admin-order-card">
          <p><b>Тип:</b> ${entry.kind === "print3d" ? "3D-друк" : "Магазин"}</p>
          <p><b>Номер:</b> ${escapeHtml(order.orderNumber)}</p>
          <p><b>Дата:</b> ${new Date(order.createdAt).toLocaleString("uk-UA")}</p>
          <p><b>Клієнт:</b> ${escapeHtml(order?.customer?.lastName)} ${escapeHtml(order?.customer?.name)}</p>
          <p><b>Телефон:</b> ${escapeHtml(order?.customer?.phone)}</p>
          <p><b>Email:</b> ${escapeHtml(order?.customer?.email)}</p>
          <p><b>Доставка:</b> ${escapeHtml(delivery.provider)} / ${escapeHtml(delivery.deliveryType)}</p>
          <p><b>Оплата:</b> ${escapeHtml(paymentLabel(delivery.paymentMethod || "cod"))}</p>
          <p><b>Місто:</b> ${escapeHtml(delivery.city)}</p>
          <p><b>Точка:</b> ${escapeHtml(deliveryPoint)}</p>
          <p><b>Адреса:</b> ${escapeHtml(delivery.address)}</p>
          <p><b>ТТН:</b> ${escapeHtml(order.ttn || "-")}</p>
          <p><b>Статус замовлення:</b> ${escapeHtml(formatOrderStatus(order))}</p>
          <p><b>Остання перевірка:</b> ${escapeHtml(order?.deliveryStatus?.lastCheckedAt || "-")}</p>
          <p><b>Сума:</b> ${Number(order.total || 0)} грн</p>
          <ul>${items}</ul>
        </article>
      `;
    })
    .join("");
}

function renderCrmEvents(events = []) {
  const el = document.getElementById("adminCrmEvents");
  if (!el) return;
  const filter = document.getElementById("adminCrmFilter")?.value || "all";
  const filtered =
    filter === "all"
      ? events
      : (events || []).filter((evt) => String(evt?.crmStatus || "in_progress") === filter);
  if (!Array.isArray(filtered) || !filtered.length) {
    el.innerHTML = "<p>CRM-подій поки немає.</p>";
    return;
  }
  el.innerHTML = filtered
    .slice(0, 25)
    .map((evt) => {
      const currentStatus = String(evt.crmStatus || "in_progress");
      return `
        <div class="admin-order-card">
          <p><b>${escapeHtml(evt.eventType || "event")}</b></p>
          <p>${escapeHtml(evt.createdAt || "-")}</p>
          <p>Замовлення: ${escapeHtml(evt.orderNumber || evt.orderId || "-")} (${escapeHtml(evt.orderType || "-")})</p>
          <p>ТТН: ${escapeHtml(evt.ttn || "-")}</p>
          <p>Статус: ${escapeHtml(evt.deliveryText || evt.deliveryStage || "-")}</p>
          <label>CRM-статус
            <select class="admin-crm-status-select" data-event-id="${escapeHtml(evt.id)}">
              <option value="in_progress" ${currentStatus === "in_progress" ? "selected" : ""}>В роботі</option>
              <option value="reminded" ${currentStatus === "reminded" ? "selected" : ""}>Нагадано</option>
              <option value="closed" ${currentStatus === "closed" ? "selected" : ""}>Закрито</option>
            </select>
          </label>
        </div>
      `;
    })
    .join("");

  bindCrmStatusEvents();
}

function bindCrmStatusEvents() {
  document.querySelectorAll(".admin-crm-status-select").forEach((selectEl) => {
    selectEl.addEventListener("change", async () => {
      const eventId = selectEl.dataset.eventId || "";
      const status = selectEl.value;
      const key = document.getElementById("adminKeyInput")?.value?.trim();
      if (!key) {
        showAdminOrdersMessage("Введіть адмін-ключ");
        return;
      }
      try {
        await updateCrmEventStatus(key, eventId, status);
        if (adminOrdersCache?.crmNotifications) {
          const event = adminOrdersCache.crmNotifications.find((x) => String(x.id) === String(eventId));
          if (event) event.crmStatus = status;
        }
        showAdminOrdersMessage("CRM-статус оновлено", false);
      } catch (error) {
        showAdminOrdersMessage(error.message || "Не вдалося оновити CRM-статус");
      }
    });
  });
}

function rerenderFromCache() {
  if (!adminOrdersCache) return;
  renderAdminOrders(adminOrdersCache);
  const crmEvents = Array.isArray(adminOrdersCache?.crmNotifications) && adminOrdersCache.crmNotifications.length
    ? adminOrdersCache.crmNotifications
    : syntheticCrmEventsFromOrders(adminOrdersCache);
  renderCrmEvents(crmEvents);
}

function getAllOrdersWithTtn(payload) {
  const shopOrders = Array.isArray(payload?.orders) ? payload.orders : [];
  const print3dOrders = Array.isArray(payload?.print3dOrders) ? payload.print3dOrders : [];
  return [...shopOrders, ...print3dOrders].filter((order) => String(order?.ttn || "").trim());
}

function syntheticCrmEventsFromOrders(payload) {
  return getAllOrdersWithTtn(payload).map((order, index) => ({
    id: `synthetic_${order?.id || order?.orderNumber || index}`,
    eventType: "tracking_snapshot",
    createdAt: order?.deliveryStatus?.lastCheckedAt || order?.createdAt || new Date().toISOString(),
    orderNumber: order?.orderNumber || null,
    orderId: order?.id || null,
    orderType: Array.isArray(order?.items) ? "shop" : "print3d",
    ttn: order?.ttn || null,
    deliveryStage: order?.deliveryStatus?.stage || "unknown",
    deliveryText: order?.deliveryStatus?.text || "Синхронізація ще не запускалась",
    crmStatus: "in_progress"
  }));
}

function setTtnStatusMessage(message, isError = false) {
  const el = document.getElementById("adminTtnStatusResult");
  if (!el) return;
  el.textContent = message || "";
  el.style.color = isError ? "#b00020" : "#1b7f3a";
}

async function onCheckTtnStatus() {
  const ttn = document.getElementById("adminTtnInput")?.value?.trim();
  if (!ttn) {
    setTtnStatusMessage("Введіть ТТН", true);
    return;
  }
  setTtnStatusMessage("Перевіряємо...");
  try {
    const info = await trackNovaPoshtaTtn(ttn);
    const text = info?.status || "Невідомий статус";
    const code = info?.statusCode ? ` (код ${info.statusCode})` : "";
    const deliveryPoint = info?.warehouseRecipient ? `\nПункт видачі: ${info.warehouseRecipient}` : "";
    setTtnStatusMessage(`Статус: ${text}${code}${deliveryPoint}`, false);
  } catch (error) {
    setTtnStatusMessage(error.message || "Не вдалося перевірити ТТН", true);
  }
}

async function onLoadOrders() {
  const key = document.getElementById("adminKeyInput")?.value?.trim();
  if (!key) {
    showAdminOrdersMessage("Введіть адмін-ключ");
    return;
  }

  try {
    const data = await getAllOrders(key);
    const hasEvents = Array.isArray(data?.crmNotifications) && data.crmNotifications.length > 0;
    const hasTtnOrders = getAllOrdersWithTtn(data).length > 0;
    if (!hasEvents && hasTtnOrders && !adminAutoSyncAttempted) {
      adminAutoSyncAttempted = true;
      await syncAllOrderStatuses(key);
      const fresh = await getAllOrders(key);
      adminOrdersCache = fresh || {};
      const crmEvents = Array.isArray(fresh?.crmNotifications) && fresh.crmNotifications.length
        ? fresh.crmNotifications
        : syntheticCrmEventsFromOrders(fresh);
      renderAdminOrders(fresh || {});
      renderCrmEvents(crmEvents);
      const totalShopFresh = Array.isArray(fresh?.orders) ? fresh.orders.length : 0;
      const total3dFresh = Array.isArray(fresh?.print3dOrders) ? fresh.print3dOrders.length : 0;
      const syncAtFresh = fresh?.statusSync?.lastRunAt || "щойно";
      showAdminOrdersMessage(
        `Завантажено: магазин ${totalShopFresh}, 3D ${total3dFresh}. Остання синхронізація: ${syncAtFresh}`,
        false
      );
      return;
    }

    adminOrdersCache = data || {};
    renderAdminOrders(data || {});
    const crmEvents = Array.isArray(data?.crmNotifications) && data.crmNotifications.length
      ? data.crmNotifications
      : syntheticCrmEventsFromOrders(data);
    renderCrmEvents(crmEvents);
    const totalShop = Array.isArray(data?.orders) ? data.orders.length : 0;
    const total3d = Array.isArray(data?.print3dOrders) ? data.print3dOrders.length : 0;
    const syncAt = data?.statusSync?.lastRunAt || "ще не запускалась";
    showAdminOrdersMessage(`Завантажено: магазин ${totalShop}, 3D ${total3d}. Остання синхронізація: ${syncAt}`, false);
  } catch (error) {
    renderAdminOrders({});
    renderCrmEvents([]);
    showAdminOrdersMessage(error.message || "Помилка завантаження");
  }
}

async function onSyncStatuses() {
  const key = document.getElementById("adminKeyInput")?.value?.trim();
  if (!key) {
    showAdminOrdersMessage("Введіть адмін-ключ");
    return;
  }
  showAdminOrdersMessage("Синхронізуємо статуси...");
  try {
    const result = await syncAllOrderStatuses(key);
    showAdminOrdersMessage(
      `Синхронізація завершена: tracked shop ${Number(result?.trackedShop || 0)}, tracked 3D ${Number(result?.trackedPrint3d || 0)}`,
      false
    );
    await onLoadOrders();
  } catch (error) {
    showAdminOrdersMessage(error.message || "Не вдалося синхронізувати статуси");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("loadOrdersBtn")?.addEventListener("click", onLoadOrders);
  document.getElementById("syncStatusesBtn")?.addEventListener("click", onSyncStatuses);
  document.getElementById("adminOrderFilter")?.addEventListener("change", rerenderFromCache);
  document.getElementById("adminCrmFilter")?.addEventListener("change", rerenderFromCache);
  document.getElementById("checkTtnBtn")?.addEventListener("click", onCheckTtnStatus);
});
