"use client";

import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Center, Environment } from "@react-three/drei";
import { Suspense, useLayoutEffect } from "react";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import * as THREE from "three";

function StlMesh({ url }: { url: string }) {
  const geometry = useLoader(STLLoader, url);
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#fb923c"
        metalness={0.08}
        roughness={0.42}
      />
    </mesh>
  );
}

function ObjModel({ url }: { url: string }) {
  const obj = useLoader(OBJLoader, url);
  useLayoutEffect(() => {
    obj.traverse((c) => {
      if (c instanceof THREE.Mesh) {
        c.castShadow = true;
        c.receiveShadow = true;
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        for (const raw of mats) {
          const m = raw as THREE.MeshStandardMaterial;
          if (m && "color" in m) {
            m.color = new THREE.Color("#fdba74");
            m.metalness = 0.05;
            m.roughness = 0.5;
          }
        }
      }
    });
  }, [obj]);
  return <primitive object={obj} />;
}

function Scene({ url, extension }: { url: string; extension: string }) {
  const ext = extension.toLowerCase();
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[8, 12, 6]}
        intensity={1.1}
        castShadow
        shadow-mapSize={[1024, 1024]}
      />
      <Suspense fallback={null}>
        <Center>
          {ext === "stl" ? <StlMesh url={url} /> : null}
          {ext === "obj" ? <ObjModel url={url} /> : null}
        </Center>
      </Suspense>
      <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
      <Environment preset="city" />
    </>
  );
}

type Props = {
  url: string | null;
  extension: string;
};

export function ModelPreview({ url, extension }: Props) {
  const ext = extension.toLowerCase();

  if (!url) {
    return (
      <div className="flex h-[min(420px,55vh)] w-full items-center justify-center rounded-2xl border border-line bg-stone-50 text-sm text-muted">
        Завантажте модель для попереднього перегляду
      </div>
    );
  }

  if (ext === "3mf") {
    return (
      <div className="flex h-[min(420px,55vh)] w-full items-center justify-center rounded-2xl border border-line bg-amber-50/80 px-4 text-center text-sm text-amber-900">
        Перегляд 3MF у браузері не підключено. Конвертуйте у STL/OBJ або
        надішліть файл через форму «Немає моделі».
      </div>
    );
  }

  if (ext !== "stl" && ext !== "obj") {
    return (
      <div className="flex h-[min(420px,55vh)] w-full items-center justify-center rounded-2xl border border-line bg-stone-50 text-sm text-muted">
        Непідтримуваний формат для перегляду
      </div>
    );
  }

  return (
    <div className="h-[min(420px,55vh)] w-full overflow-hidden rounded-2xl border border-line bg-stone-100 shadow-inner">
      <Canvas
        shadows
        camera={{ position: [0, 0, 120], fov: 45, near: 0.1, far: 1000 }}
        gl={{ antialias: true }}
      >
        <Scene url={url} extension={ext} />
      </Canvas>
      <p className="px-3 py-2 text-center text-xs text-muted">
        Обертання: затисніть ЛКМ і рухайте мишею
      </p>
    </div>
  );
}
