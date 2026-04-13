const https = require("https");
const fs = require("fs");
const path = require("path");

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();

const MAX_LEN = 4000;
const MENU_ROWS = [
  [{ text: "📩 Запитання" }, { text: "🛒 Замовлення" }],
  [{ text: "🖨️ 3D-друк" }, { text: "🔄 Меню" }]
];
const MENU_TEXT = "Оберіть категорію:";
const DATA_DIR = path.join(__dirname, "../data");
const DATA_FILES = {
  inquiries: path.join(DATA_DIR, "inquiries.json"),
  orders: path.join(DATA_DIR, "orders.json"),
  print3dOrders: path.join(DATA_DIR, "print3d-orders.json"),
  print3dRequests: path.join(DATA_DIR, "print3d-requests.json")
};
const UPDATE_TIMEOUT_SEC = 25;
const UPDATE_RETRY_MS = 2000;
const MAX_ITEMS_PER_SECTION = 5;
let botLoopStarted = false;

function getChatId() {
  return /^-?\d+$/.test(TELEGRAM_CHAT_ID) ? Number(TELEGRAM_CHAT_ID) : TELEGRAM_CHAT_ID;
}

function postTelegram(bodyObj) {
  return postTelegramMethod("sendMessage", bodyObj);
}

function postTelegramMethod(method, bodyObj) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      resolve({ skipped: true, reason: "missing_token_or_chat_id" });
      return;
    }
    const body = JSON.stringify(bodyObj);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body, "utf8")
        }
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf8");
          let detail = raw.slice(0, 500);
          let json = null;
          try {
            const j = JSON.parse(raw);
            json = j;
            if (j.description) detail = j.description;
          } catch {
            /* ignore */
          }
          const ok = res.statusCode >= 200 && res.statusCode < 300;
          resolve({ ok, status: res.statusCode, detail, raw, json });
        });
      }
    );
    req.on("error", () => resolve({ ok: false }));
    req.write(body);
    req.end();
  });
}

function sendTelegramText(text) {
  return sendTelegramTextTo(getChatId(), text);
}

