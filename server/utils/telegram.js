const https = require("https");

const TELEGRAM_BOT_TOKEN = String(process.env.TELEGRAM_BOT_TOKEN || "").trim();
const TELEGRAM_CHAT_ID = String(process.env.TELEGRAM_CHAT_ID || "").trim();

const MAX_LEN = 4000;

function postTelegram(bodyObj) {
  return new Promise((resolve) => {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
      resolve({ skipped: true, reason: "missing_token_or_chat_id" });
      return;
    }
    const body = JSON.stringify(bodyObj);
    const req = https.request(
      {
        hostname: "api.telegram.org",
        path: `/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
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
  });
}

function sendTelegramText(text) {
  const t = String(text || "").trim();
  if (!t) return Promise.resolve({ skipped: true });
  const chunk = t.length > MAX_LEN ? `${t.slice(0, MAX_LEN - 20)}\n… (обрізано)` : t;
  const chatId = /^-?\d+$/.test(TELEGRAM_CHAT_ID) ? Number(TELEGRAM_CHAT_ID) : TELEGRAM_CHAT_ID;
  return postTelegram({
    chat_id: chatId,
    text: chunk,
    disable_web_page_preview: true
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
  notifyInquiry,
  notifyNewOrder,
  isTelegramConfigured: () => Boolean(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID)
};
