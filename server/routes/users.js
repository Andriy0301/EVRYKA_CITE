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

router.post("/register", (req, res) => {
  const { name, lastName, phone, email, password, delivery = {} } = req.body || {};

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
  const { email, name, lastName } = req.body || {};
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
  const { id, name, lastName, phone, delivery = {} } = req.body || {};
  if (!id) {
    return res.status(400).json({ error: "id is required" });
  }

  const users = readUsers();
  const index = users.findIndex((u) => String(u.id) === String(id));
  if (index < 0) {
    return res.status(404).json({ error: "user not found" });
  }

  const current = users[index];
  const updated = {
    ...current,
    name: String(name || current.name || "").trim(),
    lastName: String(lastName || current.lastName || "").trim(),
    phone: String(phone || current.phone || "").trim(),
    delivery: {
      provider: String(delivery.provider || current.delivery?.provider || "nova_poshta").trim(),
      city: String(delivery.city || current.delivery?.city || "").trim(),
      branch: String(delivery.branch || current.delivery?.branch || "").trim(),
      address: String(delivery.address || current.delivery?.address || "").trim()
    },
    updatedAt: new Date().toISOString()
  };

  users[index] = updated;
  writeUsers(users);
  return res.json(sanitizeUser(updated));
});

module.exports = router;
