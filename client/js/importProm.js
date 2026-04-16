const fs = require("fs");
const path = require("path");
const https = require("https");
const csv = require("csv-parser");

const DATA_CSV_PATH = "client/export-products-04-04-26_09-30-12.csv";
const IMAGES_DIR = "client/images";
const PRODUCTS_PATH = "server/data/products.json";
const POPULARITY_PATH = "server/data/popularity.json";
const rows = [];

const CATEGORY_RU_TO_UA = {
  "Инструменты": "Інструменти",
  "Игрушки": "Іграшки",
  "Товары для дома": "Товари для дому",
  "Автотовары": "Автотовари",
  "Сувениры и подарки": "Сувеніри та подарунки",
  "Корневая группа": "Інше",
  "Корпусы": "Корпуси",
  "Циклоны": "Циклони",
  "Другое": "Інше"
};

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
fs.mkdirSync(path.dirname(PRODUCTS_PATH), { recursive: true });

function downloadImage(url, outputPath) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("http") || !url.includes("prom.ua")) {
      return resolve(false);
    }
    https
      .get(url, (res) => {
        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(true));
        });
      })
      .on("error", () => resolve(false));
  });
}

function getCell(values, idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= values.length) return "";
  return String(values[idx] || "").trim();
}

function parseNumber(text, fallback = 0) {
  const normalized = String(text || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function getHeaderIndex(headers, name) {
  return headers.findIndex((h) => String(h || "").trim() === name);
}

function translateCategory(raw) {
  const value = String(raw || "").trim();
  if (!value) return "Інше";
  if (CATEGORY_RU_TO_UA[value]) return CATEGORY_RU_TO_UA[value];

  // Safety net for other Russian labels not listed explicitly.
  const normalized = value
    .replace(/инструмент(ы|ов)?/gi, "Інструменти")
    .replace(/игрушк(и|а|е|у|ой|ам|ах)?/gi, "Іграшки")
    .replace(/корпус(ы|а|ов)?/gi, "Корпуси")
    .replace(/циклон(ы|а|ов)?/gi, "Циклони")
    .replace(/корневая группа/gi, "Інше")
    .replace(/другое/gi, "Інше")
    .trim();

  return normalized || "Інше";
}

function pickPopularityColumnIndex(headers) {
  const candidates = headers
    .map((header, idx) => ({ header: String(header || "").trim().toLowerCase(), idx }))
    .filter((entry) => entry.header);

  const preferred = candidates.find(({ header }) =>
    /(замовлен|замовленн|продан|куплен|покупок|sales|sold|orders?)/i.test(header)
  );
  return preferred ? preferred.idx : -1;
}

fs.createReadStream(DATA_CSV_PATH)
  .pipe(csv({ separator: ",", headers: false }))
  .on("data", (row) => {
    rows.push(Object.values(row));
  })
  .on("end", async () => {
    if (!rows.length) {
      console.error("❌ CSV порожній");
      return;
    }

    const headers = rows[0].map((value) => String(value || "").trim());
    const dataRows = rows.slice(1);

    const idxCode = getHeaderIndex(headers, "Код_товару");
    const idxName = getHeaderIndex(headers, "Назва_позиції_укр");
    const idxDescription = getHeaderIndex(headers, "Опис_укр");
    const idxCategory = getHeaderIndex(headers, "Назва_групи");
    const idxPrice = getHeaderIndex(headers, "Ціна");
    const idxCurrency = getHeaderIndex(headers, "Валюта");
    const idxImageLinks = getHeaderIndex(headers, "Посилання_зображення");
    const idxPopularity = pickPopularityColumnIndex(headers);

    const products = [];
    const popularity = {};

    for (let i = 0; i < dataRows.length; i += 1) {
      const values = dataRows[i];
      const productCode = getCell(values, idxCode);
      const nameUa = getCell(values, idxName);
      const descriptionUa = getCell(values, idxDescription);
      const categoryUa = translateCategory(getCell(values, idxCategory));
      const currency = getCell(values, idxCurrency).toUpperCase();
      const price = parseNumber(getCell(values, idxPrice), 0);

      if (!nameUa) continue; // беремо тільки українські назви
      if (currency && currency !== "UAH") continue;

      const imageUrls = getCell(values, idxImageLinks)
        .split(",")
        .map((url) => url.trim())
        .filter((url) => /^https?:\/\//i.test(url));

      const localImages = [];
      for (let j = 0; j < imageUrls.length; j += 1) {
        const url = imageUrls[j];
        const filename = `product_${i + 1}_${j}.jpg`;
        const imagePath = path.join(IMAGES_DIR, filename);
        const downloaded = await downloadImage(url, imagePath);
        if (downloaded) {
          localImages.push(`/images/${filename}`);
        }
      }

      const fallbackId = products.length + 1;
      const numericCode = Number(productCode);
      const productId = Number.isFinite(numericCode) && numericCode > 0 ? numericCode : fallbackId;

      const popularityValue = idxPopularity >= 0 ? Math.max(0, Math.round(parseNumber(getCell(values, idxPopularity), 0))) : 0;
      if (popularityValue > 0) {
        popularity[productId] = popularityValue;
      }

      products.push({
        id: productId,
        name: nameUa,
        price,
        images: localImages,
        description: descriptionUa || "",
        category: categoryUa,
        popularity: popularityValue
      });
    }

    fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf8");
    fs.writeFileSync(POPULARITY_PATH, JSON.stringify(popularity, null, 2), "utf8");

    console.log("✅ Імпорт завершено!");
    console.log("📦 Товарів:", products.length);
    console.log("🔥 Популярність імпортовано для товарів:", Object.keys(popularity).length);
    if (idxPopularity < 0) {
      console.log("ℹ️ У CSV не знайдено колонки з кількістю замовлень/продажів.");
    }
  });