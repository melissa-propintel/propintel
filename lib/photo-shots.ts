// The PropIntel field shot list. Required shots must all be captured; rooms,
// damage, and "other" are added as many times as needed.

export type ShotGroup = "Exterior" | "Neighbors" | "Mechanicals" | "Interior" | "Other";

export interface ShotDef {
  key: string;
  label: string;
  hint: string;
  required: boolean;
  group: ShotGroup;
}

export const REQUIRED_SHOTS: ShotDef[] = [
  // Exterior — front + all 4 sides + roof
  { key: "front", label: "Front of house", hint: "Full front elevation", required: true, group: "Exterior" },
  { key: "rear", label: "Rear of house", hint: "Full back of the house", required: true, group: "Exterior" },
  { key: "left-side", label: "Left side", hint: "Left elevation", required: true, group: "Exterior" },
  { key: "right-side", label: "Right side", hint: "Right elevation", required: true, group: "Exterior" },
  { key: "roof", label: "Roof", hint: "From the ground — best view you can get", required: true, group: "Exterior" },
  // Neighbors
  { key: "left-neighbor", label: "Neighbor — left", hint: "Home immediately to the left", required: true, group: "Neighbors" },
  { key: "right-neighbor", label: "Neighbor — right", hint: "Home immediately to the right", required: true, group: "Neighbors" },
  { key: "across-street", label: "Across the street", hint: "Home directly across from the subject", required: true, group: "Neighbors" },
  // Mechanicals
  { key: "electrical-panel", label: "Electrical / breaker box", hint: "Open the panel door if you can", required: true, group: "Mechanicals" },
  { key: "hvac", label: "HVAC unit", hint: "Outdoor condenser and/or furnace", required: true, group: "Mechanicals" },
  { key: "water-heater", label: "Hot water heater", hint: "The water heater tank", required: true, group: "Mechanicals" },
];

// Lite (drive-by) shot set — front + neighbors + across street.
export const LITE_KEYS = ["front", "left-neighbor", "right-neighbor", "across-street"];

export type PhotoLevel = "lite" | "full";

export function requiredShotsFor(level: PhotoLevel): ShotDef[] {
  return level === "lite" ? REQUIRED_SHOTS.filter((s) => LITE_KEYS.includes(s.key)) : REQUIRED_SHOTS;
}

// Repeatable add-ons — agent adds as many as needed.
export const ADDON_SHOTS: { key: string; label: string; hint: string; group: ShotGroup }[] = [
  { key: "room", label: "Interior room", hint: "If you have interior access — every room", group: "Interior" },
  { key: "damage", label: "Damage", hint: "Any damage, inside or out", group: "Other" },
  { key: "other", label: "Anything else", hint: "Anything you think we should see", group: "Other" },
];

export const PHOTO_BUCKET = "field-photos";
