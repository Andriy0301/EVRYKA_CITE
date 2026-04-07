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

// 🔥 Статика (frontend)
app.use(express.static(path.join(__dirname, "../client")));

// 🔥 Роут для товарів
const productsRoute = require("./routes/products")
app.use("/products", productsRoute);
const usersRoute = require("./routes/users");
app.use("/users", usersRoute);
const popularityRoute = require("./routes/popularity");
app.use("/popularity", popularityRoute);

// 🔥 Картинки (не обов'язково, але залишимо)
app.use("/images", express.static(path.join(__dirname, "../client/images")));

// 🚀 Запуск сервера
app.listen(3000, () => {
  console.log("Server started on http://localhost:3000");
});