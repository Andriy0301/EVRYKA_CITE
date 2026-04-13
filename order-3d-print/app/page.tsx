"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ModelUpload, type ModelOptions } from "@/components/ModelUpload";
import { ModelPreview } from "@/components/ModelPreview";
import { PricingResult, type AnalyzeApiResult } from "@/components/PricingResult";
import { RequestForm } from "@/components/RequestForm";

type Mode = "model" | "request";

function extOf(name: string): string {
  const i = name.toLowerCase().lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export default function HomePage() {
  const [mode, setMode] = useState<Mode>("model");
  const [options, setOptions] = useState<ModelOptions>({
    material: "PLA",
    strength: "medium",
    quality: "normal",
  });
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewExt, setPreviewExt] = useState("");
  const [result, setResult] = useState<AnalyzeApiResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordering, setOrdering] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setPreviewExt("");
      setResult(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setPreviewExt(extOf(file.name));
  }, [file]);

  const runAnalyze = useCallback(async () => {
    if (!file) {
      setResult(null);
      return;
    }
    const ext = extOf(file.name);
    if (ext === "3mf") {
      setResult(null);
      setError(null);
      return;
    }
    if (ext !== "stl" && ext !== "obj") {
      setResult(null);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      fd.set("material", options.material);
      fd.set("strength", options.strength);
      fd.set("quality", options.quality);

      const res = await fetch("/api/analyze-model", {
        method: "POST",
        body: fd,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Не вдалося проаналізувати файл");
      }
      setResult({
        volume: data.volume,
        estimatedWeight: data.estimatedWeight,
        printTimeHours: data.printTimeHours,
        price: data.price,
      });
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Помилка");
    } finally {
      setLoading(false);
    }
  }, [file, options.material, options.quality, options.strength]);

  useEffect(() => {
    if (mode !== "model") return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      void runAnalyze();
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [mode, runAnalyze]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  async function onOrder() {
    if (!result) return;
    setOrdering(true);
    try {
      await new Promise((r) => setTimeout(r, 400));
      alert(
        `Замовлення прийнято орієнтовно на ${result.price} грн. Далі підключіть оплату / CRM.`
      );
    } finally {
      setOrdering(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <header className="mb-10 text-center sm:text-left">
        <p className="text-sm font-medium uppercase tracking-wider text-accent">
          3D-друк на замовлення
        </p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Замовити 3D-друк
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          Завантажте модель для автоматичного розрахунку або залиште заявку без
          файлу — ми допоможемо з моделлю.
        </p>
      </header>

      <div className="mb-8 flex flex-wrap justify-center gap-2 sm:justify-start">
        <button
          type="button"
          onClick={() => setMode("model")}
          className={[
            "rounded-full px-5 py-2.5 text-sm font-semibold transition",
            mode === "model"
              ? "bg-accent text-white shadow"
              : "bg-white text-ink ring-1 ring-line hover:bg-stone-50",
          ].join(" ")}
        >
          Є 3D модель
        </button>
        <button
          type="button"
          onClick={() => setMode("request")}
          className={[
            "rounded-full px-5 py-2.5 text-sm font-semibold transition",
            mode === "request"
              ? "bg-accent text-white shadow"
              : "bg-white text-ink ring-1 ring-line hover:bg-stone-50",
          ].join(" ")}
        >
          Немає моделі
        </button>
      </div>

      {mode === "model" ? (
        <div className="grid gap-10 lg:grid-cols-2 lg:items-start">
          <div className="space-y-6">
            <ModelUpload
              options={options}
              onOptionsChange={setOptions}
              onFileChange={setFile}
              disabled={loading}
              error={error}
            />
            {loading ? (
              <div
                className="flex items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-sm text-muted"
                role="status"
              >
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent border-t-transparent" />
                Розрахунок об&apos;єму та вартості…
              </div>
            ) : null}
            <PricingResult
              data={result}
              onOrder={onOrder}
              ordering={ordering}
            />
          </div>
          <div>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              Попередній перегляд
            </h2>
            <ModelPreview url={previewUrl} extension={previewExt} />
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl">
          <RequestForm />
        </div>
      )}

      <footer className="mt-16 border-t border-line pt-8 text-center text-xs text-muted">
        Next.js App Router · розрахунок на сервері (STL/OBJ)
      </footer>
    </main>
  );
}
