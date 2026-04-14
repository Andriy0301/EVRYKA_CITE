const { sendTelegramText } = require("./telegram");
const { getList, setList, getObject, setObject } = require("./data-store");

const NOVA_POSHTA_API_URL = "https://api.novaposhta.ua/v2.0/json/";
const NOVA_POSHTA_API_KEY =
  process.env.NOVA_POSHTA_API_KEY || "c21832386bc9bfa724d114721295a7f2";

const DEFAULT_SYNC_INTERVAL_MS = 3 * 60 * 60 * 1000;
const DEFAULT_REMINDER_HOURS = 72;
const MAX_CRM_EVENTS = 5000;

const SYNC_INTERVAL_MS = Math.max(
  15 * 60 * 1000,
  Number(process.env.ORDER_STATUS_SYNC_INTERVAL_MS || DEFAULT_SYNC_INTERVAL_MS)
);
const PICKUP_REMINDER_HOURS = Math.max(
  1,
  Number(process.env.ORDER_PICKUP_REMINDER_HOURS || DEFAULT_REMINDER_HOURS)
);

let loopStarted = false;
let syncInProgress = false;

function parseDateSafe(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  const nativeTs = Date.parse(text);
  if (Number.isFinite(nativeTs)) return new Date(nativeTs);

  const ddmmyyyy = text.match(/^(\d{2})\.(\d{2})\.(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (ddmmyyyy) {
    const [, dd, mm, yyyy, hh = "00", mi = "00", ss = "00"] = ddmmyyyy;
    const date = new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(mi), Number(ss));
    return Number.isFinite(date.getTime()) ? date : null;
  }
  return null;
}

function classifyNovaPoshtaStage(statusCode, statusText) {
  const code = String(statusCode || "").trim();
  const text = String(statusText || "").trim().toLowerCase();
  const pickedUpCodes = new Set(["9", "10", "11"]);
  const awaitingCodes = new Set(["7", "8"]);
  const createdCodes = new Set(["1", "2"]);
  const inTransitCodes = new Set(["3", "4", "5", "6"]);

  if (
    createdCodes.has(code) ||
    text.includes("створен") ||
    text.includes("очікує передач") ||
    text.includes("ще не передано")
  ) {
    return "created";
  }

  if (pickedUpCodes.has(code) || text.includes("отрим")) return "picked_up";
  if (
    awaitingCodes.has(code) ||
    text.includes("відділен") ||
    text.includes("поштомат") ||
    text.includes("прибул")
  ) {
    return "awaiting_pickup";
  }
  if (inTransitCodes.has(code) || text.includes("дороз") || text.includes("транзит")) return "in_transit";
  return "unknown";
}

async function trackNovaPoshtaTtn(ttn) {
  const res = await fetch(NOVA_POSHTA_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      apiKey: NOVA_POSHTA_API_KEY,
      modelName: "TrackingDocument",
      calledMethod: "getStatusDocuments",
      methodProperties: {
        Documents: [{ DocumentNumber: String(ttn || "").trim(), Phone: "" }]
      }
    })
  });

  if (!res.ok) {
    throw new Error(`NP HTTP ${res.status}`);
  }
  const body = await res.json();
  if (!body.success) {
    const msg = body.errors?.[0] || body.warnings?.[0] || "NP tracking failed";
    throw new Error(msg);
  }
  return body.data?.[0] || {};
}

function buildReminderText(orderType, order, deliveryStatus) {
  const customer = order?.customer || {};
  const delivery = customer?.delivery || {};
  const deliveryPoint = delivery?.branchText || delivery?.point || delivery?.address || "—";
  const city = delivery?.city || "—";
  return [
    "Нагадування CRM: посилка довго очікує на видачу",
    "",
    `Тип замовлення: ${orderType === "print3d" ? "3D-друк" : "Магазин"}`,
    `Номер замовлення: ${order?.orderNumber || order?.id || "—"}`,
    `Клієнт: ${[customer?.lastName, customer?.name].filter(Boolean).join(" ").trim() || "—"}`,
    `Телефон: ${customer?.phone || "—"}`,
    `Email: ${customer?.email || "—"}`,
    `Місто: ${city}`,
    `Точка видачі: ${deliveryPoint}`,
    `ТТН: ${order?.ttn || "—"}`,
    `Статус НП: ${deliveryStatus?.text || "—"}`
  ].join("\n");
}

function makeCrmEvent(eventType, orderType, order, deliveryStatus, extra = {}) {
  return {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
    createdAt: new Date().toISOString(),
    eventType,
    orderType,
    orderId: order?.id || null,
    orderNumber: order?.orderNumber || null,
    ttn: order?.ttn || null,
    deliveryStage: deliveryStatus?.stage || null,
    deliveryCode: deliveryStatus?.code || null,
    deliveryText: deliveryStatus?.text || null,
    crmStatus: "in_progress",
    notificationChannel: "telegram",
    ...extra
  };
}

function getAwaitingSinceIso(trackDoc, nowIso) {
  const receivedDate = parseDateSafe(trackDoc?.DateReceived || trackDoc?.ActualDeliveryDate || "");
  return receivedDate ? receivedDate.toISOString() : nowIso;
}

