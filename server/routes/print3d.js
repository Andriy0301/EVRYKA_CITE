const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { parseModelVolume } = require("../utils/parse-model-volume");
const { calculatePricing } = require("../utils/print3d-pricing");
const { sendTelegramText } = require("../utils/telegram");

const router = express.Router();
const MAX_SIZE = 50 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_SIZE }
});

const dataPath = path.join(__dirname, "../data/print3d-requests.json");

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
      })
      .catch((e) => console.error("[print3d-request telegram]", e));

    return res.json({ ok: true, id: entry.id });
  } catch (e) {
    console.error("[print3d request]", e);
    return res.status(500).json({ error: "Не вдалося зберегти заявку" });
  }
});

module.exports = router;
