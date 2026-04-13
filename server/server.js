const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();

const { isTelegramConfigured, startTelegramMenuBot } = require("./utils/telegram");
const { startOrderStatusSyncLoop } = require("./utils/order-status-sync");
if (isTelegramConfigured()) {
  console.log("[telegram] Сповіщення увімкнено (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
  startTelegramMenuBot();
} else {
  console.warn(
    "[telegram] Сповіщення вимкнено — додайте TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID у змінних середовища"
  );
}
startOrderStatusSyncLoop();

// CORS
app.use(cors({
  origin: "*"
}));

// JSON
app.use(express.json());

// 🔥 СТАТИКА
app.use(express.static(path.join(__dirname, "../client")));

// 🔥 РОУТИ (ВАЖЛИВО — з /api)
const productsRoute = require("./routes/products");
const usersRoute = require("./routes/users");
const popularityRoute = require("./routes/popularity");
const shippingRoute = require("./routes/shipping");
const ordersRoute = require("./routes/orders");
const inquiriesRoute = require("./routes/inquiries");
const print3dRoute = require("./routes/print3d");

app.use("/api/products", productsRoute);
app.use("/api/users", usersRoute);
app.use("/api/popularity", popularityRoute);
app.use("/api/shipping", shippingRoute);
app.use("/api/orders", ordersRoute);
app.use("/api/inquiries", inquiriesRoute);
app.use("/api/print3d", print3dRoute);

// 🔥 КАРТИНКИ
app.use("/images", express.static(path.join(__dirname, "../client/images")));

// 🚀 PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});