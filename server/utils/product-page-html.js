const fs = require("fs");
const path = require("path");

const PRODUCTS_PATH = path.join(__dirname, "../data/products.json");
const PRODUCT_INDEX_PATH = path.join(__dirname, "../../client/product/index.html");
const PLACEHOLDER = "<!--EVRYKA_PRODUCT_JSON_LD-->";

function readProducts() {
  const raw = fs.readFileSync(PRODUCTS_PATH, "utf8");
  return JSON.parse(raw);
}

function stripHtml(html) {
  return String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteImageUrl(siteOrigin, raw) {
  if (!raw) return null;
  const s = String(raw);
  if (/^https?:\/\//i.test(s)) return s;
  return s.startsWith("/") ? siteOrigin + s : `${siteOrigin}/${s}`;
}

const DEFAULT_OG_PATH = "/images/text_logo.png";

/**
 * Product JSON-LD об'єкт (schema.org) для вставки у HTML source.
 */
function buildProductSchema(product, id, siteOrigin) {
  const canonicalUrl = `${siteOrigin}/product?id=${encodeURIComponent(id)}`;
  const name = String(product?.name || "Товар").trim();
  let description = stripHtml(product?.description || "").trim();
  if (!description) {
    description = `${name} — 3D-друк EVRYKA. Доставка Новою Поштою по Україні.`;
  }

  const imageUrls = Array.isArray(product?.images)
    ? product.images.map((img) => absoluteImageUrl(siteOrigin, img)).filter(Boolean)
    : [];
  if (imageUrls.length === 0) {
    imageUrls.push(siteOrigin + DEFAULT_OG_PATH);
  }

  const priceNum = Number(product?.price);
  const priceOk = Number.isFinite(priceNum) && priceNum >= 0;

  const availability =
    product?.availability === "https://schema.org/OutOfStock" ||
    product?.availability === "OutOfStock" ||
    product?.inStock === false
      ? "https://schema.org/OutOfStock"
      : "https://schema.org/InStock";

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name,
    description,
    image: imageUrls.length === 1 ? imageUrls[0] : imageUrls,
    sku: String(id),
    url: canonicalUrl,
    brand: {
      "@type": "Brand",
      name: "EVRYKA"
    },
    offers: {
      "@type": "Offer",
      url: canonicalUrl,
      priceCurrency: "UAH",
      price: priceOk ? priceNum : 0,
      availability,
      itemCondition: "https://schema.org/NewCondition",
      seller: {
        "@type": "Organization",
        name: "EVRYKA",
        url: siteOrigin
      }
    }
  };
}

function jsonLdScriptFromSchema(schema) {
  const json = JSON.stringify(schema).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function readProductIndexTemplate() {
  return fs.readFileSync(PRODUCT_INDEX_PATH, "utf8");
}

/**
 * Віддає product/index.html: з JSON-LD у source для валідного id, інакше без плейсхолдера.
 */
function sendProductIndexPage(res, siteOrigin, req) {
  let html;
  try {
    html = readProductIndexTemplate();
  } catch {
    res.status(500).send("Product page template missing");
    return;
  }

  const rawId = req.query && req.query.id;

  if (rawId == null || rawId === "") {
    html = html.replace(PLACEHOLDER, "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  let products;
  try {
    products = readProducts();
  } catch {
    html = html.replace(PLACEHOLDER, "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  const idNum = Number(rawId);
  if (!Number.isFinite(idNum)) {
    html = html.replace(PLACEHOLDER, "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  const product = products.find((p) => Number(p.id) === idNum);
  if (!product) {
    html = html.replace(PLACEHOLDER, "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(html);
    return;
  }

  const schema = buildProductSchema(product, idNum, siteOrigin);
  const script = jsonLdScriptFromSchema(schema);
  html = html.replace(PLACEHOLDER, script);

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
}

function isProductIndexPath(p) {
  return p === "/product" || p === "/product/" || p === "/product/index.html";
}

module.exports = {
  sendProductIndexPage,
  buildProductSchema,
  isProductIndexPath,
  PLACEHOLDER
};
