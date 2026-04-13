const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { parseModelVolume } = require("../utils/parse-model-volume");
const { calculatePricing } = require("../utils/print3d-pricing");
const { sendTelegramText, sendTelegramDocument } = require("../utils/telegram");
const { ensureClientIds, findUserByIdentity } = require("../utils/client-id");

const router = express.Router();
const MAX_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE }
});

const dataPath = path.join(__dirname, "../data/print3d-requests.json");
const ordersPath = path.join(__dirname, "../data/print3d-orders.json");
const usersPath = path.join(__dirname, "../data/users.json");

function readRequests() {
  try {
    if (!fs.existsSync(dataPath)) {
      fs.mkdirSync(path.dirname(dataPath), { recursive: true });
      fs.writeFileSync(dataPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(dataPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeRequests(list) {
  fs.mkdirSync(path.dirname(dataPath), { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(list, null, 2));
}

function readOrders() {
  try {
    if (!fs.existsSync(ordersPath)) {
      fs.mkdirSync(path.dirname(ordersPath), { recursive: true });
      fs.writeFileSync(ordersPath, "[]");
      return [];
    }
    const raw = fs.readFileSync(ordersPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeOrders(list) {
  fs.mkdirSync(path.dirname(ordersPath), { recursive: true });
  fs.writeFileSync(ordersPath, JSON.stringify(list, null, 2));
}

function readUsers() {
  try {
    if (!fs.existsSync(usersPath)) return [];
    const raw = fs.readFileSync(usersPath, "utf8");
    const parsed = raw ? JSON.parse(raw) : [];
    const { users, changed } = ensureClientIds(Array.isArray(parsed) ? parsed : []);
    if (changed) writeUsers(users);
    return users;
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(usersPath), { recursive: true });
  fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
}

function attachOrderToUser(customer, orderSummary) {
  const userId = String(customer?.id || "").trim();
  const userClientId = String(customer?.clientId || "").trim();
  const userEmail = String(customer?.email || "").trim().toLowerCase();
  const userPhone = String(customer?.phone || "").trim();
  if (!userId && !userClientId && !userEmail && !userPhone) return;

  const users = readUsers();
  const found = findUserByIdentity(users, {
    id: userId,
    clientId: userClientId,
    email: userEmail,
    phone: userPhone
  });
  const idx = found ? users.findIndex((u) => String(u.id) === String(found.id)) : -1;
  if (idx < 0) return;

  const current = users[idx];
  const list = Array.isArray(current.print3dOrders) ? current.print3dOrders : [];
  list.unshift(orderSummary);
  users[idx] = {
    ...current,
    print3dOrders: list.slice(0, 100),
    updatedAt: new Date().toISOString()
  };
  writeUsers(users);
}

function normMaterial(v) {
  const u = String(v || "PLA").toUpperCase();
  if (u === "PETG" || u === "ABS" || u === "PLA") return u;
  return "PLA";
}

function normStrength(v) {
  const s = String(v || "medium").toLowerCase();
  if (s === "low" || s === "medium" || s === "strong" || s === "high" || s === "ultra") return s;
  return "medium";
}

function deliveryProviderTitle(v) {
  const p = String(v || "").trim();
  if (p === "nova_poshta") return "Нова пошта";
  if (p === "ukrposhta") return "Укрпошта";
  if (p === "courier") return "Кур'єр";
  if (p === "self_pickup") return "Самовивіз";
  return p || "—";
}

function paymentMethodTitle(v) {
  const p = String(v || "").trim();
  if (p === "cod") return "Післяплата";
  if (p === "card_online") return "Оплата карткою онлайн";
  if (p === "bank_transfer") return "Безготівково";
  return p || "—";
}

function deliveryTypeTitle(v) {
  const t = String(v || "").trim();
  if (t === "warehouse") return "Відділення";
  if (t === "postomat") return "Поштомат";
  if (t === "address") return "Адресна доставка";
  return t || "—";
}

router.post("/analyze-model", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Файл завеликий (максимум 50 МБ)"
          : err.message || "Помилка завантаження файлу";
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ error: "Файл не передано" });
    }
    const volumeCm3 = await parseModelVolume(
      req.file.buffer,
      req.file.originalname || "model.stl"
    );
    if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) {
      return res.status(422).json({
        error: "Не вдалося обчислити об'єм. Перевірте модель."
      });
    }
    const material = normMaterial(req.body.material);
    const strength = normStrength(req.body.strength);
    const quality = String(req.body.quality || "normal").toLowerCase();
    const pricing = calculatePricing({ volumeCm3, material, strength });
    return res.json({
      volume: pricing.volumeCm3,
      estimatedWeight: pricing.weightG,
      printTimeHours: pricing.printTimeHours,
      price: pricing.priceUah,
      infill: pricing.infill,
      material: pricing.material,
      strength: pricing.strength,
      quality: ["draft", "normal", "fine"].includes(quality) ? quality : "normal"
    });
  } catch (e) {
    console.error("[print3d analyze]", e);
    return res.status(500).json({
      error: e instanceof Error ? e.message : "Помилка аналізу"
    });
  }
});

router.post("/request", (req, res, next) => {
  upload.single("attachment")(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Файл завеликий (максимум 50 МБ)"
          : err.message || "Помилка файлу";
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const phone = String(req.body.phone || "").trim();
    const email = String(req.body.email || "").trim();
    const description = String(req.body.description || "").trim();
    const link = String(req.body.link || "").trim();
    const userId = String(req.body.userId || "").trim();
    const incomingClientId = String(req.body.clientId || "").trim();

    if (!name || !phone || !email) {
      return res.status(400).json({
        error: "Заповніть ім'я, телефон та email"
      });
    }
    if (!description || description.length < 3) {
      return res.status(400).json({ error: "Опишіть задачу (мінімум 3 символи)" });
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
      name,
      phone,
      email,
      description,
      link: link || null,
      attachmentName: req.file ? req.file.originalname : null
    };

    const list = readRequests();
    list.unshift(entry);
    writeRequests(list);

    const lines = [
      "Заявка 3D-друк (немає моделі)",
      "",
      `Ім'я: ${name}`,
      `Клієнт ID: ${clientId || "—"}`,
      `Телефон: ${phone}`,
      `Email: ${email}`,
      link ? `Посилання: ${link}` : null,
      "",
      "Опис:",
      description,
      req.file ? `\nФайл: ${req.file.originalname} (${req.file.size} байт)` : null
    ].filter(Boolean);
    sendTelegramText(lines.join("\n"))
      .then((r) => {
        if (r?.skipped) {
          console.info("[print3d-request]", entry);
        }
        if (req.file?.buffer) {
          return sendTelegramDocument({
            filename: req.file.originalname,
            buffer: req.file.buffer,
            caption: `Заявка 3D-друк (без моделі): ${name}`,
            contentType: req.file.mimetype || "application/octet-stream"
          });
        }
        return null;
      })
      .catch((e) => console.error("[print3d-request telegram]", e));

    return res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error("[print3d request]", e);
    return res.status(500).json({ error: "Не вдалося зберегти заявку" });
  }
});

router.post("/order", (req, res, next) => {
  upload.array("files", 20)(req, res, (err) => {
    if (err) {
      const msg =
        err.code === "LIMIT_FILE_SIZE"
          ? "Файл завеликий (максимум 50 МБ)"
          : err.message || "Помилка завантаження файлів";
      return res.status(400).json({ error: msg });
    }
    next();
  });
}, async (req, res) => {
  try {
    const files = Array.isArray(req.files) ? req.files : [];
    if (!files.length) {
      return res.status(400).json({ error: "Немає файлів для замовлення" });
    }

    let modelsMeta = [];
    try {
      modelsMeta = JSON.parse(String(req.body.modelsMeta || "[]"));
      if (!Array.isArray(modelsMeta)) modelsMeta = [];
    } catch {
      modelsMeta = [];
    }

    const orderColor = String(req.body.orderColor || "").trim() || null;
    const total = Number(req.body.total || 0);
    const orderNumber = String(req.body.orderNumber || "").trim() || `EVR3D-${Date.now().toString().slice(-8)}`;
    const ttn = String(req.body.ttn || "").trim() || "";
    const matchedUser = findUserByIdentity(readUsers(), {
      id: req.body.userId,
      clientId: req.body.userClientId,
      email: req.body.userEmail,
      phone: req.body.userPhone
    });
    const customer = {
      id: String(req.body.userId || "").trim() || null,
      clientId: String(req.body.userClientId || matchedUser?.clientId || "").trim() || null,
      name: String(req.body.userName || "").trim() || null,
      lastName: String(req.body.userLastName || "").trim() || null,
      middleName: String(req.body.userMiddleName || "").trim() || null,
      email: String(req.body.userEmail || "").trim().toLowerCase() || null,
      phone: String(req.body.userPhone || "").trim() || null,
      isGuest: String(req.body.userIsGuest || "").trim() === "1",
      delivery: {
        provider: String(req.body.userDeliveryProvider || "").trim() || null,
        deliveryType: String(req.body.userDeliveryType || "").trim() || null,
        paymentMethod: String(req.body.userPaymentMethod || "").trim() || null,
        city: String(req.body.userCity || "").trim() || null,
        cityRef: String(req.body.userCityRef || "").trim() || null,
        branchRef: String(req.body.userBranchRef || "").trim() || null,
        point: String(req.body.userDeliveryPoint || "").trim() || null,
        comment: String(req.body.userOrderComment || "").trim() || null
      }
    };

    const entry = {
      id: Date.now(),
      orderNumber,
      createdAt: new Date().toISOString(),
      customer,
      orderColor,
      total,
      ttn,
      files: files.map((f, i) => ({
        index: i + 1,
        name: f.originalname,
        size: f.size,
        mimetype: f.mimetype
      })),
      modelsMeta
    };

    const list = readOrders();
    list.unshift(entry);
    writeOrders(list);
    attachOrderToUser(customer, {
      id: entry.id,
      orderNumber: entry.orderNumber,
      createdAt: entry.createdAt,
      total: entry.total,
      models: files.length,
      orderColor: entry.orderColor,
      ttn: entry.ttn,
      delivery: customer.delivery
    });

    const lines = [
      "Нове замовлення 3D-друку",
      `Номер замовлення: ${orderNumber}`,
      customer.isGuest ? "Оформлення: без реєстрації" : "Оформлення: акаунт",
      `User ID: ${customer.id || "—"}`,
      `Клієнт ID: ${customer.clientId || "—"}`,
      `Клієнт: ${[customer.lastName, customer.name, customer.middleName].filter(Boolean).join(" ").trim() || "—"}`,
      `Телефон: ${customer.phone || "—"}`,
      `Email: ${customer.email || "—"}`,
      `Служба доставки: ${deliveryProviderTitle(customer.delivery.provider)}`,
      `Тип доставки: ${deliveryTypeTitle(customer.delivery.deliveryType)}`,
      `Спосіб оплати: ${paymentMethodTitle(customer.delivery.paymentMethod)}`,
      `Місто: ${customer.delivery.city || "—"}`,
      `City Ref: ${customer.delivery.cityRef || "—"}`,
      `Branch Ref: ${customer.delivery.branchRef || "—"}`,
      `${customer.delivery.deliveryType === "address" ? "Адреса" : "Відділення/поштомат"}: ${customer.delivery.point || "—"}`,
      ttn ? `ТТН: ${ttn}` : null,
      customer.delivery.comment ? `Коментар до замовлення: ${customer.delivery.comment}` : null,
      "",
      `Моделей: ${files.length}`,
      `Сума: ${Number(total || 0).toFixed(2)} грн`,
      orderColor ? `Колір замовлення: ${orderColor}` : null,
      "",
      "Деталі:"
    ];
    modelsMeta.forEach((m, idx) => {
      lines.push(
        `  ${idx + 1}) ${m.name || files[idx]?.originalname || "Модель"}`,
        `     Матеріал: ${m.material || "PLA"}, Міцність: ${m.strength || "medium"}, Якість: ${m.quality || "normal"}`,
        `     Колір: ${m.color || orderColor || "—"}`,
        `     Ціна: ${Number(m.price || 0).toFixed(2)} грн`,
        m.comment ? `     Коментар: ${m.comment}` : "     Коментар: —"
      );
    });

    const textSend = await sendTelegramText(lines.filter(Boolean).join("\n"));
    if (!textSend?.ok && !textSend?.skipped) {
      console.warn("[print3d-order] send text failed:", textSend);
    }

    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      const m = modelsMeta[i] || {};
      const caption = [
        `3D модель ${i + 1}/${files.length}`,
        m.name ? `Назва: ${m.name}` : null,
        `Матеріал: ${m.material || "PLA"}`,
        `Міцність: ${m.strength || "medium"}`,
        `Якість: ${m.quality || "normal"}`,
        `Колір: ${m.color || orderColor || "—"}`,
        m.comment ? `Коментар: ${String(m.comment).slice(0, 300)}` : null
      ].filter(Boolean).join("\n");

      const docRes = await sendTelegramDocument({
        filename: f.originalname,
        buffer: f.buffer,
        caption,
        contentType: f.mimetype || "application/octet-stream"
      });
      if (!docRes?.ok && !docRes?.skipped) {
        console.warn("[print3d-order] send file failed:", f.originalname, docRes);
      }
    }

    return res.json({ ok: true, id: entry.id, orderNumber, ttn });
  } catch (e) {
    console.error("[print3d order]", e);
    return res.status(500).json({ error: "Не вдалося оформити замовлення 3D-друку" });
  }
});

module.exports = router;
