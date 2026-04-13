"use client";

export type AnalyzeApiResult = {
  volume: number;
  estimatedWeight: number;
  printTimeHours: number;
  price: number;
};

type Props = {
  data: AnalyzeApiResult | null;
  onOrder: () => void;
  ordering?: boolean;
};

export function PricingResult({ data, onOrder, ordering }: Props) {
  if (!data) {
    return (
      <div className="rounded-2xl border border-dashed border-line bg-white/60 px-5 py-8 text-center text-sm text-muted">
        Після розрахунку тут з&apos;являться вага, час і вартість.
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-2xl border border-line bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold text-ink">Орієнтовний розрахунок</h3>
      <dl className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl bg-stone-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Вага
          </dt>
          <dd className="mt-1 text-xl font-bold text-ink">
            {data.estimatedWeight} г
          </dd>
        </div>
        <div className="rounded-xl bg-stone-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-muted">
            Час друку
          </dt>
          <dd className="mt-1 text-xl font-bold text-ink">
            {data.printTimeHours} год
          </dd>
        </div>
        <div className="rounded-xl bg-orange-50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-accent">
            Ціна
          </dt>
          <dd className="mt-1 text-xl font-bold text-accent">
            {data.price} грн
          </dd>
        </div>
      </dl>
      <p className="text-xs text-muted">
        Об&apos;єм моделі: {data.volume} см³ (орієнтовно, з файлу).
      </p>
      <button
        type="button"
        onClick={onOrder}
        disabled={ordering}
        className="w-full rounded-xl bg-accent px-4 py-3.5 text-sm font-semibold text-white shadow-md transition hover:bg-accent-hover disabled:opacity-60"
      >
        {ordering ? "Відправляємо…" : "Замовити"}
      </button>
    </div>
  );
}