async function syncOrdersCollection(orders, orderType) {
  const now = new Date();
  const nowIso = now.toISOString();
  const events = [];
  let changed = false;
  let trackedCount = 0;

  for (const order of orders) {
    const ttn = String(order?.ttn || "").trim();
    if (!ttn) continue;
    if (String(order?.orderStatus || "").trim() === "cancelled") continue;

    const prevStatus = order?.deliveryStatus || {};
    if (String(prevStatus.stage || "") === "picked_up") continue;

    try {
      const trackDoc = await trackNovaPoshtaTtn(ttn);
      trackedCount += 1;
      const code = String(trackDoc?.StatusCode || "").trim();
      const text = String(trackDoc?.Status || "").trim();
      const stage = classifyNovaPoshtaStage(code, text);
      const prevCode = String(prevStatus.code || "").trim();
      const prevText = String(prevStatus.text || "").trim();
      const prevStage = String(prevStatus.stage || "").trim();
      const statusChanged = prevCode !== code || prevText !== text || prevStage !== stage;

      const nextStatus = {
        source: "nova_poshta",
        code,
        text,
        stage,
        warehouseRecipient: String(trackDoc?.WarehouseRecipient || "").trim(),
        warehouseSender: String(trackDoc?.WarehouseSender || "").trim(),
        actualDeliveryDate: String(trackDoc?.ActualDeliveryDate || "").trim(),
        scheduledDeliveryDate: String(trackDoc?.ScheduledDeliveryDate || "").trim(),
        dateReceived: String(trackDoc?.DateReceived || "").trim(),
        lastCheckedAt: nowIso,
        lastChangedAt: statusChanged ? nowIso : String(prevStatus.lastChangedAt || nowIso),
        awaitingPickupSince: prevStatus.awaitingPickupSince || null,
        reminderSentAt: prevStatus.reminderSentAt || null,
        pickedUpAt: prevStatus.pickedUpAt || null
      };

      if (stage === "awaiting_pickup" && !nextStatus.awaitingPickupSince) {
        nextStatus.awaitingPickupSince = getAwaitingSinceIso(trackDoc, nowIso);
      }
      if (stage !== "awaiting_pickup") {
        nextStatus.awaitingPickupSince = null;
      }
      if (stage === "picked_up" && !nextStatus.pickedUpAt) {
        nextStatus.pickedUpAt = nowIso;
      }

      if (statusChanged) {
        events.push(
          makeCrmEvent("delivery_status_changed", orderType, order, nextStatus, {
            previousStage: prevStage || null,
            previousCode: prevCode || null,
            previousText: prevText || null
          })
        );
      }

      if (stage === "picked_up" && !prevStatus.pickedUpAt) {
        events.push(makeCrmEvent("order_picked_up", orderType, order, nextStatus));
      }

      if (stage === "awaiting_pickup" && !nextStatus.reminderSentAt) {
        const awaitingFrom = parseDateSafe(nextStatus.awaitingPickupSince);
        const awaitingHours = awaitingFrom ? (now.getTime() - awaitingFrom.getTime()) / 36e5 : 0;
        if (awaitingHours >= PICKUP_REMINDER_HOURS) {
          const message = buildReminderText(orderType, order, nextStatus);
          const sent = await sendTelegramText(message);
          nextStatus.reminderSentAt = nowIso;
          events.push(
            makeCrmEvent("pickup_reminder_triggered", orderType, order, nextStatus, {
              awaitingHours: Math.round(awaitingHours),
              telegram: sent?.ok ? "sent" : sent?.skipped ? "skipped" : "failed"
            })
          );
        }
      }

      const prevJson = JSON.stringify(prevStatus || {});
      const nextJson = JSON.stringify(nextStatus);
      if (prevJson !== nextJson) {
        order.deliveryStatus = nextStatus;
        changed = true;
      }
    } catch (error) {
      events.push(
        makeCrmEvent("delivery_status_sync_error", orderType, order, prevStatus, {
          error: String(error?.message || error || "sync_error")
        })
      );
    }
  }

  return { changed, trackedCount, events };
}

async function syncOrderStatusesOnce() {
  if (syncInProgress) {
    return { skipped: true, reason: "sync_in_progress" };
  }
  syncInProgress = true;

  const startedAt = new Date();
  try {
    const orders = await getList("orders");
    const print3dOrders = await getList("print3dOrders");
    const shopSync = await syncOrdersCollection(orders, "shop");
    const print3dSync = await syncOrdersCollection(print3dOrders, "print3d");

    if (shopSync.changed) await setList("orders", orders);
    if (print3dSync.changed) await setList("print3dOrders", print3dOrders);

    const newEvents = [...shopSync.events, ...print3dSync.events];
    if (newEvents.length) {
      const existing = await getList("crmNotifications");
      const merged = [...newEvents, ...existing].slice(0, MAX_CRM_EVENTS);
      await setList("crmNotifications", merged);
    }

    const state = await getObject("statusSync");
    await setObject("statusSync", {
      ...state,
      lastRunAt: new Date().toISOString(),
      lastRunResult: {
        trackedShop: shopSync.trackedCount,
        trackedPrint3d: print3dSync.trackedCount,
        eventsCreated: newEvents.length,
        startedAt: startedAt.toISOString(),
        finishedAt: new Date().toISOString()
      }
    });

    return {
      ok: true,
      trackedShop: shopSync.trackedCount,
      trackedPrint3d: print3dSync.trackedCount,
      eventsCreated: newEvents.length
    };
  } catch (error) {
    const state = await getObject("statusSync");
    await setObject("statusSync", {
      ...state,
      lastRunAt: new Date().toISOString(),
      lastError: String(error?.message || error || "sync_failed")
    });
    return { ok: false, error: String(error?.message || error || "sync_failed") };
  } finally {
    syncInProgress = false;
  }
}

function startOrderStatusSyncLoop() {
  if (loopStarted) return;
  loopStarted = true;

  setTimeout(() => {
    syncOrderStatusesOnce().catch(() => null);
  }, 2000);

  setInterval(() => {
    syncOrderStatusesOnce().catch(() => null);
  }, SYNC_INTERVAL_MS);
}

module.exports = {
  syncOrderStatusesOnce,
  startOrderStatusSyncLoop
};
