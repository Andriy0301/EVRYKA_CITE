const express = require("express");
const fs = require("fs");
const path = require("path");
const { ensureClientIds, findUserByIdentity } = require("../utils/client-id");

const router = express.Router();
const ordersPath = path.join(__dirname, "../data/orders.json");
const usersPath = path.join(__dirname, "../data/users.json");
const { notifyNewOrder } = require("../utils/telegram");
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
    ttn: String(ttn || "").trim()
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
  return res.json({ orders: readOrders() });
});

module.exports = router;
