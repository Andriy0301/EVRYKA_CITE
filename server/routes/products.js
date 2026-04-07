const express = require("express");
const router = express.Router();
const fs = require("fs");
const path = require("path");

const products = require("../data/products.json");
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


// всі товари
router.get("/", (req, res) => {
  const sort = req.query.sort;
  const list = [...products];

  if (sort === "popular") {
    const popularity = readPopularity();
    list.sort((a, b) => (popularity[b.id] || 0) - (popularity[a.id] || 0));
  }

  res.json(list);
});

// один товар
router.get("/:id", (req, res) => {
  const product = products.find(p => p.id == req.params.id);
  res.json(product);
});

module.exports = router;
