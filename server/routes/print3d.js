const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { parseModelVolume } = require("../utils/parse-model-volume");
const { calculatePricing } = require("../utils/print3d-pricing");
const { sendTelegramText, sendTelegramDocument } = require("../utils/telegram");

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
    return raw ? JSON.parse(raw) : [];
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
  const userEmail = String(customer?.email || "").trim().toLowerCase();
  const userPhone = String(customer?.phone || "").trim();
  if (!userId && !userEmail && !userPhone) return;

  const users = readUsers();
  const idx = users.findIndex((u) => {
    return (
      (userId && String(u.id) === userId) ||
      (userEmail && String(u.email || "").trim().toLowerCase() === userEmail) ||
      (userPhone && String(u.phone || "").trim() === userPhone)
    );
  });
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
  if (s === "low" || s === "high" || s === "medium") return s;
  return "medium";
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

    if (!name || !phone || !email) {
      return res.status(400).json({
        error: "Заповніть ім'я, телефон та email"
      });
    }
    if (!description || description.length < 3) {
      return res.status(400).json({ error: "Опишіть задачу (мінімум 3 символи)" });
    }

    const entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
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
    const customer = {
      id: String(req.body.userId || "").trim() || null,
      email: String(req.body.userEmail || "").trim().toLowerCase() || null,
      phone: String(req.body.userPhone || "").trim() || null
    };

    const entry = {
      id: Date.now(),
      createdAt: new Date().toISOString(),
      customer,
      orderColor,
      total,
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
      createdAt: entry.createdAt,
      total: entry.total,
      models: files.length,
      orderColor: entry.orderColor
    });

    const lines = [
      "Нове замовлення 3D-друку",
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

    return res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error("[print3d order]", e);
    return res.status(500).json({ error: "Не вдалося оформити замовлення 3D-друку" });
  }
});

module.exports = router;
