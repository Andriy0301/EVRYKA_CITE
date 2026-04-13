"use client";

import { useCallback, useId, useState } from "react";
import type { Material, Quality, Strength } from "@/lib/pricing";

const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPT = ".stl,.obj,.3mf,model/stl,model/obj";

export type ModelOptions = {
  material: Material;
  strength: Strength;
  quality: Quality;
};

type Props = {
  options: ModelOptions;
  onOptionsChange: (o: ModelOptions) => void;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
  error?: string | null;
};

function extOf(name: string): string {
  const i = name.toLowerCase().lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

export function ModelUpload({
  options,
  onOptionsChange,
  onFileChange,
  disabled,
  error,
}: Props) {
  const id = useId();
  const [dragOver, setDragOver] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const validateAndSet = useCallback(
    (file: File | null) => {
      setLocalError(null);
      if (!file) {
        setFileName(null);
        onFileChange(null);
        return;
      }
      if (file.size > MAX_BYTES) {
        setLocalError("Файл завеликий (максимум 50 МБ)");
        return;
      }
      const ext = extOf(file.name);
      if (!["stl", "obj", "3mf"].includes(ext)) {
        setLocalError("Дозволені формати: STL, OBJ, 3MF");
        return;
      }
      setFileName(file.name);
      onFileChange(file);
    },
    [onFileChange]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      const f = e.dataTransfer.files?.[0];
      if (f) validateAndSet(f);
    },
    [disabled, validateAndSet]
  );

  return (
    <div className="space-y-6">
      <div
        role="button"
        tabIndex={0}
        onDragEnter={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={[
          "relative rounded-2xl border-2 border-dashed px-6 py-14 text-center transition-colors",
          dragOver ? "border-accent bg-orange-50" : "border-line bg-white",
          disabled ? "pointer-events-none opacity-60" : "cursor-pointer hover:border-stone-400",
        ].join(" ")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            document.getElementById(id)?.click();
          }
        }}
        onClick={() => !disabled && document.getElementById(id)?.click()}
      >
        <input
          id={id}
          type="file"
          accept={ACCEPT}
          className="sr-only"
          disabled={disabled}
          onChange={(e) => validateAndSet(e.target.files?.[0] ?? null)}
        />
        <p className="text-lg font-semibold text-ink">
          Перетягніть STL / OBJ / 3MF сюди
        </p>
        <p className="mt-2 text-sm text-muted">
          або натисніть, щоб обрати файл · до 50 МБ
        </p>
        {fileName ? (
          <p className="mt-4 text-sm font-medium text-accent">{fileName}</p>
        ) : null}
      </div>

      {(error || localError) && (
        <p className="text-sm text-red-600" role="alert">
          {localError || error}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Матеріал
          <select
            className="rounded-xl border border-line bg-white px-3 py-2.5 font-normal text-ink shadow-sm outline-none ring-accent focus:ring-2"
            value={options.material}
            disabled={disabled}
            onChange={(e) =>
              onOptionsChange({
                ...options,
                material: e.target.value as Material,
              })
            }
          >
            <option value="PLA">PLA</option>
            <option value="PETG">PETG</option>
            <option value="ABS">ABS</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Міцність (infill)
          <select
            className="rounded-xl border border-line bg-white px-3 py-2.5 font-normal text-ink shadow-sm outline-none ring-accent focus:ring-2"
            value={options.strength}
            disabled={disabled}
            onChange={(e) =>
              onOptionsChange({
                ...options,
                strength: e.target.value as Strength,
              })
            }
          >
            <option value="low">Low (15%)</option>
            <option value="medium">Medium (25%)</option>
            <option value="high">High (50%)</option>
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Якість друку
          <select
            className="rounded-xl border border-line bg-white px-3 py-2.5 font-normal text-ink shadow-sm outline-none ring-accent focus:ring-2"
            value={options.quality}
            disabled={disabled}
            onChange={(e) =>
              onOptionsChange({
                ...options,
                quality: e.target.value as Quality,
              })
            }
          >
            <option value="draft">Draft</option>
            <option value="normal">Normal</option>
            <option value="fine">Fine</option>
          </select>
        </label>
      </div>

      <p className="text-xs text-muted">
        Авторозрахунок об&apos;єму та ціни підтримується для{" "}
        <strong>STL</strong> та <strong>OBJ</strong>. Для <strong>3MF</strong>{" "}
        скористайтесь формою «Немає моделі» або конвертуйте у STL.
      </p>
    </div>
  );
}
