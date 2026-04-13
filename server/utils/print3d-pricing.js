const DENSITY = { PLA: 1.24, PETG: 1.27, ABS: 1.04 };
const INFILL = { low: 0.15, medium: 0.25, high: 0.5 };

function calculatePricing({ volumeCm3, material, strength }) {
  const m = DENSITY[material] != null ? material : "PLA";
  const s = INFILL[strength] != null ? strength : "medium";
  const infill = INFILL[s];
  const densityGCm3 = DENSITY[m];
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
    material: m,
    strength: s
  };
}

module.exports = { calculatePricing, DENSITY, INFILL };
