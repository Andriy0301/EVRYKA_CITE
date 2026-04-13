import * as THREE from "three";

/**
 * Об'єм замкненої трикутної сітки (см³), якщо одиниця вершин — см.
 * У Three одиниці умовні; ми трактуємо їх як мм і ділимо на 1000 для см³.
 */
export function computeBufferGeometryVolumeCm3(geometry: THREE.BufferGeometry): number {
  geometry.computeVertexNormals();
  const position = geometry.getAttribute("position");
  if (!position || position.count < 3) return 0;

  let volumeMm3 = 0;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();

  if (geometry.index) {
    const idx = geometry.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i]!;
      const b = idx[i + 1]!;
      const c = idx[i + 2]!;
      v0.fromBufferAttribute(position, a);
      v1.fromBufferAttribute(position, b);
      v2.fromBufferAttribute(position, c);
      volumeMm3 += signedTetraVolume(v0, v1, v2);
    }
  } else {
    for (let i = 0; i < position.count; i += 3) {
      v0.fromBufferAttribute(position, i);
      v1.fromBufferAttribute(position, i + 1);
      v2.fromBufferAttribute(position, i + 2);
      volumeMm3 += signedTetraVolume(v0, v1, v2);
    }
  }

  const volumeCm3 = Math.abs(volumeMm3) / 1000;
  return Math.round(volumeCm3 * 10000) / 10000;
}

function signedTetraVolume(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3
): number {
  return v0.dot(v1.clone().cross(v2)) / 6;
}
