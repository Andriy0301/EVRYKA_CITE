/**
 * Замовити 3D-друк — мультизавантаження моделей з окремим прев'ю та ціною.
 */

const THREE_BASE = "https://esm.sh/three@0.170.0";
const API_ANALYZE = "/api/print3d/analyze-model";
const API_REQUEST = "/api/print3d/request";
const MAX_BYTES = 50 * 1024 * 1024;
const DEBOUNCE_MS = 400;

let threeMods = null;
let debounceTimer = null;
let modelSeq = 1;
const modelItems = [];

async function loadThreeMods() {
  if (threeMods) return threeMods;
  const THREE = await import(THREE_BASE);
  const { STLLoader } = await import(`${THREE_BASE}/examples/jsm/loaders/STLLoader.js`);
  const { OBJLoader } = await import(`${THREE_BASE}/examples/jsm/loaders/OBJLoader.js`);
  const { OrbitControls } = await import(`${THREE_BASE}/examples/jsm/controls/OrbitControls.js`);
  threeMods = { THREE, STLLoader, OBJLoader, OrbitControls };
  return threeMods;
}

function extOf(name) {
  const n = String(name || "").toLowerCase();
  const i = n.lastIndexOf(".");
  return i >= 0 ? n.slice(i + 1) : "";
}

function formatMoney(value) {
  return `${Number(value || 0).toFixed(2)} грн`;
}

function formatNum(value, unit) {
  return `${Number(value || 0).toFixed(2)} ${unit}`;
}

function currentOptions(els) {
  return {
    material: els.selMaterial.value,
    strength: els.selStrength.value,
    quality: els.selQuality.value
  };
}

function setGlobalErr(els, message) {
  els.err.textContent = message || "";
  els.err.hidden = !message;
}

function createCardElement(item) {
  const card = document.createElement("article");
  card.className = "print3d-model-card";

  const head = document.createElement("div");
  head.className = "print3d-model-head";

  const title = document.createElement("div");
  title.className = "print3d-model-title";
  title.textContent = item.file.name;

  const removeBtn = document.createElement("button");
  removeBtn.type = "button";
  removeBtn.className = "print3d-model-remove";
  removeBtn.textContent = "Видалити";

  const colorWrap = document.createElement("label");
  colorWrap.className = "print3d-model-color";
  colorWrap.textContent = "Колір";
  const colorInput = document.createElement("input");
  colorInput.type = "color";
  colorInput.value = item.color;
  colorInput.setAttribute("aria-label", `Колір моделі ${item.file.name}`);
  colorWrap.appendChild(colorInput);

  const headRight = document.createElement("div");
  headRight.style.display = "inline-flex";
  headRight.style.alignItems = "center";
  headRight.style.gap = "8px";
  headRight.append(colorWrap, removeBtn);

  head.append(title, headRight);

  const body = document.createElement("div");
  body.className = "print3d-model-body";

  const previewWrap = document.createElement("div");
  const canvasHost = document.createElement("div");
  canvasHost.className = "print3d-canvas-wrap print3d-canvas-wrap--card";
  canvasHost.innerHTML = "<p class=\"print3d-canvas-empty\">Завантаження прев'ю...</p>";
  const hint = document.createElement("p");
  hint.className = "print3d-canvas-hint";
  hint.textContent = "Обертання: затисніть ЛКМ і рухайте";
  previewWrap.append(canvasHost, hint);

  const info = document.createElement("div");
  info.className = "print3d-model-info";

  const status = document.createElement("div");
  status.className = "print3d-card-status";

  const err = document.createElement("div");
  err.className = "print3d-card-err";
  err.hidden = true;

  const stats = document.createElement("div");
  stats.className = "print3d-result-grid print3d-result-grid--card";
  stats.innerHTML = `
    <div class="print3d-result-item"><strong>Об'єм</strong><span class="print3d-val" data-k="volume">—</span></div>
    <div class="print3d-result-item"><strong>Вага</strong><span class="print3d-val" data-k="weight">—</span></div>
    <div class="print3d-result-item"><strong>Час</strong><span class="print3d-val" data-k="time">—</span></div>
    <div class="print3d-result-item print3d-result-item--price"><strong>Ціна</strong><span class="print3d-val" data-k="price">—</span></div>
  `;

  info.append(status, err, stats);
  body.append(previewWrap, info);
  card.append(head, body);

  return {
    card,
    removeBtn,
    canvasHost,
    status,
    err,
    colorInput,
    cells: {
      volume: stats.querySelector('[data-k="volume"]'),
      weight: stats.querySelector('[data-k="weight"]'),
      time: stats.querySelector('[data-k="time"]'),
      price: stats.querySelector('[data-k="price"]')
    }
  };
}