function sendTelegramTextTo(chatId, text, opts = {}) {
  const t = String(text || "").trim();
  if (!t) return Promise.resolve({ skipped: true });
  const chunk = t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 20)}\n… (обрізано)` : t;
  return postTelegram({
    chat_id: chatId,
    text: chunk,
    disable_web_page_preview: true,
    ...opts
  });
}

function safeReadList(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function short(v, limit = 130) {
  const str = String(v || "").trim();
  if (!str) return "—";
  return str.length <= limit ? str : `${str.slice(0, limit - 1)}…`;
}

function formatInquiryList(items) {
  if (!items.length) return "Запитань поки немає.";
  const rows = ["Останні запитання:"];
  items.slice(0, MAX_ITEMS_PER_SECTION).forEach((entry, idx) => {
    rows.push(
      "",
      `${idx + 1}) ${short(entry.message, 180)}`,
      `   👤 ${short(entry.name || "без імені", 80)}`,
      `   📞 ${short(entry.phone || "—", 40)} | ✉️ ${short(entry.email || "—", 80)}`
    );
  });
  return rows.join("\n");
}

function formatShopOrdersList(items) {
  if (!items.length) return "Звичайних замовлень поки немає.";
  const rows = ["Останні замовлення магазину:"];
  items.slice(0, MAX_ITEMS_PER_SECTION).forEach((entry, idx) => {
    const customer = entry.customer || {};
    rows.push(
      "",
      `${idx + 1}) ${entry.orderNumber || `ID ${entry.id || "—"}`}`,
      `   👤 ${short([customer.name, customer.lastName].filter(Boolean).join(" ") || "—", 80)}`,
      `   💰 ${Number(entry.total || 0).toFixed(2)} грн | 📦 ${Array.isArray(entry.items) ? entry.items.length : 0} товар(ів)`
    );
  });
  return rows.join("\n");
}

function formatPrint3dList(orderItems, requestItems) {
  const events = [];
  orderItems.forEach((x) => events.push({ kind: "order", createdAt: x.createdAt, payload: x }));
  requestItems.forEach((x) => events.push({ kind: "request", createdAt: x.createdAt, payload: x }));
  events.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  const top = events.slice(0, MAX_ITEMS_PER_SECTION);
  if (!top.length) return "Замовлень 3D-друку поки немає.";

  const rows = ["Останні заявки / замовлення 3D-друку:"];
  top.forEach((evt, idx) => {
    if (evt.kind === "order") {
      const entry = evt.payload || {};
      const customer = entry.customer || {};
      rows.push(
        "",
        `${idx + 1}) [Замовлення] ID ${entry.id || "—"}`,
        `   👤 ${short([customer.name, customer.lastName].filter(Boolean).join(" ") || "—", 80)}`,
        `   💰 ${Number(entry.total || 0).toFixed(2)} грн | 🧩 ${Array.isArray(entry.files) ? entry.files.length : 0} модель(і)`
      );
      return;
    }
    const entry = evt.payload || {};
    rows.push(
      "",
      `${idx + 1}) [Заявка] ID ${entry.id || "—"}`,
      `   👤 ${short(entry.name || "—", 80)} | 📞 ${short(entry.phone || "—", 40)}`,
      `   📝 ${short(entry.description, 170)}`
    );
  });
  return rows.join("\n");
}

function buildMenuPayload() {
  return {
    reply_markup: {
      keyboard: MENU_ROWS,
      resize_keyboard: true,
      one_time_keyboard: false
    }
  };
}

async function sendMenu(chatId) {
  return sendTelegramTextTo(chatId, MENU_TEXT, buildMenuPayload());
}

async function sendCategory(chatId, text) {
  const normalized = String(text || "").trim().toLowerCase();
  if (normalized === "/start" || normalized === "/menu" || normalized === "🔄 меню") {
    await sendMenu(chatId);
    return;
  }

  if (normalized === "📩 запитання") {
    await sendTelegramTextTo(chatId, formatInquiryList(safeReadList(DATA_FILES.inquiries)));
    return;
  }
  if (normalized === "🛒 замовлення") {
    await sendTelegramTextTo(chatId, formatShopOrdersList(safeReadList(DATA_FILES.orders)));
    return;
  }
  if (normalized === "🖨️ 3d-друк") {
    await sendTelegramTextTo(
      chatId,
      formatPrint3dList(safeReadList(DATA_FILES.print3dOrders), safeReadList(DATA_FILES.print3dRequests))
    );
    return;
  }
}

function getAllowedChatId() {
  if (/^-?\d+$/.test(TELEGRAM_CHAT_ID)) return Number(TELEGRAM_CHAT_ID);
  return TELEGRAM_CHAT_ID;
}

function startTelegramMenuBot() {
  if (botLoopStarted || !TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  botLoopStarted = true;
  let offset = 0;
  const allowedChatId = getAllowedChatId();

  const loop = async () => {
    try {
      const updates = await postTelegramMethod("getUpdates", {
        timeout: UPDATE_TIMEOUT_SEC,
        offset
      });

      const parsed = updates?.json && typeof updates.json === "object" ? updates.json : {};
      const list = Array.isArray(parsed?.result) ? parsed.result : [];

      for (const upd of list) {
        offset = Math.max(offset, Number(upd.update_id || 0) + 1);
        const msg = upd?.message;
        if (!msg) continue;
        if (msg.chat?.id !== allowedChatId) continue;
        await sendCategory(msg.chat.id, msg.text || "");
      }
    } catch (e) {
      console.error("[telegram menu loop]", e?.message || e);
    } finally {
      setTimeout(loop, UPDATE_RETRY_MS);
    }
  };

  setTimeout(loop, 250);
}

function sendTelegramDocument({ filename, buffer, caption, contentType }) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      resolve({ skipped: true, reason: "missing_token_or_chat_id" });
      return;
    }
    try {
      const boundary = `----evryka-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      const nl = "\r\n";
      const safeName = String(filename || "file.bin").replace(/[\r\n"]/g, "_");
      const fileContent = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer || "");
      const head = Buffer.from(
        `--${boundary}${nl}` +
          `Content-Disposition: form-data; name="chat_id"${nl}${nl}` +
          `${getChatId()}${nl}` +
          `--${boundary}${nl}` +
          `Content-Disposition: form-data; name="caption"${nl}${nl}` +
          `${String(caption || "").slice(0, 1024)}${nl}` +
          `--${boundary}${nl}` +
          `Content-Disposition: form-data; name="document"; filename="${safeName}"${nl}` +
          `Content-Type: ${contentType || "application/octet-stream"}${nl}${nl}`,
        "utf8"
      );
      const tail = Buffer.from(`${nl}--${boundary}--${nl}`, "utf8");
      const body = Buffer.concat([head, fileContent, tail]);

      const req = https.request(
        {
          hostname: "api.telegram.org",
          path: `/bot${TELEGRAM_BOT_TOKEN}/sendDocument`,
          method: "POST",
          headers: {
            "Content-Type": `multipart/form-data; boundary=${boundary}`,
            "Content-Length": body.length
          }
        },
        (res) => {
          const chunks = [];
          res.on("data", (c) => chunks.push(c));
          res.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            let detail = raw.slice(0, 500);
            try {
              const j = JSON.parse(raw);
              if (j.description) detail = j.description;
            } catch {
              /* ignore */
            }
            const ok = res.statusCode >= 200 && res.statusCode < 300;
            resolve({ ok, status: res.statusCode, detail });
          });
        }
      );
      req.on("error", () => resolve({ ok: false }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, detail: e?.message || "sendDocument failed" });
    }
  });
}

