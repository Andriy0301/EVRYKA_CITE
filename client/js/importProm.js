const fs = require("fs");
const path = require("path");
const https = require("https");
const http = require("http");
const csv = require("csv-parser");
const XLSX = require("xlsx");

const DATA_PATH =
  process.argv[2] ||
  "client/export-products-13-09-26_00-05-48.xlsx";
const IMAGES_DIR = "client/images";
const PRODUCTS_PATH = "server/data/products.json";
const POPULARITY_PATH = "server/data/popularity.json";

const CATEGORY_RU_TO_UA = {
  Инструменты: "Інструменти",
  Игрушки: "Іграшки",
  "Товары для дома": "Товари для дому",
  Автотовары: "Автотовари",
  "Сувениры и подарки": "Сувеніри та подарунки",
  "Корневая группа": "Інше",
  Корпусы: "Корпуси",
  Циклоны: "Циклони",
  Другое: "Інше"
};

if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}
fs.mkdirSync(path.dirname(PRODUCTS_PATH), { recursive: true });

function downloadImage(url, outputPath) {
  return new Promise((resolve) => {
    if (!url || !/^https?:\/\//i.test(url) || !url.includes("prom.ua")) {
      return resolve(false);
    }

    const follow = (currentUrl, redirectsLeft) => {
      const client = currentUrl.startsWith("https") ? https : http;
      const request = client.get(currentUrl, (res) => {
        const status = res.statusCode || 0;
        const location = res.headers.location;

        if ([301, 302, 303, 307, 308].includes(status) && location && redirectsLeft > 0) {
          const nextUrl = new URL(location, currentUrl).toString();
          res.resume();
          return follow(nextUrl, redirectsLeft - 1);
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return resolve(false);
        }

        const file = fs.createWriteStream(outputPath);
        res.pipe(file);
        file.on("finish", () => {
          file.close(() => resolve(true));
        });
        file.on("error", () => {
          try {
            fs.unlinkSync(outputPath);
          } catch {
            /* ignore */
          }
          resolve(false);
        });
      });

      request.on("error", () => resolve(false));
    };

    follow(url, 5);
  });
}

function getCell(values, idx) {
  if (!Number.isInteger(idx) || idx < 0 || idx >= values.length) return "";
  return String(values[idx] ?? "").trim();
}

function parseNumber(text, fallback = 0) {
  const normalized = String(text || "")
    .replace(/\s+/g, "")
    .replace(",", ".")
    .trim();
  const num = Number(normalized);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function dedupeKey(name, description) {
  return `${normalizeText(name)}__${normalizeText(description)}`;
}

function allocateUniqueId(preferredId, usedIds) {
  const preferred = Number(preferredId);
  if (Number.isFinite(preferred) && preferred > 0 && !usedIds.has(preferred)) {
    usedIds.add(preferred);
    return preferred;
  }

  let nextId = usedIds.size ? Math.max(...usedIds) + 1 : 1;
  while (usedIds.has(nextId)) nextId += 1;
  usedIds.add(nextId);
  return nextId;
}

function getHeaderIndex(headers, name) {
  return headers.findIndex((h) => String(h || "").trim() === name);
}

function translateCategory(raw) {
  const value = String(raw || "").trim();
  if (!value) return "Інше";
  if (CATEGORY_RU_TO_UA[value]) return CATEGORY_RU_TO_UA[value];

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

function sheetToRows(workbook) {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: ""
  });
  return matrix.map((row) => (Array.isArray(row) ? row.map((cell) => String(cell ?? "")) : []));
}

function loadRowsFromFile(filePath) {
  return new Promise((resolve, reject) => {
    const ext = path.extname(filePath).toLowerCase();

    if (ext === ".xlsx" || ext === ".xls") {
      try {
        const workbook = XLSX.readFile(filePath, { cellDates: false });
        return resolve(sheetToRows(workbook));
      } catch (error) {
        return reject(error);
      }
    }

    const collected = [];
    fs.createReadStream(filePath)
      .pipe(csv({ separator: ",", headers: false }))
      .on("data", (row) => {
        collected.push(Object.values(row));
      })
      .on("end", () => resolve(collected))
      .on("error", reject);
  });
}