function applyColorToObject(THREE, object, colorHex) {
  const color = new THREE.Color(colorHex || "#f9b262");
  object.traverse?.((c) => {
    if (!c.isMesh) return;
    const mats = Array.isArray(c.material) ? c.material : [c.material];
    mats.forEach((m) => {
      if (m && "color" in m) m.color.copy(color);
    });
  });
  if (object.isMesh && object.material) {
    const mats = Array.isArray(object.material) ? object.material : [object.material];
    mats.forEach((m) => {
      if (m && "color" in m) m.color.copy(color);
    });
  }
}

function updateCard(item) {
  const ui = item.ui;
  if (!ui) return;

  if (item.loading) {
    ui.status.textContent = "Розрахунок...";
  } else if (item.error) {
    ui.status.textContent = "";
  } else if (item.analysis) {
    ui.status.textContent = "Розраховано";
  } else {
    ui.status.textContent = "";
  }

  if (item.error) {
    ui.err.hidden = false;
    ui.err.textContent = item.error;
  } else {
    ui.err.hidden = true;
    ui.err.textContent = "";
  }

  if (!item.analysis) {
    ui.cells.volume.textContent = "—";
    ui.cells.weight.textContent = "—";
    ui.cells.time.textContent = "—";
    ui.cells.price.textContent = "—";
    return;
  }

  ui.cells.volume.textContent = formatNum(item.analysis.volume, "см³");
  ui.cells.weight.textContent = formatNum(item.analysis.estimatedWeight, "г");
  ui.cells.time.textContent = formatNum(item.analysis.printTimeHours, "год");
  ui.cells.price.textContent = formatMoney(item.analysis.price);
}

function updateSummary(els) {
  const valid = modelItems.filter((x) => x.analysis && !x.error);
  if (!valid.length) {
    els.totalBox.hidden = true;
    els.totalRows.innerHTML = "";
    els.totalPrice.textContent = "0 грн";
    return;
  }

  let sum = 0;
  els.totalRows.innerHTML = "";
  valid.forEach((item) => {
    sum += Number(item.analysis.price || 0);
    const row = document.createElement("div");
    row.className = "print3d-total-row";
    const left = document.createElement("span");
    left.className = "print3d-total-row-left";
    const dot = document.createElement("i");
    dot.className = "print3d-color-dot";
    dot.style.background = item.color || "#f9b262";
    const name = document.createElement("span");
    name.textContent = item.file.name;
    left.append(dot, name);
    const price = document.createElement("span");
    price.textContent = formatMoney(item.analysis.price);
    row.append(left, price);
    els.totalRows.appendChild(row);
  });

  els.totalPrice.textContent = formatMoney(sum);
  els.totalBox.hidden = false;
}

function normalizeAndFit(THREE, object, camera, controls) {
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;
  const target = 80;
  const scale = target / maxDim;
  object.scale.setScalar(scale);

  const box2 = new THREE.Box3().setFromObject(object);
  const center = box2.getCenter(new THREE.Vector3());
  object.position.sub(center);

  const sphere = box2.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 10);
  const dist = radius * 2.6;

  camera.near = Math.max(dist / 1000, 0.01);
  camera.far = dist * 20;
  camera.position.set(0, 0, dist);
  camera.lookAt(0, 0, 0);
  controls.target.set(0, 0, 0);
  controls.update();
}

