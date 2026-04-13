export type Material = "PLA" | "PETG" | "ABS";
export type Strength = "low" | "medium" | "high";
export type Quality = "draft" | "normal" | "fine";

/** г/см³ — PLA за ТЗ; PETG/ABS типові наближення */
const DENSITY_G_CM3: Record<Material, number> = {
  PLA: 1.24,
  PETG: 1.27,
  ABS: 1.04,
};

const INFILL: Record<Strength, number> = {
  low: 0.15,
  medium: 0.25,
  high: 0.5,
};

export type PricingInput = {
  volumeCm3: number;
  material: Material;
  strength: Strength;
  quality: Quality;
};

export type PricingResult = {
  volumeCm3: number;
  infill: number;
  densityGCm3: number;
  weightG: number;
  printTimeHours: number;
  priceUah: number;
};

/**
 * weight = volume * infill * density
 * print_time = volume / 10
 * price = (weight * 1.2) + (print_time * 20) + 20
 * (якість друку зберігається в відповіді API для замовлення, на формули ТЗ не впливає)
 */
export function calculatePricing(input: PricingInput): PricingResult {
  const { volumeCm3, material, strength } = input;
  const infill = INFILL[strength];
  const densityGCm3 = DENSITY_G_CM3[material];
  const weightG = volumeCm3 * infill * densityGCm3;
  const printTimeHours = volumeCm3 / 10;
  const priceUah = weightG * 1.2 + printTimeHours * 20 + 20;

  return {
    volumeCm3,
    infill,
    densityGCm3,
    weightG: Math.round(weightG * 100) / 100,
    printTimeHours: Math.round(printTimeHours * 100) / 100,
    priceUah: Math.round(priceUah * 100) / 100,
  };
}

export function isMaterial(v: string): v is Material {
  return v === "PLA" || v === "PETG" || v === "ABS";
}

export function isStrength(v: string): v is Strength {
  return v === "low" || v === "medium" || v === "high";
}

export function isQuality(v: string): v is Quality {
  return v === "draft" || v === "normal" || v === "fine";
}
