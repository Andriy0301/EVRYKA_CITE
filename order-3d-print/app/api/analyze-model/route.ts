import { NextResponse } from "next/server";
import {
  parseModelBuffer,
  supportedServerExtension,
  extensionFromName,
} from "@/lib/parse-model-server";
import {
  calculatePricing,
  isMaterial,
  isQuality,
  isStrength,
  type Material,
  type Quality,
  type Strength,
} from "@/lib/pricing";

export const runtime = "nodejs";

const MAX_BYTES = 50 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Файл не передано" }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "Максимальний розмір файлу — 50 МБ" },
        { status: 400 }
      );
    }

    const ext = extensionFromName(file.name);
    if (!supportedServerExtension(ext)) {
      return NextResponse.json(
        {
          error:
            "Для серверного аналізу завантажте STL або OBJ.3MF можна додати пізніше або скористайтесь формою без моделі.",
        },
        { status: 400 }
      );
    }

    const materialRaw = String(form.get("material") || "PLA");
    const strengthRaw = String(form.get("strength") || "medium");
    const qualityRaw = String(form.get("quality") || "normal");

    const material: Material = isMaterial(materialRaw) ? materialRaw : "PLA";
    const strength: Strength = isStrength(strengthRaw) ? strengthRaw : "medium";
    const quality: Quality = isQuality(qualityRaw) ? qualityRaw : "normal";

    const buffer = await file.arrayBuffer();
    const { volumeCm3 } = await parseModelBuffer(buffer, file.name);

    if (!Number.isFinite(volumeCm3) || volumeCm3 <= 0) {
      return NextResponse.json(
        { error: "Не вдалося обчислити об'єм. Перевірте коректність моделі." },
        { status: 422 }
      );
    }

    const pricing = calculatePricing({
      volumeCm3,
      material,
      strength,
      quality,
    });

    return NextResponse.json({
      volume: pricing.volumeCm3,
      estimatedWeight: pricing.weightG,
      printTimeHours: pricing.printTimeHours,
      price: pricing.priceUah,
      infill: pricing.infill,
      material,
      strength,
      quality,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Помилка аналізу";
    console.error("[analyze-model]", e);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
