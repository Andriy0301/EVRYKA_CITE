const express = require("express");
const fs = require("fs");
const path = require("path");
const { ensureClientIds, findUserByIdentity } = require("../utils/client-id");
const {
  syncOrderStatusesOnce,
  CRM_NOTIFICATIONS_PATH,
  STATUS_SYNC_STATE_PATH
} = require("../utils/order-status-sync");

const router = express.Router();
const ordersPath = path.join(__dirname, "../data/orders.json");
const print3dOrdersPath = path.join(__dirname, "../data/print3d-orders.json");
const usersPath = path.join(__dirname, "../data/users.json");
const { notifyNewOrder, sendTelegramText } = require("../utils/telegram");
const ADMIN_ORDERS_KEY = process.env.ADMIN_ORDERS_KEY || "31415";

function readOrders() {
  try {
    if (!fs.existsSync(ordersPath)) {
      fs.writeFileSync(ordersPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(ordersPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeOrders(orders) {
  fs.writeFileSync(ordersPath, JSON.stringify(orders, null, 2));
}

function readPrint3dOrders() {
  try {
    if (!fs.existsSync(print3dOrdersPath)) {
      fs.writeFileSync(print3dOrdersPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(print3dOrdersPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function readCrmNotifications() {
  try {
    if (!fs.existsSync(CRM_NOTIFICATIONS_PATH)) return [];
    const raw = fs.readFileSync(CRM_NOTIFICATIONS_PATH, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCrmNotifications(events) {
  fs.mkdirSync(path.dirname(CRM_NOTIFICATIONS_PATH), { recursive: true });
  fs.writeFileSync(CRM_NOTIFICATIONS_PATH, JSON.stringify(events, null, 2));
}

function readStatusSyncState() {
  try {
    if (!fs.existsSync(STATUS_SYNC_STATE_PATH)) return {};
    const raw = fs.readFileSync(STATUS_SYNC_STATE_PATH, "utf8");
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function readUsers() {
  try {
    if (!fs.existsSync(usersPath)) {
      fs.writeFileSync(usersPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(usersPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];
    const { users, changed } = ensureClientIds(Array.isArray(parsed) ? parsed : []);
    if (changed) fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    return users;
  } catch {
    return [];
  }
}

function normalizeItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: Number(item?.id),
      name: String(item?.name || "").trim(),
      price: Number(item?.price || 0),
      qty: Math.max(1, Number(item?.qty || 1)),
      image: String(item?.image || "").trim()
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

function normalizeIdentity(input = {}) {
  return {
    id: String(input?.id || "").trim(),
    email: String(input?.email || "").trim().toLowerCase(),
    phone: String(input?.phone || "").trim()
  };
}

function orderBelongsToIdentity(order, identity) {
  const customer = order?.customer || {};
  return (
    (identity.id && String(customer.id || "").trim() === identity.id) ||
    (identity.email && String(customer.email || "").trim().toLowerCase() === identity.email) ||
    (identity.phone && String(customer.phone || "").trim() === identity.phone)
  );
}

function canCancelOrder(order) {
  if (!order || String(order?.orderStatus || "").trim() === "cancelled") return false;
  const deliveryStage = String(order?.deliveryStatus?.stage || "").trim();
  if (deliveryStage === "picked_up") return false;
  return true;
}

router.post("/", (req, res) => {
  const { customer = {}, items = [], total = 0, ttn = "", orderNumber: incomingOrderNumber = "" } = req.body || {};
  const normalizedItems = normalizeItems(items);

  if (!normalizedItems.length) {
    return res.status(400).json({ error: "Немає товарів у замовленні" });
  }

  const orderNumber = String(incomingOrderNumber || "").trim() || `EVR-${Date.now().toString().slice(-8)}`;
  const users = readUsers();
  const matchedUser = findUserByIdentity(users, {
    id: customer?.id,
    clientId: customer?.clientId,
    email: customer?.email,
    phone: customer?.phone
  });
  const resolvedClientId = String(customer?.clientId || matchedUser?.clientId || "").trim();
  const savedOrder = {
    id: Date.now(),
    orderNumber,
    createdAt: new Date().toISOString(),
    customer: {
      id: String(customer?.id || "").trim(),
      clientId: resolvedClientId,
      name: String(customer?.name || "").trim(),
      lastName: String(customer?.lastName || "").trim(),
      middleName: String(customer?.middleName || "").trim(),
      phone: String(customer?.phone || "").trim(),
      email: String(customer?.email || "").trim().toLowerCase(),
      delivery: {
        provider: String(customer?.delivery?.provider || "").trim(),
        deliveryType: String(customer?.delivery?.deliveryType || "").trim(),
        paymentMethod: String(customer?.delivery?.paymentMethod || "cod").trim(),
        city: String(customer?.delivery?.city || "").trim(),
        branchText: String(customer?.delivery?.branchText || "").trim(),
        address: String(customer?.delivery?.address || "").trim()
      }
    },
    items: normalizedItems,
    total: Math.max(0, Number(total || 0)),
    ttn: String(ttn || "").trim(),
    orderStatus: "new"
  };

  const orders = readOrders();
  orders.unshift(savedOrder);
  writeOrders(orders);

  notifyNewOrder(savedOrder)
    .then((r) => {
      if (r?.skipped) {
        console.warn("[telegram] Замовлення збережено, але Telegram вимкнено (немає змінних середовища).");
      } else if (!r?.ok) {
        console.error("[telegram] sendMessage (замовлення) не вдався:", r?.status, r?.detail);
      }
    })
    .catch((e) => console.error("[telegram]", e?.message || e));

  return res.json(savedOrder);
});

router.get("/my", (req, res) => {
  const id = String(req.query.id || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();
  const phone = String(req.query.phone || "").trim();

  if (!id && !email && !phone) {
    return res.status(400).json({ error: "id/email/phone is required" });
  }

  const orders = readOrders();
  const users = readUsers();
  const filtered = orders.filter((order) => {
    const customer = order?.customer || {};
    return (
      (id && String(customer.id || "").trim() === id) ||
      (email && String(customer.email || "").trim().toLowerCase() === email) ||
      (phone && String(customer.phone || "").trim() === phone)
    );
  });

  const user = users.find((u) => {
    return (
      (id && String(u.id || "").trim() === id) ||
      (email && String(u.email || "").trim().toLowerCase() === email) ||
      (phone && String(u.phone || "").trim() === phone)
    );
  });
  const print3dOrders = Array.isArray(user?.print3dOrders) ? user.print3dOrders : [];

  return res.json({ orders: filtered, print3dOrders });
});

router.get("/all", (req, res) => {
  const key = String(req.query.key || req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_ORDERS_KEY) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }
  return res.json({
    orders: readOrders(),
    print3dOrders: readPrint3dOrders(),
    crmNotifications: readCrmNotifications().slice(0, 200),
    statusSync: readStatusSyncState()
  });
});

router.post("/sync-status", async (req, res) => {
  const key = String(req.body?.key || req.query.key || req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_ORDERS_KEY) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }

  const result = await syncOrderStatusesOnce();
  if (!result?.ok && !result?.skipped) {
    return res.status(500).json({ error: result.error || "Помилка синхронізації" });
  }
  return res.json(result);
});

router.post("/crm-events/status", (req, res) => {
  const key = String(req.body?.key || req.query.key || req.headers["x-admin-key"] || "").trim();
  if (!key || key !== ADMIN_ORDERS_KEY) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }

  const eventId = String(req.body?.eventId || "").trim();
  const status = String(req.body?.status || "").trim();
  const allowed = new Set(["in_progress", "reminded", "closed"]);
  if (!eventId) {
    return res.status(400).json({ error: "eventId обов'язковий" });
  }
  if (!allowed.has(status)) {
    return res.status(400).json({ error: "Некоректний статус CRM-події" });
  }

  const events = readCrmNotifications();
  const idx = events.findIndex((evt) => String(evt?.id || "").trim() === eventId);
  if (idx < 0) {
    return res.status(404).json({ error: "CRM-подію не знайдено" });
  }

  const current = events[idx] || {};
  events[idx] = {
    ...current,
    crmStatus: status,
    crmStatusUpdatedAt: new Date().toISOString()
  };
  writeCrmNotifications(events);
  return res.json({ ok: true, event: events[idx] });
});

router.post("/cancel", async (req, res) => {
  const {
    orderType = "shop",
    orderId,
    orderNumber,
    id,
    email,
    phone,
    reason
  } = req.body || {};

  const identity = normalizeIdentity({ id, email, phone });
  if (!identity.id && !identity.email && !identity.phone) {
    return res.status(400).json({ error: "Потрібні дані користувача (id/email/phone)" });
  }

  const wantedOrderId = String(orderId || "").trim();
  const wantedOrderNumber = String(orderNumber || "").trim();
  if (!wantedOrderId && !wantedOrderNumber) {
    return res.status(400).json({ error: "Не передано orderId або orderNumber" });
  }

  const list = orderType === "print3d" ? readPrint3dOrders() : readOrders();
  const idx = list.findIndex((order) => {
    const idMatch = wantedOrderId && String(order?.id || "").trim() === wantedOrderId;
    const numMatch = wantedOrderNumber && String(order?.orderNumber || "").trim() === wantedOrderNumber;
    return idMatch || numMatch;
  });
  if (idx < 0) {
    return res.status(404).json({ error: "Замовлення не знайдено" });
  }

  const current = list[idx];
  if (!orderBelongsToIdentity(current, identity)) {
    return res.status(403).json({ error: "Це замовлення належить іншому користувачу" });
  }
  if (String(current?.orderStatus || "") === "cancelled") {
    return res.json({ ok: true, order: current });
  }
  if (!canCancelOrder(current)) {
    return res.status(400).json({ error: "Це замовлення вже не можна скасувати" });
  }

  const cancelledAt = new Date().toISOString();
  const updated = {
    ...current,
    orderStatus: "cancelled",
    cancelledAt,
    cancelReason: String(reason || "Скасовано клієнтом").trim()
  };
  list[idx] = updated;

  if (orderType === "print3d") {
    fs.writeFileSync(print3dOrdersPath, JSON.stringify(list, null, 2));

    const users = readUsers();
    let usersChanged = false;
    users.forEach((user, userIdx) => {
      const summaries = Array.isArray(user?.print3dOrders) ? user.print3dOrders : [];
      const summaryIdx = summaries.findIndex((item) => {
        const idMatch = wantedOrderId && String(item?.id || "").trim() === wantedOrderId;
        const numMatch = wantedOrderNumber && String(item?.orderNumber || "").trim() === wantedOrderNumber;
        return idMatch || numMatch;
      });
      if (summaryIdx >= 0) {
        const nextSummaries = [...summaries];
        nextSummaries[summaryIdx] = {
          ...nextSummaries[summaryIdx],
          orderStatus: "cancelled",
          cancelledAt,
          cancelReason: String(reason || "Скасовано клієнтом").trim()
        };
        users[userIdx] = {
          ...user,
          print3dOrders: nextSummaries,
          updatedAt: cancelledAt
        };
        usersChanged = true;
      }
    });
    if (usersChanged) {
      fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    }
  } else {
    writeOrders(list);
  }

  const lines = [
    "Скасування замовлення клієнтом",
    `Тип: ${orderType === "print3d" ? "3D-друк" : "Магазин"}`,
    `Номер: ${updated?.orderNumber || updated?.id || "—"}`,
    `Клієнт: ${[updated?.customer?.lastName, updated?.customer?.name].filter(Boolean).join(" ").trim() || "—"}`,
    `Телефон: ${updated?.customer?.phone || "—"}`,
    updated?.ttn ? `ТТН: ${updated.ttn}` : null,
    `Причина: ${updated.cancelReason || "—"}`
  ].filter(Boolean);
  sendTelegramText(lines.join("\n")).catch(() => null);

  return res.json({ ok: true, order: updated });
});

module.exports = router;
