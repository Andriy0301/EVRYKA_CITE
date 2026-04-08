const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const usersPath = path.join(__dirname, "../data/users.json");

function readUsers() {
  try {
    if (!fs.existsSync(usersPath)) {
      fs.writeFileSync(usersPath, "[]");
      return [];
    }

    const raw = fs.readFileSync(usersPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function sanitizeUser(user) {
  if (!user) return user;
  const { password, ...safeUser } = user;
  return safeUser;
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

  const savedUser = {
    id: existingIndex >= 0 ? users[existingIndex].id : Date.now(),
    name: String(name).trim(),
    lastName: String(lastName).trim(),
    middleName: String(middleName || "").trim(),
    phone: normalizedPhone,
    email: normalizedEmail,
    password: String(password),
    delivery: {
      city: String(delivery.city || "").trim(),
      warehouse: String(delivery.warehouse || "").trim(),
      address: String(delivery.address || "").trim()
    },
    updatedAt: new Date().toISOString()
  };

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
      name: String(name || "Google User").trim(),
      lastName: String(lastName || "User").trim(),
      middleName: String(middleName || "").trim(),
      phone: "",
      email: normalizedEmail,
      password: "",
      delivery: { city: "", warehouse: "", address: "" },
      updatedAt: new Date().toISOString()
    };
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
          password: "",
          name: "",
          lastName: "",
          middleName: "",
          phone: "",
          email: "",
          delivery: { provider: "nova_poshta", city: "", branch: "", address: "" }
        };

  const updated = {
    ...current,
    name: String(name || current.name || "").trim(),
    lastName: String(lastName || current.lastName || "").trim(),
    middleName: String(middleName || current.middleName || "").trim(),
    phone: normalizedPhone || String(current.phone || "").trim(),
    email: normalizedEmail || String(current.email || "").trim().toLowerCase(),
    delivery: {
      provider: String(delivery.provider || current.delivery?.provider || "nova_poshta").trim(),
      city: String(delivery.city || current.delivery?.city || "").trim(),
      branch: String(delivery.branch || current.delivery?.branch || "").trim(),
      address: String(delivery.address || current.delivery?.address || "").trim()
    },
    updatedAt: new Date().toISOString()
  };

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
    return res.status(404).json({ error: "user not found" });
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
    users.push({
      id: normalizedId || Date.now(),
      name: "",
      lastName: "",
      middleName: "",
      phone: normalizedPhone,
      email: normalizedEmail,
      password: "",
      delivery: { provider: "nova_poshta", city: "", branch: "", address: "" },
      cart: normalizeCartItems(items),
      updatedAt: new Date().toISOString()
    });
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

module.exports = router;
