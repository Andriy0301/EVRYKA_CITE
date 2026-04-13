/**
 * Об'єм сітки в см³ (координати в мм → мм³ / 1000 = см³).
 * Динамічний імпорт three (ESM) з CommonJS роуту.
 */
const JSZip = require("jszip");
const { parseStringPromise, processors } = require("xml2js");
const stripPrefix = processors.stripPrefix;

async function computeBufferGeometryVolumeCm3(geometry, THREE) {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) return 0;

  let volumeMm3 = 0;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const cross = new THREE.Vector3();

  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i];
      const b = idx[i + 1];
      const c = idx[i + 2];
      v0.fromBufferAttribute(position, a);
      v1.fromBufferAttribute(position, b);
      v2.fromBufferAttribute(position, c);
      cross.crossVectors(v1, v2);
      volumeMm3 += v0.dot(cross) / 6;
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      v0.fromBufferAttribute(position, i);
      v1.fromBufferAttribute(position, i + 1);
      v2.fromBufferAttribute(position, i + 2);
      cross.crossVectors(v1, v2);
      volumeMm3 += v0.dot(cross) / 6;
    }
  }

  const volumeCm3 = Math.abs(volumeMm3) / 1000;
  return Math.round(volumeCm3 * 10000) / 10000;
}

function extOf(name) {
  const lower = String(name || "").toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

function asArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function parse3mfTransform(transformValue, THREE) {
  const matrix = new THREE.Matrix4();
  if (!transformValue) return matrix;
  const values = String(transformValue)
    .trim()
    .split(/\s+/)
    .map((n) => Number(n));
  if (values.length !== 12 || values.some((n) => !Number.isFinite(n))) return matrix;
  matrix.set(
    values[0], values[3], values[6], values[9],
    values[1], values[4], values[7], values[10],
    values[2], values[5], values[8], values[11],
    0, 0, 0, 1
  );
  return matrix;
}

function meshGeometryFrom3mf(mesh, THREE) {
  const vertices = asArray(mesh?.vertices?.vertex);
  const triangles = asArray(mesh?.triangles?.triangle);
  if (!vertices.length || !triangles.length) return null;

  const positions = [];
  for (const tri of triangles) {
    const i1 = Number(tri?.v1);
    const i2 = Number(tri?.v2);
    const i3 = Number(tri?.v3);
    if (![i1, i2, i3].every((v) => Number.isInteger(v) && v >= 0 && v < vertices.length)) continue;
    const v1 = vertices[i1] || {};
    const v2 = vertices[i2] || {};
    const v3 = vertices[i3] || {};
    positions.push(
      Number(v1.x || 0), Number(v1.y || 0), Number(v1.z || 0),
      Number(v2.x || 0), Number(v2.y || 0), Number(v2.z || 0),
      Number(v3.x || 0), Number(v3.y || 0), Number(v3.z || 0)
    );
  }
  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

async function parse3mfVolumeCm3(buffer, THREE) {
  const zip = await JSZip.loadAsync(Buffer.from(buffer));
  const modelEntry = Object.values(zip.files).find((file) => !file.dir && /\.model$/i.test(file.name));
  if (!modelEntry) {
    throw new Error("3MF не містить файлу .model");
  }
  const modelXml = await modelEntry.async("string");
  const parsed = await parseStringPromise(modelXml, {
    explicitArray: false,
    mergeAttrs: true,
    tagNameProcessors: [stripPrefix],
    attrNameProcessors: [stripPrefix]
  });
  const model = parsed?.model || parsed?.Model;
  const resources = model?.resources || {};
  const objects = asArray(resources.object);
  if (!objects.length) {
    throw new Error("У 3MF немає об'єктів для аналізу");
  }

  const objectById = new Map();
  objects.forEach((obj) => {
    const id = String(obj?.id || "").trim();
    if (id) objectById.set(id, obj);
  });

  const visitObject = async (objectId, matrix, stack = new Set()) => {
    const id = String(objectId || "").trim();
    if (!id || stack.has(id)) return 0;
    const obj = objectById.get(id);
    if (!obj) return 0;

    const nextStack = new Set(stack);
    nextStack.add(id);
    let total = 0;

    if (obj.mesh) {
      const g = meshGeometryFrom3mf(obj.mesh, THREE);
      if (g) {
        g.applyMatrix4(matrix);
        total += await computeBufferGeometryVolumeCm3(g, THREE);
        g.dispose();
      }
    }

    const components = asArray(obj?.components?.component);
    for (const comp of components) {
      const childId = comp?.objectid || comp?.objectId;
      const childMatrix = matrix.clone().multiply(parse3mfTransform(comp?.transform, THREE));
      total += await visitObject(childId, childMatrix, nextStack);
    }
    return total;
  };

  const buildItems = asArray(model?.build?.item);
  let totalVolume = 0;
  if (buildItems.length) {
    for (const item of buildItems) {
      const itemId = item?.objectid || item?.objectId;
      const itemMatrix = parse3mfTransform(item?.transform, THREE);
      totalVolume += await visitObject(itemId, itemMatrix);
    }
  } else {
    for (const obj of objects) {
      if (!obj?.mesh) continue;
      const id = String(obj?.id || "").trim();
      if (!id) continue;
      totalVolume += await visitObject(id, new THREE.Matrix4());
    }
  }
  return Math.round(totalVolume * 10000) / 10000;
}

/** Multer дає Node.js Buffer; STLLoader/DataView потребують саме ArrayBuffer */
function toArrayBuffer(input) {
  if (input instanceof ArrayBuffer) return input;
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input);
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return ab;
}

async function parseModelVolume(buffer, originalname) {
  const THREE = await import("three");
  const { STLLoader } = await import("three/examples/jsm/loaders/STLLoader.js");
  const { OBJLoader } = await import("three/examples/jsm/loaders/OBJLoader.js");

  const ext = extOf(originalname);
  if (ext === ".stl") {
    const loader = new STLLoader();
    const geometry = loader.parse(toArrayBuffer(buffer));
    const vol = computeBufferGeometryVolumeCm3(geometry, THREE);
    geometry.dispose();
    return vol;
  }
  if (ext === ".obj") {
    const text = Buffer.from(buffer).toString("utf8");
    const obj = new OBJLoader().parse(text);
    obj.updateMatrixWorld(true);
    let total = 0;
    obj.traverse((child) => {
      if (child.isMesh && child.geometry) {
        const g = child.geometry.clone();
        g.applyMatrix4(child.matrixWorld);
        total += computeBufferGeometryVolumeCm3(g, THREE);
        g.dispose();
      }
    });
    obj.traverse((c) => {
      if (c.isMesh && c.geometry) c.geometry.dispose();
    });
    return total;
  }
  if (ext === ".3mf") {
    return parse3mfVolumeCm3(buffer, THREE);
  }
  throw new Error("Підтримуються лише .stl, .obj та .3mf для розрахунку.");
}

module.exports = { parseModelVolume, extOf };
