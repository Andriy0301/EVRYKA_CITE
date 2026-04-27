const express = require("express");
const cors = require("cors");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../.env") });

const app = express();

const { isTelegramConfigured, startTelegramMenuBot } = require("./utils/telegram");
const { startOrderStatusSyncLoop } = require("./utils/order-status-sync");
const { initDataStore } = require("./utils/data-store");

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
const promProductsRoute = require("./routes/promProducts");
const usersRoute = require("./routes/users");
const popularityRoute = require("./routes/popularity");
const shippingRoute = require("./routes/shipping");
const ordersRoute = require("./routes/orders");
const inquiriesRoute = require("./routes/inquiries");
const print3dRoute = require("./routes/print3d");

// Prom.ua integration endpoints:
// - GET /api/products
// - GET /api/product-sales
// - GET /api/products-with-sales
// - GET /api/top-products
app.use("/api", promProductsRoute);

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
const DATASTORE_RETRY_MS = Math.max(5000, Number(process.env.DATASTORE_RETRY_MS || 15000));
let dataStoreReady = false;
let dataStoreInitInProgress = false;
let dataStoreLastError = "";

app.get("/api/healthz", (req, res) => {
  res.status(200).json({
    ok: true,
    dataStoreReady,
    dataStoreLastError: dataStoreLastError || null
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("[process] unhandledRejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[process] uncaughtException:", error?.stack || error?.message || error);
  process.exit(1);
});

async function bootstrap() {
  try {
    console.log("[startup] booting app...");
    console.log("[startup] env:", {
      nodeEnv: process.env.NODE_ENV || "undefined",
      port: PORT,
      hasDatabaseUrl: Boolean(process.env.DATABASE_URL)
    });

    const server = app.listen(PORT, () => {
      console.log(`Server started on port ${PORT}`);
    });
    server.on("error", (error) => {
      console.error("[startup] listen failed:", error?.stack || error?.message || error);
      process.exit(1);
    });

    const initDataStoreWithRetry = async () => {
      if (dataStoreInitInProgress || dataStoreReady) return;
      dataStoreInitInProgress = true;
      try {
        await initDataStore();
        dataStoreReady = true;
        dataStoreLastError = "";
        console.log("[startup] data store initialized");

        if (isTelegramConfigured()) {
          console.log("[telegram] Сповіщення увімкнено (TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID)");
          startTelegramMenuBot();
        } else {
          console.warn(
            "[telegram] Сповіщення вимкнено — додайте TELEGRAM_BOT_TOKEN і TELEGRAM_CHAT_ID у змінних середовища"
          );
        }

        startOrderStatusSyncLoop();
      } catch (error) {
        dataStoreLastError = String(error?.message || error || "init_failed");
        console.error("[startup] data store init failed:", error?.stack || error?.message || error);
        console.log(`[startup] retrying data store init in ${DATASTORE_RETRY_MS}ms`);
        setTimeout(() => {
          initDataStoreWithRetry().catch(() => null);
        }, DATASTORE_RETRY_MS);
      } finally {
        dataStoreInitInProgress = false;
      }
    };

    initDataStoreWithRetry().catch(() => null);
  } catch (error) {
    console.error("[startup] failed:", error?.stack || error?.message || error);
    process.exit(1);
  }
}

bootstrap();