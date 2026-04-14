const express = require("express");
const { ensureClientIds, findUserByIdentity } = require("../utils/client-id");
const { getList, setList } = require("../utils/data-store");

const router = express.Router();
const { notifyInquiry } = require("../utils/telegram");

async function readInquiries() {
  try {
    return await getList("inquiries");
  } catch {
    return [];
  }
}

async function writeInquiries(list) {
  await setList("inquiries", list);
}

async function readUsers() {
  try {
    const parsed = await getList("users");
    const { users, changed } = ensureClientIds(Array.isArray(parsed) ? parsed : []);
    if (changed) await setList("users", users);
    return users;
  } catch {
    return [];
  }
}

router.post("/", async (req, res) => {
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

  const matchedUser = findUserByIdentity(await readUsers(), {
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

  const list = await readInquiries();
  list.unshift(entry);
  await writeInquiries(list);

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
