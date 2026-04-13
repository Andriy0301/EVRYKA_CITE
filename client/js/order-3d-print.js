/**
 * Замовити 3D-друк — клієнт для /api/print3d/*
 * Three.js з jsDelivr (ESM).
 */

const THREE_BASE = "https://cdn.jsdelivr.net/npm/three@0.170.0";
const API_ANALYZE = "/api/print3d/analyze-model";
const API_REQUEST = "/api/print3d/request";
const MAX_BYTES = 50 * 1024 * 1024;
const DEBOUNCE_MS = 400;

let threeMods = null;
async function loadThreeMods() {
  if (threeMods) return threeMods;
  const THREE = await import(`${THREE_BASE}/build/three.module.js`);
  const { STLLoader } = await import(
    `${THREE_BASE}/examples/jsm/loaders/STLLoader.js`
  );
  const { OBJLoader } = await import(
    `${THREE_BASE}/examples/jsm/loaders/OBJLoader.js`
  );
  const { OrbitControls } = await import(
    `${THREE_BASE}/examples/jsm/controls/OrbitControls.js`
  );
  threeMods = { THREE, STLLoader, OBJLoader, OrbitControls };
  return threeMods;
}

function extOf(name) {
  const n = String(name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : "";
}

/* ——— прев’ю ——— */
let preview = {
  renderer: null,
  scene: null,
  camera: null,
  controls: null,
  mesh: null,
  root: null,
  raf: 0,
  host: null,
  onResize: null
};

function stopPreviewLoop() {
  if (preview.raf) {
    cancelAnimationFrame(preview.raf);
    preview.raf = 0;
  }
}

function disposePreview() {
  stopPreviewLoop();
  if (preview.onResize) {
    window.removeEventListener("resize", preview.onResize);
    preview.onResize = null;
  }
  if (preview.controls) {
    preview.controls.dispose();
    preview.controls = null;
  }
  if (preview.mesh) {
    preview.scene.remove(preview.mesh);
    if (preview.mesh.geometry) preview.mesh.geometry.dispose();
    const m = preview.mesh.material;
    if (m && !Array.isArray(m)) m.dispose();
    preview.mesh = null;
  }
  if (preview.root) {
    preview.scene.remove(preview.root);
    preview.root.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        mats.forEach((x) => x.dispose && x.dispose());
      }
    });
    preview.root = null;
  }
  if (preview.renderer) {
    preview.renderer.dispose();
    if (preview.host && preview.renderer.domElement.parentNode === preview.host) {
      preview.host.removeChild(preview.renderer.domElement);
    }
    preview.renderer = null;
  }
  preview.scene = null;
  preview.camera = null;
  preview.host = null;
}

function fitCameraToObject(THREE, camera, controls, object) {
  const box = new THREE.Box3().setFromObject(object);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius, 1);
  const dist = r * 2.8;
  camera.near = Math.max(dist / 1000, 0.01);
  camera.far = dist * 10;
  camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
  camera.lookAt(sphere.center);
  controls.target.copy(sphere.center);
  controls.update();
}

