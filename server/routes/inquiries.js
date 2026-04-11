const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const inquiriesPath = path.join(__dirname, "../data/inquiries.json");
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

router.post("/", (req, res) => {
  const message = String(req.body?.message || "").trim();
  const email = String(req.body?.email || "").trim().slice(0, 200);
  const phone = String(req.body?.phone || "").trim().slice(0, 40);
  const name = String(req.body?.name || "").trim().slice(0, 120);
  const page = String(req.body?.page || "").trim().slice(0, 500);

  if (!message || message.length < 3) {
    return res.status(400).json({ error: "Введіть текст запитання (мінімум 3 символи)" });
  }

  if (message.length > 2000) {
    return res.status(400).json({ error: "Повідомлення занадто довге" });
  }

  const entry = {
    id: Date.now(),
    createdAt: new Date().toISOString(),
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
