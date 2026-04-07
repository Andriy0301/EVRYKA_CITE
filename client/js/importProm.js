const fs = require("fs");
const https = require("https");
const csv = require("csv-parser");

const results = [];

// 📁 створюємо папку для картинок
if (!fs.existsSync("client/images")) {
  fs.mkdirSync("client/images", { recursive: true });
}

// 🔥 скачування фото
function downloadImage(url, path) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("http") || !url.includes("prom.ua")) {
      return resolve();
    }

    https.get(url, (res) => {
      const file = fs.createWriteStream(path);
      res.pipe(file);

      file.on("finish", () => {
        file.close(resolve);
      });
    }).on("error", () => resolve());
  });
}

// 🔥 читаємо CSV
fs.createReadStream("client/export-products-04-04-26_09-30-12.csv")
  .pipe(csv({
    separator: ",",
    headers: false
  }))

  .on("data", (row) => {
    results.push(row);
  })

  .on("end", async () => {
    const products = [];

    for (let i = 0; i < results.length; i++) {
      const row = results[i];

      const name = row[2] || row[1] || "";
      let description = "";
    const category = row[18] || "Інше";
// 🔥 шукаємо український опис
Object.values(row).forEach(v => {
  if (
    v &&
    v.length > 50 &&                 // нормальний текст
    v.includes(" ") &&              // не одне слово
    (v.includes("для") || v.includes("та") || v.includes("що")) // укр слова
  ) {
    description = v;
  }
});

      // ✅ ФІКС ЦІНИ (через UAH)
      let price = 0;

      Object.values(row).forEach((v, index) => {
        if (v === "UAH" && row[index - 1]) {
          price = Number(row[index - 1]);
        }
      });

      // 🔥 картинки
      let imagesRaw = "";

      Object.values(row).forEach((v) => {
        if (v && v.includes("images.prom.ua")) {
          imagesRaw = v;
        }
      });

      const imageUrls = (imagesRaw || "")
        .split(",")
        .map(i => i.trim())
        .filter(url => url.startsWith("http"));

      const localImages = [];

      for (let j = 0; j < imageUrls.length; j++) {
        const url = imageUrls[j];

        const filename = `product_${i}_${j}.jpg`;
        const path = `client/images/${filename}`;

        await downloadImage(url, path);

        localImages.push(`/images/${filename}`);
      }

      if (!name) continue;

      products.push({
        id: i + 1,
        name,
        price,
        images: localImages,
        description,
        category
      });
    }

    fs.writeFileSync(
      "server/data/products.json",
      JSON.stringify(products, null, 2)
    );

    console.log("✅ Імпорт завершено!");
    console.log("📦 Товарів:", products.length);
  });