async function importProducts(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error("❌ Файл не знайдено:", filePath);
    process.exitCode = 1;
    return;
  }

  console.log("📥 Читаю:", filePath);
  const rows = await loadRowsFromFile(filePath);

  if (!rows.length) {
    console.error("❌ Файл порожній");
    process.exitCode = 1;
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

  if (idxName < 0) {
    console.error("❌ Не знайдено колонку Назва_позиції_укр");
    console.error("Заголовки:", headers.filter(Boolean).slice(0, 30).join(" | "));
    process.exitCode = 1;
    return;
  }

  const dedupedByNameDescription = new Map();
  const usedIds = new Set();
  let nextFallbackId = 1;
  let remappedIds = 0;
  let downloadedImages = 0;

  for (let i = 0; i < dataRows.length; i += 1) {
    const values = dataRows[i];
    const productCode = getCell(values, idxCode);
    const nameUa = getCell(values, idxName);
    const descriptionUa = getCell(values, idxDescription);
    const categoryUa = translateCategory(getCell(values, idxCategory));
    const currency = getCell(values, idxCurrency).toUpperCase();
    const price = parseNumber(getCell(values, idxPrice), 0);

    if (!nameUa) continue;
    if (currency && currency !== "UAH") continue;

    const imageUrls = getCell(values, idxImageLinks)
      .split(",")
      .map((url) => url.trim())
      .filter((url) => /^https?:\/\//i.test(url));

    const numericCode = Number(productCode);
    const preferredId =
      Number.isFinite(numericCode) && numericCode > 0 ? numericCode : nextFallbackId++;
    const wasPreferredFree = !usedIds.has(preferredId);
    const productId = allocateUniqueId(preferredId, usedIds);
    if (Number.isFinite(numericCode) && numericCode > 0 && !wasPreferredFree) {
      remappedIds += 1;
    }

    const localImages = [];
    for (let j = 0; j < imageUrls.length; j += 1) {
      const url = imageUrls[j];
      const filename = `product_${productId}_${j}.jpg`;
      const imagePath = path.join(IMAGES_DIR, filename);
      const downloaded = await downloadImage(url, imagePath);
      if (downloaded) {
        localImages.push(`/images/${filename}`);
        downloadedImages += 1;
      }
    }

    const popularityValue =
      idxPopularity >= 0
        ? Math.max(0, Math.round(parseNumber(getCell(values, idxPopularity), 0)))
        : 0;

    const nextProduct = {
      id: productId,
      name: nameUa,
      price,
      images: localImages,
      description: descriptionUa || "",
      category: categoryUa,
      popularity: popularityValue
    };

    const key = dedupeKey(nameUa, descriptionUa);
    const existing = dedupedByNameDescription.get(key);
    if (!existing || Number(nextProduct.price || 0) < Number(existing.price || 0)) {
      if (existing) usedIds.delete(Number(existing.id));
      dedupedByNameDescription.set(key, nextProduct);
    } else {
      usedIds.delete(productId);
    }

    if ((i + 1) % 10 === 0 || i === dataRows.length - 1) {
      console.log(`… оброблено рядків ${i + 1}/${dataRows.length}`);
    }
  }

  const products = [...dedupedByNameDescription.values()];
  const idSet = new Set(products.map((p) => Number(p.id)));
  if (idSet.size !== products.length) {
    console.error("❌ Після імпорту залишились дублікати ID");
    process.exitCode = 1;
    return;
  }

  const popularity = {};
  products.forEach((product) => {
    const popularityValue = Math.max(0, Math.round(parseNumber(product.popularity, 0)));
    if (popularityValue > 0) {
      popularity[product.id] = popularityValue;
    }
  });

  fs.writeFileSync(PRODUCTS_PATH, JSON.stringify(products, null, 2), "utf8");
  fs.writeFileSync(POPULARITY_PATH, JSON.stringify(popularity, null, 2), "utf8");

  console.log("✅ Імпорт завершено!");
  console.log("📦 Товарів:", products.length);
  console.log("🆔 Унікальних ID:", idSet.size);
  console.log("🔁 Переназначено конфліктних кодів:", remappedIds);
  console.log("🖼 Завантажено зображень:", downloadedImages);
  console.log("🔥 Популярність імпортовано для товарів:", Object.keys(popularity).length);
  if (idxPopularity < 0) {
    console.log("ℹ️ У файлі не знайдено колонки з кількістю замовлень/продажів.");
  }
}

importProducts(DATA_PATH).catch((error) => {
  console.error("❌ Помилка імпорту:", error);
  process.exitCode = 1;
});
