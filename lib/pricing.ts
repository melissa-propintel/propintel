// Report pricing (in cents, for Stripe). One place to change prices.
// Desktop cost to produce is ~$1 (API only); field adds agent + Exceleras (~$60).

export interface Price {
  cents: number;
  label: string;
  blurb: string;
}

export const PRICING: Record<string, Price> = {
  desktop: { cents: 8900, label: "Desktop Report", blurb: "You upload the docs — auto-generated in minutes." },
  field_lite: { cents: 15000, label: "Field Report — Lite", blurb: "An agent does an exterior/drive-by inspection." },
  field_full: { cents: 21000, label: "Field Report — Full", blurb: "An agent does a full interior + exterior inspection." },
  // Legacy generic field type → treat as Lite.
  field: { cents: 15000, label: "Field Report", blurb: "An agent inspects the property." },
};

// Launch pricing (temporary). Set LAUNCH=true to charge the intro price.
export const LAUNCH = false;
export const LAUNCH_PRICE: Record<string, number> = { desktop: 4900 };

export function priceFor(productType: string): Price {
  const base = PRICING[productType] ?? PRICING.desktop;
  const launch = LAUNCH ? LAUNCH_PRICE[productType] : undefined;
  return launch ? { ...base, cents: launch } : base;
}

export function usd(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

// Volume tiers for portfolio desktop orders (e.g. Bill's 500).
export function portfolioCentsEach(count: number): number {
  if (count >= 500) return 4500;
  if (count >= 100) return 5900;
  return PRICING.desktop.cents;
}
