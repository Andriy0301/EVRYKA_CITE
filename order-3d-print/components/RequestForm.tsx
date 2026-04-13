"use client";

import { useId, useState } from "react";

const MAX_BYTES = 50 * 1024 * 1024;

export function RequestForm() {
  const id = useId();
  const [status, setStatus] = useState<"idle" | "loading" | "ok" | "err">(
    "idle"
  );
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");
    setMessage(null);
    const form = e.currentTarget;
    const fd = new FormData(form);
    const att = fd.get("attachment");
    if (att instanceof File && att.size > MAX_BYTES) {
      setStatus("err");
      setMessage("Файл завеликий (максимум 50 МБ)");
      return;
    }

    try {
      const res = await fetch("/api/request", {
        method: "POST",
        body: fd,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || "Помилка сервера");
      }
      setStatus("ok");
      setMessage("Запит надіслано. Ми зв'яжемося з вами найближчим часом.");
      form.reset();
    } catch (err) {
      setStatus("err");
      setMessage(err instanceof Error ? err.message : "Не вдалося надіслати");
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm"
    >
      <h2 className="text-lg font-semibold text-ink">Немає готової моделі</h2>
      <p className="text-sm text-muted">
        Опишіть задачу — можна додати креслення, фото або посилання на референс.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Ім&apos;я *
          <input
            name="name"
            required
            className="rounded-xl border border-line px-3 py-2.5 font-normal outline-none ring-accent focus:ring-2"
            placeholder="Олександр"
          />
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
          Телефон *
          <input
            name="phone"
            type="tel"
            required
            className="rounded-xl border border-line px-3 py-2.5 font-normal outline-none ring-accent focus:ring-2"
            placeholder="+380..."
          />
        </label>
      </div>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Email *
        <input
          name="email"
          type="email"
          required
          className="rounded-xl border border-line px-3 py-2.5 font-normal outline-none ring-accent focus:ring-2"
          placeholder="you@example.com"
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Опис задачі *
        <textarea
          name="description"
          required
          rows={4}
          className="resize-y rounded-xl border border-line px-3 py-2.5 font-normal outline-none ring-accent focus:ring-2"
          placeholder="Опишіть, що надрукувати, розміри, терміни..."
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
        Посилання (необов&apos;язково)
        <input
          name="link"
          type="url"
          className="rounded-xl border border-line px-3 py-2.5 font-normal outline-none ring-accent focus:ring-2"
          placeholder="https://example.com"
        />
      </label>

      <div>
        <span className="text-sm font-medium text-ink">
          Файл (креслення / фото)
        </span>
        <label
          htmlFor={id}
          className="mt-1.5 flex cursor-pointer flex-col items-center rounded-xl border border-dashed border-line bg-stone-50 px-4 py-6 text-center text-sm text-muted hover:bg-stone-100"
        >
          <input
            id={id}
            name="attachment"
            type="file"
            className="sr-only"
            accept="image/*,.pdf,.dwg,.dxf,.stl,.obj"
          />
          Натисніть або перетягніть файл · до 50 МБ
        </label>
      </div>

      {message ? (
        <p
          className={
            status === "ok" ? "text-sm text-green-700" : "text-sm text-red-600"
          }
          role="status"
        >
          {message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={status === "loading"}
        className="w-full rounded-xl bg-stone-900 px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-stone-800 disabled:opacity-60"
      >
        {status === "loading" ? "Надсилаємо…" : "Надіслати запит"}
      </button>
    </form>
  );
}
