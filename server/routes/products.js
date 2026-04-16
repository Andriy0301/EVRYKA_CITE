const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

// правильні шляхи (важливо для Render)
const productsPath = path.join(__dirname, "../data/products.json");
const popularityPath = path.join(__dirname, "../data/popularity.json");

// читаємо товари
function readProducts() {
  try {
    const raw = fs.readFileSync(productsPath, "utf8");
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error("Error reading products:", error);
    return [];
  }
}

// читаємо популярність
function readPopularity() {
  try {
    if (!fs.existsSync(popularityPath)) {
      fs.writeFileSync(popularityPath, "{}");
      return {};
    }

    const raw = fs.readFileSync(popularityPath, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.error("Error reading popularity:", error);
    return {};
  }
}

// 👉 ВСІ ТОВАРИ
router.get("/", (req, res) => {
  try {
    const sort = req.query.sort;
    const products = readProducts();

    let list = [...products];

    if (sort === "popular") {
      const popularity = readPopularity();

      list.sort((a, b) => {
        const aScore = Number(popularity?.[a.id] ?? a?.popularity ?? 0) || 0;
        const bScore = Number(popularity?.[b.id] ?? b?.popularity ?? 0) || 0;
        return bScore - aScore;
      });
    }

    res.json(list);
  } catch (error) {
    console.error("GET /products error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// 👉 ОДИН ТОВАР
router.get("/:id", (req, res) => {
  try {
    const products = readProducts();
    const product = products.find(p => p.id == req.params.id);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    console.error("GET /products/:id error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

module.exports = router;