async function runPreview(host, file) {
  disposePreview();
  if (!file || !host) return;
  const ext = extOf(file.name);
  if (ext !== "stl" && ext !== "obj") {
    host.innerHTML =
      '<p style="padding:24px;text-align:center;color:#57534e;font-size:14px;">Перегляд для STL та OBJ. Для 3MF завантажте файл у формі «Немає моделі».</p>';
    return;
  }

  host.innerHTML = "";
  const { THREE, STLLoader, OBJLoader, OrbitControls } = await loadThreeMods();

  const rect = host.getBoundingClientRect();
  const w = Math.max(rect.width, 280);
  const h = Math.max(rect.height, 280);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf5f5f4);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  host.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dir = new THREE.DirectionalLight(0xffffff, 1);
  dir.position.set(8, 12, 6);
  scene.add(dir);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const url = URL.createObjectURL(file);

  try {
    if (ext === "stl") {
      const geom = await new Promise((resolve, reject) => {
        const loader = new STLLoader();
        loader.load(url, resolve, undefined, reject);
      });
      const mat = new THREE.MeshStandardMaterial({
        color: 0xfb923c,
        metalness: 0.08,
        roughness: 0.42
      });
      const mesh = new THREE.Mesh(geom, mat);
      scene.add(mesh);
      preview.mesh = mesh;
      fitCameraToObject(THREE, camera, controls, mesh);
    } else {
      const obj = await new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(url, resolve, undefined, reject);
      });
      obj.traverse((c) => {
        if (c.isMesh) {
          c.material = new THREE.MeshStandardMaterial({
            color: 0xfdba74,
            metalness: 0.05,
            roughness: 0.5
          });
        }
      });
      scene.add(obj);
      preview.root = obj;
      fitCameraToObject(THREE, camera, controls, obj);
    }
  } catch (e) {
    console.error(e);
    host.innerHTML =
      '<p style="padding:24px;color:#b91c1c;font-size:14px;">Не вдалося показати модель.</p>';
    URL.revokeObjectURL(url);
    renderer.dispose();
    return;
  }

  URL.revokeObjectURL(url);

  preview.renderer = renderer;
  preview.scene = scene;
  preview.camera = camera;
  preview.controls = controls;
  preview.host = host;

  function tick() {
    preview.raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  }
  tick();

  preview.onResize = () => {
    if (!preview.renderer || !preview.host) return;
    const r2 = preview.host.getBoundingClientRect();
    const w2 = Math.max(r2.width, 280);
    const h2 = Math.max(r2.height, 280);
    preview.camera.aspect = w2 / h2;
    preview.camera.updateProjectionMatrix();
    preview.renderer.setSize(w2, h2);
  };
  window.addEventListener("resize", preview.onResize);
}

/* ——— аналіз ——— */
let currentFile = null;
let debounceTimer = null;

function setErr(el, msg) {
  if (!el) return;
  el.textContent = msg || "";
  el.hidden = !msg;
}

async function analyze(elLoader, elErr, elResult, opts) {
  if (!currentFile) {
    elResult.hidden = true;
    return;
  }
  const ext = extOf(currentFile.name);
  if (ext === "3mf") {
    elResult.hidden = true;
    setErr(elErr, "Для автоматичного розрахунку завантажте STL або OBJ.");
    return;
  }
  if (ext !== "stl" && ext !== "obj") {
    elResult.hidden = true;
    setErr(elErr, "Непідтримуваний формат.");
    return;
  }

  setErr(elErr, "");
  elLoader.classList.add("is-visible");
  try {
    const fd = new FormData();
    fd.set("file", currentFile);
    fd.set("material", opts.material);
    fd.set("strength", opts.strength);
    fd.set("quality", opts.quality);

    const res = await fetch(API_ANALYZE, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Помилка сервера");

    elResult.hidden = false;
    elResult.querySelector("[data-print3d-volume]").textContent =
      String(data.volume) + " см³";
    elResult.querySelector("[data-print3d-weight]").textContent =
      String(data.estimatedWeight) + " г";
    elResult.querySelector("[data-print3d-time]").textContent =
      String(data.printTimeHours) + " год";
    elResult.querySelector("[data-print3d-price]").textContent =
      String(data.price) + " грн";
  } catch (e) {
    elResult.hidden = true;
    setErr(elErr, e instanceof Error ? e.message : "Помилка");
  } finally {
    elLoader.classList.remove("is-visible");
  }
}

function scheduleAnalyze(els, opts) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    analyze(els.loader, els.err, els.result, opts);
  }, DEBOUNCE_MS);
}

