const express = require("express");
const {
  getAllProducts,
  getProductSalesMap,
  getProductsWithSales,
  getTopProducts
} = require("../services/promService");

const router = express.Router();

router.get("/products", async (req, res) => {
  try {
    const products = await getAllProducts();
    res.json(products);
  } catch (error) {
    console.error("[prom] GET /api/products failed:", error?.message || error);
    res.status(500).json({ error: "Failed to fetch products from Prom API" });
  }
});

router.get("/product-sales", async (req, res) => {
  try {
    const productSales = await getProductSalesMap();
    res.json(productSales);
  } catch (error) {
    console.error("[prom] GET /api/product-sales failed:", error?.message || error);
    res.status(500).json({ error: "Failed to calculate product sales" });
  }
});

router.get("/products-with-sales", async (req, res) => {
  try {
    const productsWithSales = await getProductsWithSales();
    res.json(productsWithSales);
  } catch (error) {
    console.error("[prom] GET /api/products-with-sales failed:", error?.message || error);
    res.status(500).json({ error: "Failed to fetch products with sales" });
  }
});

router.get("/top-products", async (req, res) => {
  try {
    const topProducts = await getTopProducts(10);
    res.json(topProducts);
  } catch (error) {
    console.error("[prom] GET /api/top-products failed:", error?.message || error);
    res.status(500).json({ error: "Failed to fetch top products" });
  }
});

module.exports = router;