async function mountPreview(item) {
  const host = item.ui.canvasHost;
  const ext = extOf(item.file.name);

  if (ext !== "stl" && ext !== "obj") {
    host.innerHTML = '<p class="print3d-canvas-empty">Перегляд доступний для STL/OBJ</p>';
    return;
  }

  const { THREE, STLLoader, OBJLoader, OrbitControls } = await loadThreeMods();
  host.innerHTML = "";

  const rect = host.getBoundingClientRect();
  const w = Math.max(rect.width, 260);
  const h = Math.max(rect.height, 240);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xfcfaf7);

  const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  host.appendChild(renderer.domElement);

  scene.add(new THREE.HemisphereLight(0xffffff, 0xfff1dc, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.15);
  key.position.set(50, 70, 80);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff6ea, 0.8);
  fill.position.set(-40, 28, -30);
  scene.add(fill);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;

  const fileUrl = URL.createObjectURL(item.file);
  let object = null;

  try {
    if (ext === "stl") {
      const geometry = await new Promise((resolve, reject) => {
        const loader = new STLLoader();
        loader.load(fileUrl, resolve, undefined, reject);
      });
      const material = new THREE.MeshStandardMaterial({
        color: item.color || 0xf9b262,
        metalness: 0.04,
        roughness: 0.38
      });
      object = new THREE.Mesh(geometry, material);
    } else {
      object = await new Promise((resolve, reject) => {
        const loader = new OBJLoader();
        loader.load(fileUrl, resolve, undefined, reject);
      });
      object.traverse((c) => {
        if (c.isMesh) {
          c.material = new THREE.MeshStandardMaterial({
            color: item.color || 0xfbd3a1,
            metalness: 0.05,
            roughness: 0.42
          });
        }
      });
    }
  } catch (e) {
    console.error("[preview]", e);
    host.innerHTML = '<p class="print3d-canvas-empty">Не вдалося показати модель</p>';
    URL.revokeObjectURL(fileUrl);
    renderer.dispose();
    return;
  }

  URL.revokeObjectURL(fileUrl);
  scene.add(object);
  applyColorToObject(THREE, object, item.color);
  item.applyPreviewColor = (hex) => applyColorToObject(THREE, object, hex);
  normalizeAndFit(THREE, object, camera, controls);

  let raf = 0;
  const tick = () => {
    raf = requestAnimationFrame(tick);
    controls.update();
    renderer.render(scene, camera);
  };
  tick();

  const onResize = () => {
    const r = host.getBoundingClientRect();
    const nw = Math.max(r.width, 260);
    const nh = Math.max(r.height, 240);
    camera.aspect = nw / nh;
    camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  };
  window.addEventListener("resize", onResize);

  item.disposePreview = () => {
    cancelAnimationFrame(raf);
    window.removeEventListener("resize", onResize);
    controls.dispose();
    scene.remove(object);
    object.traverse?.((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        const mats = Array.isArray(c.material) ? c.material : [c.material];
        mats.forEach((m) => m.dispose && m.dispose());
      }
    });
    if (object.geometry) object.geometry.dispose();
    if (object.material) {
      const mats = Array.isArray(object.material) ? object.material : [object.material];
      mats.forEach((m) => m.dispose && m.dispose());
    }
    renderer.dispose();
    if (renderer.domElement.parentNode === host) host.removeChild(renderer.domElement);
  };
}

async function analyzeItem(item, els) {
  const ext = extOf(item.file.name);
  if (ext === "3mf") {
    item.loading = false;
    item.analysis = null;
    item.error = "3MF не підтримується для авто-розрахунку. Використайте STL/OBJ.";
    updateCard(item);
    updateSummary(els);
    return;
  }

  item.loading = true;
  item.error = "";
  updateCard(item);

  try {
    const fd = new FormData();
    fd.set("file", item.file);
    const opts = currentOptions(els);
    fd.set("material", opts.material);
    fd.set("strength", opts.strength);
    fd.set("quality", opts.quality);

    const res = await fetch(API_ANALYZE, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Помилка сервера");
    item.analysis = data;
    item.error = "";
  } catch (e) {
    item.analysis = null;
    item.error = e instanceof Error ? e.message : "Помилка розрахунку";
  } finally {
    item.loading = false;
    updateCard(item);
    updateSummary(els);
  }
}

function scheduleReanalyzeAll(els) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    modelItems.forEach((item) => {
      void analyzeItem(item, els);
    });
  }, DEBOUNCE_MS);
}