function formatInquiry(entry) {
  const lines = [
    "Запитання з чату сайту",
    "",
    entry.message,
    "",
    entry.phone ? `Телефон: ${entry.phone}` : null,
    entry.email ? `Email: ${entry.email}` : null,
    entry.name ? `Ім'я: ${entry.name}` : null,
    entry.page ? `Сторінка: ${entry.page}` : null
  ].filter(Boolean);
  return lines.join("\n");
}

function formatOrder(order) {
  const c = order.customer || {};
  const d = c.delivery || {};
  const items = Array.isArray(order.items) ? order.items : [];
  const lines = [
    `Нове замовлення ${order.orderNumber || ""}`,
    `Сума: ${order.total} грн`,
    "",
    `Клієнт: ${[c.name, c.lastName].filter(Boolean).join(" ")}`.trim() || "—",
    `Телефон: ${c.phone || "—"}`,
    `Email: ${c.email || "—"}`,
    "",
    "Доставка:",
    `  Служба: ${d.provider || "—"}`,
    `  Тип: ${d.deliveryType || "—"}`,
    `  Місто: ${d.city || "—"}`,
    `  Відділення / адреса: ${d.branchText || d.address || "—"}`,
    `  Оплата: ${d.paymentMethod || "—"}`,
    "",
    "Товари:"
  ];
  items.forEach((i) => {
    lines.push(`  • ${i.name} x ${i.qty} — ${i.price} грн / од.`);
  });
  if (order.ttn) lines.push("", `ТТН: ${order.ttn}`);
  return lines.join("\n");
}

function notifyInquiry(entry) {
  return sendTelegramText(formatInquiry(entry));
}

function notifyNewOrder(order) {
  return sendTelegramText(formatOrder(order));
}

module.exports = {
  sendTelegramText,
  sendTelegramDocument,
  notifyInquiry,
  notifyNewOrder,
  startTelegramMenuBot,
  isTelegramConfigured: () => Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
};
