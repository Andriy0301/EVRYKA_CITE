const express = require("express");
const fs = require("fs");
const path = require("path");

const router = express.Router();
const popularityPath = path.join(__dirname, "../data/popularity.json");

function readPopularity() {
  try {
    if (!fs.existsSync(popularityPath)) {
      fs.writeFileSync(popularityPath, "{}");
      return {};
    }

    const raw = fs.readFileSync(popularityPath, "utf8");
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function writePopularity(popularity) {
  fs.writeFileSync(popularityPath, JSON.stringify(popularity, null, 2));
}

router.get("/", (req, res) => {
  res.json(readPopularity());
});

router.post("/track", (req, res) => {
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  const popularity = readPopularity();

  items.forEach((item) => {
    const productId = Number(item.productId);
    const qty = Number(item.qty) || 1;

    if (!productId) return;
    popularity[productId] = (popularity[productId] || 0) + Math.max(qty, 1);
  });

  writePopularity(popularity);
  res.json({ ok: true, popularity });
});

module.exports = router;
