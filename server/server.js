const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// CORS
app.use(cors({
  origin: "*"
}));

// JSON
app.use(express.json());

// 🔥 СТАТИКА
app.use(express.static(path.join(__dirname, "../client")));

// 🔥 РОУТИ (ВАЖЛИВО — з /api)
const productsRoute = require("./routes/products");
const usersRoute = require("./routes/users");
const popularityRoute = require("./routes/popularity");
const shippingRoute = require("./routes/shipping");

app.use("/api/products", productsRoute);
app.use("/api/users", usersRoute);
app.use("/api/popularity", popularityRoute);
app.use("/api/shipping", shippingRoute);

// 🔥 КАРТИНКИ
app.use("/images", express.static(path.join(__dirname, "../client/images")));

// 🚀 PORT
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});