const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const inquiriesPath = path.join(__dirname, "../data/inquiries.json");

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
    name: name || null,
    page: page || null
  };

  const list = readInquiries();
  list.unshift(entry);
  writeInquiries(list);

  return res.json({ ok: true, id: entry.id });
});

module.exports = router;
