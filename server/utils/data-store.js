const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

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

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: Number(process.env.PG_CONNECTION_TIMEOUT_MS || 10000),
  idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT_MS || 30000),
  query_timeout: Number(process.env.PG_QUERY_TIMEOUT_MS || 15000)
});

let initPromise = null;

const LIST_TABLES = {
  users: "users",
  orders: "orders",
  print3dOrders: "print3d_orders",
  print3dRequests: "print3d_requests",
  inquiries: "inquiries",
  crmNotifications: "crm_notifications"
};

const OBJECT_TABLES = {
  statusSync: "status_sync"
};
const LIST_TABLES_WITH_USER_ID = new Set(["orders", "print3dOrders"]);

function parseJsonSafe(raw, fallback) {
  try {
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function readLegacyIfAny(name, fallbackValue) {
  const filePath = LEGACY_FILES[name];
  if (!filePath || !fs.existsSync(filePath)) return fallbackValue;
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw) return fallbackValue;
    return parseJsonSafe(raw, fallbackValue);
  } catch {
    return fallbackValue;
  }
}

function asIsoDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const ts = Date.parse(raw);
  if (Number.isFinite(ts)) return new Date(ts).toISOString();
  return new Date().toISOString();
}

function extractId(item, index) {
  const direct = String(item?.id || "").trim();
  if (direct) return direct;
  return `autogen_${index}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractUserId(name, item) {
  if (name === "users") return String(item?.id || "").trim() || null;
  if (name === "orders") return String(item?.customer?.id || item?.userId || "").trim() || null;
  if (name === "print3dOrders") return String(item?.customer?.id || item?.userId || "").trim() || null;
  return String(item?.userId || "").trim() || null;
}

function extractCreatedAt(item) {
  return asIsoDate(item?.createdAt || item?.updatedAt || new Date().toISOString());
}

async function migrateLegacyListIfEmpty(name) {
  const table = LIST_TABLES[name];
  if (!table) return;
  const check = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
  if (Number(check.rows?.[0]?.cnt || 0) > 0) return;
  const legacy = readLegacyIfAny(name, []);
  if (Array.isArray(legacy) && legacy.length) {
    await setList(name, legacy);
  }
}

async function migrateLegacyObjectIfEmpty(name) {
  const table = OBJECT_TABLES[name];
  if (!table) return;
  const check = await pool.query(`SELECT COUNT(*)::int AS cnt FROM ${table}`);
  if (Number(check.rows?.[0]?.cnt || 0) > 0) return;
  const legacy = readLegacyIfAny(name, {});
  if (legacy && typeof legacy === "object" && !Array.isArray(legacy)) {
    await setObject(name, legacy);
  }
}

async function initDataStore() {
  if (initPromise) return initPromise;
  initPromise = (async () => {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATABASE_URL is required for PostgreSQL connection");
    }
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT,
        password TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print3d_orders (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS print3d_requests (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS inquiries (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS crm_notifications (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS status_sync (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}'::jsonb,
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    await migrateLegacyListIfEmpty("users");
    await migrateLegacyListIfEmpty("orders");
    await migrateLegacyListIfEmpty("print3dOrders");
    await migrateLegacyListIfEmpty("print3dRequests");
    await migrateLegacyListIfEmpty("inquiries");
    await migrateLegacyListIfEmpty("crmNotifications");
    await migrateLegacyObjectIfEmpty("statusSync");
    console.log("PostgreSQL connected");
  })().catch((error) => {
    // Allow subsequent retries if first init failed or timed out.
    initPromise = null;
    throw error;
  })();
  return initPromise;
}

async function getList(name) {
  await initDataStore();
  const table = LIST_TABLES[name];
  if (!table) throw new Error(`Unknown list collection: ${name}`);
  const rows = await pool.query(
    table === "users"
      ? `SELECT data FROM ${table}`
      : `SELECT data FROM ${table} ORDER BY created_at DESC`
  );
  return rows.rows.map((row) => row.data || {}).filter(Boolean);
}

async function setList(name, list) {
  await initDataStore();
  const table = LIST_TABLES[name];
  if (!table) throw new Error(`Unknown list collection: ${name}`);
  const items = Array.isArray(list) ? list : [];
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const ids = items.map((item, idx) => extractId(item, idx));
    if (ids.length) {
      await client.query(`DELETE FROM ${table} WHERE id <> ALL($1::text[])`, [ids]);
    } else {
      await client.query(`DELETE FROM ${table}`);
    }
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx] || {};
      const id = extractId(item, idx);
      const data = { ...item, id };
      if (table === "users") {
        await client.query(
          `INSERT INTO users(id, email, password, data)
           VALUES($1, $2, $3, $4::jsonb)
           ON CONFLICT(id) DO UPDATE SET
             email = EXCLUDED.email,
             password = EXCLUDED.password,
             data = EXCLUDED.data`,
          [id, String(data.email || "").trim().toLowerCase() || null, String(data.password || ""), JSON.stringify(data)]
        );
      } else if (LIST_TABLES_WITH_USER_ID.has(name)) {
        await client.query(
          `INSERT INTO ${table}(id, user_id, data, created_at)
           VALUES($1, $2, $3::jsonb, $4::timestamp)
           ON CONFLICT(id) DO UPDATE SET
             user_id = EXCLUDED.user_id,
             data = EXCLUDED.data,
             created_at = EXCLUDED.created_at`,
          [id, extractUserId(name, data), JSON.stringify(data), extractCreatedAt(data)]
        );
      } else {
        await client.query(
          `INSERT INTO ${table}(id, data, created_at)
           VALUES($1, $2::jsonb, $3::timestamp)
           ON CONFLICT(id) DO UPDATE SET
             data = EXCLUDED.data,
             created_at = EXCLUDED.created_at`,
          [id, JSON.stringify(data), extractCreatedAt(data)]
        );
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return items;
}

async function upsertListItem(name, item) {
  await initDataStore();
  const table = LIST_TABLES[name];
  if (!table) throw new Error(`Unknown list collection: ${name}`);

  const id = extractId(item, 0);
  const data = { ...(item || {}), id };

  if (table === "users") {
    await pool.query(
      `INSERT INTO users(id, email, password, data)
       VALUES($1, $2, $3, $4::jsonb)
       ON CONFLICT(id) DO UPDATE SET
         email = EXCLUDED.email,
         password = EXCLUDED.password,
         data = EXCLUDED.data`,
      [id, String(data.email || "").trim().toLowerCase() || null, String(data.password || ""), JSON.stringify(data)]
    );
    return data;
  }

  if (LIST_TABLES_WITH_USER_ID.has(name)) {
    await pool.query(
      `INSERT INTO ${table}(id, user_id, data, created_at)
       VALUES($1, $2, $3::jsonb, $4::timestamp)
       ON CONFLICT(id) DO UPDATE SET
         user_id = EXCLUDED.user_id,
         data = EXCLUDED.data,
         created_at = EXCLUDED.created_at`,
      [id, extractUserId(name, data), JSON.stringify(data), extractCreatedAt(data)]
    );
    return data;
  }

  await pool.query(
    `INSERT INTO ${table}(id, data, created_at)
     VALUES($1, $2::jsonb, $3::timestamp)
     ON CONFLICT(id) DO UPDATE SET
       data = EXCLUDED.data,
       created_at = EXCLUDED.created_at`,
    [id, JSON.stringify(data), extractCreatedAt(data)]
  );

  return data;
}

async function getObject(name) {
  await initDataStore();
  const table = OBJECT_TABLES[name];
  if (!table) throw new Error(`Unknown object collection: ${name}`);
  const res = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, ["default"]);
  return res.rows?.[0]?.data || {};
}

async function setObject(name, obj) {
  await initDataStore();
  const table = OBJECT_TABLES[name];
  if (!table) throw new Error(`Unknown object collection: ${name}`);
  const value = obj && typeof obj === "object" && !Array.isArray(obj) ? obj : {};
  await pool.query(
    `INSERT INTO ${table}(id, data, updated_at)
     VALUES($1, $2::jsonb, NOW())
     ON CONFLICT(id) DO UPDATE SET
       data = EXCLUDED.data,
       updated_at = NOW()`,
    ["default", JSON.stringify(value)]
  );
  return value;
}

async function getCollection(name, fallbackValue) {
  if (Object.prototype.hasOwnProperty.call(LIST_TABLES, name)) {
    return getList(name);
  }
  if (Object.prototype.hasOwnProperty.call(OBJECT_TABLES, name)) {
    return getObject(name);
  }
  return fallbackValue;
}

async function setCollection(name, value) {
  if (Object.prototype.hasOwnProperty.call(LIST_TABLES, name)) {
    return setList(name, Array.isArray(value) ? value : []);
  }
  if (Object.prototype.hasOwnProperty.call(OBJECT_TABLES, name)) {
    return setObject(name, value && typeof value === "object" ? value : {});
  }
  return value;
}

module.exports = {
  DATA_DIR,
  LEGACY_FILES,
  pool,
  initDataStore,
  getCollection,
  setCollection,
  getList,
  setList,
  upsertListItem,
  getObject,
  setObject
};
