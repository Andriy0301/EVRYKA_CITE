const express = require("express");
const fs = require("fs");
const path = require("path");
const { ensureClientIds, ensureClientIdForUser } = require("../utils/client-id");

const router = express.Router();
const usersPath = path.join(__dirname, "../data/users.json");

function readUsers() {
  try {
    if (!fs.existsSync(usersPath)) {
      fs.writeFileSync(usersPath, "[]");
      return [];
    }

    const raw = fs.readFileSync(usersPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];
    const { users, changed } = ensureClientIds(Array.isArray(parsed) ? parsed : []);
    if (changed) writeUsers(users);
    return users;
  } catch (error) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function sanitizeUser(user) {
  if (!user) return user;
  const { password, clientId, ...safeUser } = user;
  return safeUser;
}

function normalizeDelivery(input = {}, current = {}) {
  const source = input || {};
  const prev = current || {};
  const nextBranch = source.branch ?? source.warehouse ?? prev.branch ?? prev.warehouse ?? "";

  return {
    provider: String(source.provider ?? prev.provider ?? "nova_poshta").trim(),
    deliveryType: String(source.deliveryType ?? prev.deliveryType ?? "warehouse").trim(),
    paymentMethod: String(source.paymentMethod ?? prev.paymentMethod ?? "cod").trim(),
    city: String(source.city ?? prev.city ?? "").trim(),
    cityRef: String(source.cityRef ?? prev.cityRef ?? "").trim(),
    branch: String(nextBranch).trim(),
    branchText: String(source.branchText ?? prev.branchText ?? "").trim(),
    address: String(source.address ?? prev.address ?? "").trim()
  };
}

function normalizeCartItems(items) {
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

function normalizeFavoriteItems(items) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => ({
      id: Number(item?.id),
      name: String(item?.name || "").trim(),
      price: Number(item?.price || 0),
      image: String(item?.image || "").trim()
    }))
    .filter((item) => Number.isFinite(item.id) && item.id > 0);
}

router.post("/register", (req, res) => {
  const { name, lastName, middleName, phone, email, password, delivery = {} } = req.body || {};

  if (!name || !lastName || !phone || !email || !password) {
    return res.status(400).json({ error: "name, lastName, phone, email and password are required" });
  }

  const users = readUsers();
  const normalizedPhone = String(phone).trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  const existingIndex = users.findIndex((u) => {
    return u.phone === normalizedPhone || (normalizedEmail && u.email === normalizedEmail);
  });

  const existingUser = existingIndex >= 0 ? users[existingIndex] : null;
  const savedUser = {
    id: existingUser ? existingUser.id : Date.now(),
    clientId: String(existingUser?.clientId || "").trim(),
    name: String(name).trim(),
    lastName: String(lastName).trim(),
    middleName: String(middleName || "").trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    password: String(password || existingUser?.password || ""),
    delivery: normalizeDelivery(delivery, existingUser?.delivery),
    cart: Array.isArray(existingUser?.cart) ? existingUser.cart : [],
    favorites: Array.isArray(existingUser?.favorites) ? existingUser.favorites : [],
    updatedAt: new Date().toISOString()
  };
  ensureClientIdForUser(savedUser, users);

  if (existingIndex >= 0) {
    users[existingIndex] = savedUser;
  } else {
    users.push(savedUser);
  }

  writeUsers(users);
  return res.json(sanitizeUser(savedUser));
});

router.post("/login", (req, res) => {
  const { phone, email, password } = req.body || {};
  const normalizedPhone = String(phone || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPassword = String(password || "");

  if ((!normalizedPhone && !normalizedEmail) || !normalizedPassword) {
    return res.status(400).json({ error: "email/phone and password are required" });
  }

  const users = readUsers();
  const user = users.find((u) => {
    return (
      ((normalizedPhone && u.phone === normalizedPhone) || (normalizedEmail && u.email === normalizedEmail)) &&
      String(u.password || "") === normalizedPassword
    );
  });

  if (!user) {
    return res.status(404).json({ error: "user not found" });
  }

  return res.json(sanitizeUser(user));
});

router.post("/google-login", (req, res) => {
  const { email, name, lastName, middleName } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: "email is required" });
  }

  const users = readUsers();
  let user = users.find((u) => u.email === normalizedEmail);

  if (!user) {
    user = {
      id: Date.now(),
      clientId: "",
      name: String(name || "Google User").trim(),
      lastName: String(lastName || "User").trim(),
      middleName: String(middleName || "").trim(),
      phone: "",
      email: normalizedEmail,
      password: "",
      delivery: normalizeDelivery({}),
      cart: [],
      favorites: [],
      updatedAt: new Date().toISOString()
    };
    ensureClientIdForUser(user, users);
    users.push(user);
    writeUsers(users);
  }

  return res.json(sanitizeUser(user));
});

