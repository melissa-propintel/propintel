// The PropIntel field shot list. The required four are the core of every order;
// damaged-surrounding-home and "other" shots are added on demand.

export interface ShotDef {
  key: string;
  label: string;
  hint: string;
  required: boolean;
}

export const REQUIRED_SHOTS: ShotDef[] = [
  { key: "subject-front", label: "Subject — front", hint: "Full front elevation of the property", required: true },
  { key: "subject-address", label: "Subject — address / number", hint: "House number or address verification", required: false },
  { key: "left-neighbor", label: "Neighbor — left", hint: "Home immediately to the left", required: true },
  { key: "right-neighbor", label: "Neighbor — right", hint: "Home immediately to the right", required: true },
  { key: "across-street", label: "Across the street", hint: "Home directly across from the subject", required: true },
];

// Optional add-ons the agent can append as many times as needed.
export const ADDON_SHOTS: { key: string; label: string; hint: string }[] = [
  { key: "damaged", label: "Damaged surrounding home", hint: "Any nearby home that is damaged / distressed" },
  { key: "street-view", label: "Street view", hint: "General view down the block" },
  { key: "other", label: "Other", hint: "Anything else worth documenting" },
];

export const PHOTO_BUCKET = "field-photos";