function removeItem(id, els) {
  const idx = modelItems.findIndex((x) => x.id === id);
  if (idx === -1) return;
  const item = modelItems[idx];
  if (item.disposePreview) item.disposePreview();
  if (item.ui?.card?.parentNode) item.ui.card.parentNode.removeChild(item.ui.card);
  modelItems.splice(idx, 1);
  updateSummary(els);
}

function addFiles(files, els) {
  const all = Array.from(files || []);
  if (!all.length) return;

  const errors = [];
  all.forEach((file) => {
    if (file.size > MAX_BYTES) {
      errors.push(`${file.name}: більше 50 МБ`);
      return;
    }

    const item = {
      id: `m${Date.now()}_${modelSeq++}`,
      file,
      loading: false,
      error: "",
      analysis: null,
      color: els.orderColor.value || "#f9b262",
      customColor: false,
      disposePreview: null,
      applyPreviewColor: null,
      ui: null
    };

    item.ui = createCardElement(item);
    item.ui.removeBtn.addEventListener("click", () => removeItem(item.id, els));
    item.ui.colorInput.addEventListener("input", () => {
      item.color = item.ui.colorInput.value;
      item.customColor = true;
      if (item.applyPreviewColor) item.applyPreviewColor(item.color);
      updateSummary(els);
    });
    els.modelsGrid.appendChild(item.ui.card);
    modelItems.push(item);

    void mountPreview(item).catch((e) => {
      console.error("[mountPreview]", e);
      item.ui.canvasHost.innerHTML = "<p class=\"print3d-canvas-empty\">Не вдалося завантажити прев'ю</p>";
    });
    void analyzeItem(item, els);
  });

  if (errors.length) {
    setGlobalErr(els, errors.join("; "));
  } else {
    setGlobalErr(els, "");
  }
}

function initModelMode(els) {
  els.drop.addEventListener("click", () => els.fileInput.click());
  els.drop.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      els.fileInput.click();
    }
  });

  els.fileInput.addEventListener("change", () => {
    addFiles(els.fileInput.files, els);
    els.fileInput.value = "";
  });

  ["dragenter", "dragover"].forEach((ev) => {
    els.drop.addEventListener(ev, (e) => {
      e.preventDefault();
      els.drop.classList.add("is-drag");
    });
  });
  els.drop.addEventListener("dragleave", () => els.drop.classList.remove("is-drag"));
  els.drop.addEventListener("drop", (e) => {
    e.preventDefault();
    els.drop.classList.remove("is-drag");
    addFiles(e.dataTransfer.files, els);
  });

  [els.selMaterial, els.selStrength, els.selQuality].forEach((control) => {
    control.addEventListener("change", () => scheduleReanalyzeAll(els));
  });

  els.orderColor.addEventListener("input", () => {
    const orderColor = els.orderColor.value;
    modelItems.forEach((item) => {
      if (item.customColor) return;
      item.color = orderColor;
      if (item.ui?.colorInput) item.ui.colorInput.value = orderColor;
      if (item.applyPreviewColor) item.applyPreviewColor(orderColor);
    });
    updateSummary(els);
  });

  els.btnOrder.addEventListener("click", () => {
    const valid = modelItems.filter((x) => x.analysis && !x.error);
    const total = valid.reduce((sum, x) => sum + Number(x.analysis.price || 0), 0);
    if (!valid.length) {
      alert("Спочатку додайте STL/OBJ і дочекайтесь розрахунку.");
      return;
    }
    alert(
      `Заявку прийнято: ${valid.length} моделей, сума ${formatMoney(total)}. Колір замовлення: ${els.orderColor.value}`
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
      statusEl.textContent = err instanceof Error ? err.message : "Не вдалося надіслати";
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
    orderColor: document.getElementById("print3dOrderColor"),
    err: document.getElementById("print3dErr"),
    modelsGrid: document.getElementById("print3dModelsGrid"),
    totalBox: document.getElementById("print3dTotalBox"),
    totalRows: document.getElementById("print3dTotalRows"),
    totalPrice: document.getElementById("print3dTotalPrice"),
    btnOrder: document.getElementById("print3dBtnOrder")
  };

  initModelMode(els);
  initRequestForm(
    document.getElementById("print3dRequestForm"),
    document.getElementById("print3dRequestStatus")
  );
}

init();