router.post("/update-profile", (req, res) => {
  const { id, name, lastName, middleName, phone, email, delivery = {} } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  const users = readUsers();
  let index = users.findIndex((u) => String(u.id) === String(id));
  if (index < 0 && normalizedEmail) {
    index = users.findIndex((u) => String(u.email || "").toLowerCase() === normalizedEmail);
  }
  if (index < 0 && normalizedPhone) {
    index = users.findIndex((u) => String(u.phone || "").trim() === normalizedPhone);
  }

  const current =
    index >= 0
      ? users[index]
      : {
          id: id || Date.now(),
          clientId: "",
          password: "",
          name: "",
          lastName: "",
          middleName: "",
          phone: "",
          email: "",
          delivery: normalizeDelivery({})
        };

  const updated = {
    ...current,
    name: String(name || current.name || "").trim(),
    lastName: String(lastName || current.lastName || "").trim(),
    middleName: String(middleName || current.middleName || "").trim(),
    phone: normalizedPhone || String(current.phone || "").trim(),
    email: normalizedEmail || String(current.email || "").trim().toLowerCase(),
    delivery: normalizeDelivery(delivery, current.delivery),
    updatedAt: new Date().toISOString()
  };
  ensureClientIdForUser(updated, users);

  if (index >= 0) {
    users[index] = updated;
  } else {
    users.push(updated);
  }
  writeUsers(users);
  return res.json(sanitizeUser(updated));
});

router.get("/cart", (req, res) => {
  const id = String(req.query.id || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();
  const phone = String(req.query.phone || "").trim();

  if (!id && !email && !phone) {
    return res.status(400).json({ error: "id/email/phone is required" });
  }

  const users = readUsers();
  const user = users.find((u) => {
    return (
      (id && String(u.id) === id) ||
      (email && String(u.email || "").toLowerCase() === email) ||
      (phone && String(u.phone || "").trim() === phone)
    );
  });

  if (!user) {
    return res.json({ items: [] });
  }

  return res.json({ items: normalizeCartItems(user?.cart || []) });
});

router.post("/cart", (req, res) => {
  const { id, email, phone, items } = req.body || {};
  const normalizedId = String(id || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  const users = readUsers();
  const index = users.findIndex((u) => {
    return (
      (normalizedId && String(u.id) === normalizedId) ||
      (normalizedEmail && String(u.email || "").toLowerCase() === normalizedEmail) ||
      (normalizedPhone && String(u.phone || "").trim() === normalizedPhone)
    );
  });

  if (index < 0) {
    const created = {
      id: normalizedId || Date.now(),
      clientId: "",
      name: "",
      lastName: "",
      middleName: "",
      phone: normalizedPhone,
      email: normalizedEmail,
      password: "",
      delivery: normalizeDelivery({}),
      cart: normalizeCartItems(items),
      favorites: [],
      updatedAt: new Date().toISOString()
    };
    ensureClientIdForUser(created, users);
    users.push(created);
  } else {
    users[index] = {
      ...users[index],
      cart: normalizeCartItems(items),
      updatedAt: new Date().toISOString()
    };
  }

  writeUsers(users);
  const savedUser = index < 0 ? users[users.length - 1] : users[index];
  return res.json({ items: savedUser.cart });
});

router.get("/favorites", (req, res) => {
  const id = String(req.query.id || "").trim();
  const email = String(req.query.email || "").trim().toLowerCase();
  const phone = String(req.query.phone || "").trim();

  if (!id && !email && !phone) {
    return res.status(400).json({ error: "id/email/phone is required" });
  }

  const users = readUsers();
  const user = users.find((u) => {
    return (
      (id && String(u.id) === id) ||
      (email && String(u.email || "").toLowerCase() === email) ||
      (phone && String(u.phone || "").trim() === phone)
    );
  });

  if (!user) {
    return res.json({ items: [] });
  }

  return res.json({ items: normalizeFavoriteItems(user.favorites || []) });
});

router.post("/favorites", (req, res) => {
  const { id, email, phone, items } = req.body || {};
  const normalizedId = String(id || "").trim();
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedPhone = String(phone || "").trim();

  const users = readUsers();
  const index = users.findIndex((u) => {
    return (
      (normalizedId && String(u.id) === normalizedId) ||
      (normalizedEmail && String(u.email || "").toLowerCase() === normalizedEmail) ||
      (normalizedPhone && String(u.phone || "").trim() === normalizedPhone)
    );
  });

  if (index < 0) {
    const created = {
      id: normalizedId || Date.now(),
      clientId: "",
      name: "",
      lastName: "",
      middleName: "",
      phone: normalizedPhone,
      email: normalizedEmail,
      password: "",
      delivery: normalizeDelivery({}),
      cart: [],
      favorites: normalizeFavoriteItems(items),
      updatedAt: new Date().toISOString()
    };
    ensureClientIdForUser(created, users);
    users.push(created);
  } else {
    users[index] = {
      ...users[index],
      favorites: normalizeFavoriteItems(items),
      updatedAt: new Date().toISOString()
    };
  }

  writeUsers(users);
  const savedUser = index < 0 ? users[users.length - 1] : users[index];
  return res.json({ items: savedUser.favorites });
});

module.exports = router;
