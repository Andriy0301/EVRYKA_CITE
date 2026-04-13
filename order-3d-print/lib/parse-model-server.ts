import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { computeBufferGeometryVolumeCm3 } from "./compute-volume";

export type ParsedModelKind = "stl" | "obj";

export type ParsedModel = {
  kind: ParsedModelKind;
  volumeCm3: number;
};

const EXT: Record<string, ParsedModelKind | undefined> = {
  ".stl": "stl",
  ".obj": "obj",
};

export function extensionFromName(name: string): string {
  const lower = name.toLowerCase();
  const dot = lower.lastIndexOf(".");
  return dot >= 0 ? lower.slice(dot) : "";
}

export function supportedServerExtension(ext: string): ParsedModelKind | null {
  return EXT[ext] ?? null;
}

export async function parseModelBuffer(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParsedModel> {
  const ext = extensionFromName(filename);
  const kind = supportedServerExtension(ext);
  if (!kind) {
    throw new Error("Підтримуються лише STL та OBJ для розрахунку на сервері.");
  }

  if (kind === "stl") {
    const loader = new STLLoader();
    const geometry = loader.parse(buffer);
    const volumeCm3 = computeBufferGeometryVolumeCm3(geometry);
    geometry.dispose();
    return { kind: "stl", volumeCm3 };
  }

  const text = new TextDecoder("utf-8").decode(buffer);
  const obj = new OBJLoader().parse(text);
  obj.updateMatrixWorld(true);
  let volumeCm3 = 0;
  obj.traverse((child) => {
    if (child instanceof THREE.Mesh && child.geometry) {
      const g = child.geometry.clone();
      g.applyMatrix4(child.matrixWorld);
      volumeCm3 += computeBufferGeometryVolumeCm3(g);
      g.dispose();
    }
  });
  obj.traverse((c) => {
    if (c instanceof THREE.Mesh) c.geometry?.dispose();
  });
  return { kind: "obj", volumeCm3 };
}
