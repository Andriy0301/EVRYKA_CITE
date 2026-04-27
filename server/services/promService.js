const PROM_BASE_URL = "https://my.prom.ua/api/v1";
const CACHE_TTL_MS = 5 * 60 * 1000;
const SALES_ALLOWED_STATUSES = new Set(["delivered", "received", "paid"]);
const DEFAULT_PAGE_LIMIT = 100;

const cache = new Map();

function getApiKey() {
  const apiKey = process.env.PROM_API_KEY;
  if (!apiKey) {
    throw new Error("PROM_API_KEY is not configured");
  }
  return apiKey;
}

function getCachedValue(cacheKey) {
  const entry = cache.get(cacheKey);
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return null;
  }

  return entry.value;
}

function setCachedValue(cacheKey, value, ttlMs = CACHE_TTL_MS) {
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + ttlMs
  });
}

async function withCache(cacheKey, producer, ttlMs = CACHE_TTL_MS) {
  const cachedValue = getCachedValue(cacheKey);
  if (cachedValue !== null) {
    return cachedValue;
  }

  const value = await producer();
  setCachedValue(cacheKey, value, ttlMs);
  return value;
}

async function promRequest(pathname, queryParams = {}) {
  const apiKey = getApiKey();
  const url = new URL(`${PROM_BASE_URL}/${pathname.replace(/^\/+/, "")}`);

  Object.entries(queryParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Prom API request failed (${response.status}): ${errorBody}`);
  }

  return response.json();
}

function getCollectionFromPayload(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];

  if (Array.isArray(payload.products)) return payload.products;
  if (Array.isArray(payload.orders)) return payload.orders;
  if (Array.isArray(payload.data)) return payload.data;
  if (Array.isArray(payload.results)) return payload.results;

  return [];
}

function getNextPagePointer(payload) {
  if (!payload || typeof payload !== "object") return null;

  const links = payload._links || payload.links;
  if (links?.next?.href) return links.next.href;
  if (typeof payload.next === "string") return payload.next;

  if (typeof payload.page === "number" && typeof payload.pages === "number" && payload.page < payload.pages) {
    return { page: payload.page + 1 };
  }

  if (payload.has_next === true) {
    const nextOffset = Number(payload.offset || 0) + Number(payload.limit || DEFAULT_PAGE_LIMIT);
    return {
      offset: nextOffset,
      limit: Number(payload.limit || DEFAULT_PAGE_LIMIT)
    };
  }

  return null;
}

function toSimplifiedProduct(rawProduct) {
  const image =
    rawProduct?.image ||
    rawProduct?.main_image ||
    rawProduct?.images?.[0]?.url ||
    rawProduct?.images?.[0] ||
    null;

  return {
    id: rawProduct?.id,
    name: rawProduct?.name || "",
    price: Number(rawProduct?.price ?? 0),
    image
  };
}

async function fetchAllProductsFromProm() {
  const seenProductIds = new Set();
  const products = [];
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const payload = await promRequest("products/list", {
      page,
      limit: DEFAULT_PAGE_LIMIT
    });
    const pageProducts = getCollectionFromPayload(payload);

    for (const product of pageProducts) {
      const productId = String(product?.id ?? "");
      if (!productId || seenProductIds.has(productId)) continue;
      seenProductIds.add(productId);
      products.push(toSimplifiedProduct(product));
    }

    const nextPointer = getNextPagePointer(payload);
    hasMore = Boolean(nextPointer);
    if (typeof nextPointer === "object" && typeof nextPointer.page === "number") {
      page = nextPointer.page;
    } else if (hasMore && pageProducts.length >= DEFAULT_PAGE_LIMIT) {
      page += 1;
    } else {
      hasMore = false;
    }
  }

  return products;
}

function normalizeOrderStatus(order) {
  return String(order?.status || order?.status_group || "").toLowerCase().trim();
}

function getOrderItems(order) {
  if (Array.isArray(order?.products)) return order.products;
  if (Array.isArray(order?.items)) return order.items;
  if (Array.isArray(order?.positions)) return order.positions;
  return [];
}

function getItemProductId(item) {
  return item?.product_id || item?.id || item?.sku || null;
}

async function fetchAllOrdersFromProm() {
  const uniqueOrders = new Map();
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const payload = await promRequest("orders/list", {
      page,
      limit: DEFAULT_PAGE_LIMIT
    });

    const pageOrders = getCollectionFromPayload(payload);
    for (const order of pageOrders) {
      const orderId = String(order?.id ?? "");
      if (!orderId || uniqueOrders.has(orderId)) continue;
      uniqueOrders.set(orderId, order);
    }

    const nextPointer = getNextPagePointer(payload);
    hasMore = Boolean(nextPointer);
    if (typeof nextPointer === "object" && typeof nextPointer.page === "number") {
      page = nextPointer.page;
    } else if (hasMore && pageOrders.length >= DEFAULT_PAGE_LIMIT) {
      page += 1;
    } else {
      hasMore = false;
    }
  }

  return Array.from(uniqueOrders.values());
}

async function getAllProducts() {
  return withCache("prom:products", fetchAllProductsFromProm);
}

async function getProductSalesMap() {
  return withCache("prom:product-sales", async () => {
    const orders = await fetchAllOrdersFromProm();
    const productSales = {};

    for (const order of orders) {
      const status = normalizeOrderStatus(order);
      if (!SALES_ALLOWED_STATUSES.has(status)) continue;

      const orderItems = getOrderItems(order);
      for (const item of orderItems) {
        const productId = getItemProductId(item);
        if (!productId) continue;

        const quantity = Number(item?.quantity || item?.qty || 0);
        if (!Number.isFinite(quantity) || quantity <= 0) continue;

        const key = String(productId);
        productSales[key] = (productSales[key] || 0) + quantity;
      }
    }

    return productSales;
  });
}

async function getProductsWithSales() {
  const [products, productSales] = await Promise.all([getAllProducts(), getProductSalesMap()]);

  return products.map((product) => ({
    ...product,
    soldCount: productSales[String(product.id)] || 0
  }));
}

async function getTopProducts(limit = 10) {
  const productsWithSales = await getProductsWithSales();
  return productsWithSales
    .slice()
    .sort((a, b) => b.soldCount - a.soldCount)
    .slice(0, limit);
}

module.exports = {
  getAllProducts,
  getProductSalesMap,
  getProductsWithSales,
  getTopProducts
};
