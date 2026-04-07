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

router.post("/register", (req, res) => {
  const { name, phone, email, password, delivery = {} } = req.body || {};

  if (!name || !phone || !email || !password) {
    return res.status(400).json({ error: "name, phone, email and password are required" });
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
  return res.json(savedUser);
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

  return res.json(user);
});

router.post("/google-login", (req, res) => {
  const { email, name } = req.body || {};
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
      phone: "",
      email: normalizedEmail,
      password: "",
      delivery: { city: "", warehouse: "", address: "" },
      updatedAt: new Date().toISOString()
    };
    users.push(user);
    writeUsers(users);
  }

  return res.json(user);
});

module.exports = router;
