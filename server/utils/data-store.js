const fs = require("fs");
const path = require("path");

const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, "../data");

const LEGACY_FILES = {
  users: path.join(DATA_DIR, "users.json"),
  orders: path.join(DATA_DIR, "orders.json"),
  print3dOrders: path.join(DATA_DIR, "print3d-orders.json"),
  print3dRequests: path.join(DATA_DIR, "print3d-requests.json"),
  inquiries: path.join(DATA_DIR, "inquiries.json"),
  crmNotifications: path.join(DATA_DIR, "crm-notifications.json"),
  statusSync: path.join(DATA_DIR, "order-status-sync.json")
};

const LIST_COLLECTIONS = new Set([
  "users",
  "orders",
  "print3dOrders",
  "print3dRequests",
  "inquiries",
  "crmNotifications"
]);
const OBJECT_COLLECTIONS = new Set(["statusSync"]);
const TIME_SERIES_COLLECTIONS = new Set([
  "orders",
  "print3dOrders",
  "print3dRequests",
  "inquiries",
  "crmNotifications"
]);

let initPromise = null;

function parseJsonSafe(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function ensureFile(filePath, fallbackValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallbackValue, null, 2), "utf8");
  }
}

function readJsonFile(filePath, fallbackValue) {
  try {
    ensureFile(filePath, fallbackValue);
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return fallbackValue;
    return parseJsonSafe(raw, fallbackValue);
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, value) {
  ensureFile(filePath, value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function normalizeId(item, index) {
  const existing = String(item?.id || "").trim();
  if (existing) return existing;
  return `autogen_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

async function initDataStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    Object.entries(LEGACY_FILES).forEach(([name, filePath]) => {
      const fallbackValue = OBJECT_COLLECTIONS.has(name) ? {} : [];
      ensureFile(filePath, fallbackValue);
    });
    console.log("JSON data store ready");
  })();
  return initPromise;
}

async function ensureDataStoreReady() {
  return initDataStore();
}

async function getList(name) {
  await ensureDataStoreReady();
  if (!LIST_COLLECTIONS.has(name)) {
    throw new Error(`Unknown list collection: ${name}`);
  }
  const filePath = LEGACY_FILES[name];
  const value = readJsonFile(filePath, []);
  return Array.isArray(value) ? value : [];
}

async function setList(name, list) {
  await ensureDataStoreReady();
  if (!LIST_COLLECTIONS.has(name)) {
    throw new Error(`Unknown list collection: ${name}`);
  }
  const items = Array.isArray(list) ? list : [];
  writeJsonFile(LEGACY_FILES[name], items);
  return items;
}

async function upsertListItem(name, item) {
  await ensureDataStoreReady();
  if (!LIST_COLLECTIONS.has(name)) {
    throw new Error(`Unknown list collection: ${name}`);
  }
  const current = await getList(name);
  const nextItem = { ...(item || {}) };
  const id = normalizeId(nextItem, 0);
  nextItem.id = id;

  const idx = current.findIndex((entry) => String(entry?.id || "").trim() === id);
  if (idx >= 0) {
    current[idx] = nextItem;
  } else if (TIME_SERIES_COLLECTIONS.has(name)) {
    current.unshift(nextItem);
  } else {
    current.push(nextItem);
  }

  await setList(name, current);
  return nextItem;
}

async function getObject(name) {
  await ensureDataStoreReady();
  if (!OBJECT_COLLECTIONS.has(name)) {
    throw new Error(`Unknown object collection: ${name}`);
  }
  const value = readJsonFile(LEGACY_FILES[name], {});
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

async function setObject(name, obj) {
  await ensureDataStoreReady();
  if (!OBJECT_COLLECTIONS.has(name)) {
    throw new Error(`Unknown object collection: ${name}`);
  }
  const value = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  writeJsonFile(LEGACY_FILES[name], value);
  return value;
}

async function getCollection(name, fallbackValue) {
  if (LIST_COLLECTIONS.has(name)) return getList(name);
  if (OBJECT_COLLECTIONS.has(name)) return getObject(name);
  return fallbackValue;
}

async function setCollection(name, value) {
  if (LIST_COLLECTIONS.has(name)) return setList(name, Array.isArray(value) ? value : []);
  if (OBJECT_COLLECTIONS.has(name)) return setObject(name, value && typeof value === "object" ? value : {});
  return value;
}

module.exports = {
  DATA_DIR,
  LEGACY_FILES,
  initDataStore,
  getCollection,
  setCollection,
  getList,
  setList,
  upsertListItem,
  getObject,
  setObject
};
