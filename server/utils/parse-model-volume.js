/**
 * Об'єм сітки в см³ (координати в мм → мм³ / 1000 = см³).
 * Динамічний імпорт three (ESM) з CommonJS роуту.
 */

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
  throw new Error("Підтримуються лише .stl та .obj для розрахунку.");
}

module.exports = { parseModelVolume, extOf };