function initModelMode(els) {
  const opts = () => ({
    material: els.selMaterial.value,
    strength: els.selStrength.value,
    quality: els.selQuality.value
  });

  const onFile = (file) => {
    setErr(els.err, "");
    if (!file) {
      currentFile = null;
      els.result.hidden = true;
      disposePreview();
      els.canvasHost.innerHTML =
        '<p style="padding:24px;text-align:center;color:#78716c;font-size:14px;">Завантажте модель</p>';
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr(els.err, "Файл завеликий (максимум 50 МБ).");
      return;
    }
    currentFile = file;
    void runPreview(els.canvasHost, file);
    scheduleAnalyze(els, opts());
  };

  els.drop.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", () => {
    const f = els.fileInput.files && els.fileInput.files[0];
    onFile(f || null);
  });

  ["dragenter", "dragover"].forEach((ev) => {
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("is-drag");
    });
  });
  els.drop.addEventListener("dragleave", () =>
    els.drop.classList.remove("is-drag")
  );
  els.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    els.drop.classList.remove("is-drag");
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) onFile(f);
  });

  ["material", "strength", "quality"].forEach((k) => {
    const el =
      k === "material"
        ? els.selMaterial
        : k === "strength"
          ? els.selStrength
          : els.selQuality;
    el.addEventListener("change", () => {
      if (currentFile) scheduleAnalyze(els, opts());
    });
  });

  els.btnOrder.addEventListener("click", () => {
    const price = els.result.querySelector("[data-print3d-price]")?.textContent;
    alert(
      price
        ? `Заявку прийнято (орієнтовно ${price}). Ми зв'яжемося з вами.`
        : "Спочатку дочекайтесь розрахунку."
    );
  });
}

function initRequestForm(form, statusEl) {
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    statusEl.hidden = true;
    statusEl.classList.remove("is-ok", "is-err");
    const fd = new FormData(form);
    const att = fd.get("attachment");
    if (att instanceof File && att.size > MAX_BYTES) {
      statusEl.hidden = false;
      statusEl.classList.add("is-err");
      statusEl.textContent = "Файл завеликий (максимум 50 МБ).";
      return;
    }
    try {
      const res = await fetch(API_REQUEST, { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Помилка");
      statusEl.hidden = false;
      statusEl.classList.add("is-ok");
      statusEl.textContent = "Запит надіслано. Дякуємо!";
      form.reset();
    } catch (err) {
      statusEl.hidden = false;
      statusEl.classList.add("is-err");
      statusEl.textContent =
        err instanceof Error ? err.message : "Не вдалося надіслати";
    }
  });
}

function init() {
  const tabModel = document.getElementById("print3dTabModel");
  const tabRequest = document.getElementById("print3dTabRequest");
  const panelModel = document.getElementById("print3dPanelModel");
  const panelRequest = document.getElementById("print3dPanelRequest");

  tabModel.addEventListener("click", () => {
    tabModel.classList.add("is-active");
    tabRequest.classList.remove("is-active");
    panelModel.hidden = false;
    panelRequest.hidden = true;
    preview.onResize && preview.onResize();
  });
  tabRequest.addEventListener("click", () => {
    tabRequest.classList.add("is-active");
    tabModel.classList.remove("is-active");
    panelRequest.hidden = false;
    panelModel.hidden = true;
  });

  const els = {
    drop: document.getElementById("print3dDrop"),
    fileInput: document.getElementById("print3dFile"),
    selMaterial: document.getElementById("print3dMaterial"),
    selStrength: document.getElementById("print3dStrength"),
    selQuality: document.getElementById("print3dQuality"),
    loader: document.getElementById("print3dLoader"),
    err: document.getElementById("print3dErr"),
    result: document.getElementById("print3dResult"),
    canvasHost: document.getElementById("print3dCanvasHost"),
    btnOrder: document.getElementById("print3dBtnOrder")
  };

  els.canvasHost.innerHTML =
    '<p style="padding:24px;text-align:center;color:#78716c;font-size:14px;">Завантажте модель</p>';
  initModelMode(els);

  initRequestForm(
    document.getElementById("print3dRequestForm"),
    document.getElementById("print3dRequestStatus")
  );
}

init();
