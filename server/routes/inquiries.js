const express = require("express");
const fs = require("fs");
const path = require("path");
const { ensureClientIds, findUserByIdentity } = require("../utils/client-id");

const router = express.Router();
const inquiriesPath = path.join(__dirname, "../data/inquiries.json");
const usersPath = path.join(__dirname, "../data/users.json");
const { notifyInquiry } = require("../utils/telegram");

function readInquiries() {
  try {
    if (!fs.existsSync(inquiriesPath)) {
      fs.writeFileSync(inquiriesPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(inquiriesPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeInquiries(list) {
  fs.writeFileSync(inquiriesPath, JSON.stringify(list, null, 2));
}

function readUsers() {
  try {
    if (!fs.existsSync(usersPath)) return [];
    const raw = fs.readFileSync(usersPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];
    const { users, changed } = ensureClientIds(Array.isArray(parsed) ? parsed : []);
    if (changed) fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    return users;
  } catch {
    return [];
  }
}

router.post("/", (req, res) => {
  const message = String(req.body?.message || "").trim();
  const email = String(req.body?.email || "").trim().slice(0, 200);
  const phone = String(req.body?.phone || "").trim().slice(0, 40);
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const page = String(req.body?.page || "").trim().slice(0, 500);
  const userId = String(req.body?.userId || "").trim().slice(0, 60);
  const incomingClientId = String(req.body?.clientId || "").trim().slice(0, 80);

  if (!message || message.length < 3) {
    return res.status(400).json({ error: "Введіть текст запитання (мінімум 3 символи)" });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: "Повідомлення занадто довге" });
  }

  const matchedUser = findUserByIdentity(readUsers(), {
    id: userId,
    clientId: incomingClientId,
    email,
    phone
  });
  const clientId = String(incomingClientId || matchedUser?.clientId || "").trim();

  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
    userId: userId || null,
    clientId: clientId || null,
    message,
    email: email || null,
    phone: phone || null,
    name: name || null,
    page: page || null
  };

  const list = readInquiries();
  list.unshift(entry);
  writeInquiries(list);

  notifyInquiry(entry)
    .then((r) => {
      if (r?.skipped) {
        console.warn(
          "[telegram] Повідомлення з чату збережено, але Telegram вимкнено: задайте TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID на сервері (Render → Environment)."
        );
      } else if (!r?.ok) {
        console.error("[telegram] sendMessage не вдався:", r?.status, r?.detail);
      }
    })
    .catch((e) => console.error("[telegram]", e?.message || e));

  return res.json({ ok: true, id: entry.id });
});

module.exports = router;
