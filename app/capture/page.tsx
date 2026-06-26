"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { REQUIRED_SHOTS, ADDON_SHOTS, PHOTO_BUCKET } from "@/lib/photo-shots";
import { getSupabase, isStorageConfigured } from "@/lib/supabase-browser";

type ShotStatus = "empty" | "uploading" | "saved" | "demo" | "error";

interface ShotState {
  id: string;
  key: string;
  label: string;
  hint: string;
  required: boolean;
  previewUrl: string | null;
  comment: string;
  status: ShotStatus;
  basePath: string | null;
  remoteUrl: string | null;
  error: string | null;
}

let idSeq = 0;
function uid(): string {
  idSeq += 1;
  return `s${idSeq}`;
}

function initialShots(): ShotState[] {
  return REQUIRED_SHOTS.map((s) => ({
    id: uid(),
    key: s.key,
    label: s.label,
    hint: s.hint,
    required: s.required,
    previewUrl: null,
    comment: "",
    status: "empty",
    basePath: null,
    remoteUrl: null,
    error: null,
  }));
}

// Downscale + re-encode to JPEG so uploads are fast on cellular and EXIF
// orientation is baked in.
async function downscale(file: File, maxDim = 1600, quality = 0.82): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    let { width, height } = bitmap;
    const longest = Math.max(width, height);
    if (longest > maxDim) {
      const scale = maxDim / longest;
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", quality));
    return blob ?? file;
  } catch {
    return file; // if anything fails, upload the original
  }
}

function safeFolder(s: string): string {
  return (s.trim() || "unassigned").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

export default function CapturePage() {
  const [order, setOrder] = useState("");
  const [shots, setShots] = useState<ShotState[]>(initialShots);
  const configured = isStorageConfigured();

  const requiredDone = useMemo(
    () => shots.filter((s) => s.required).every((s) => s.status === "saved" || s.status === "demo"),
    [shots],
  );
  const capturedCount = shots.filter((s) => s.status === "saved" || s.status === "demo").length;

  function patch(id: string, updates: Partial<ShotState>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  async function onCapture(shot: ShotState, file: File | undefined) {
    if (!file) return;
    const previewUrl = URL.createObjectURL(file);
    patch(shot.id, { previewUrl, status: "uploading", error: null });

    const blob = await downscale(file);
    const stamp = Date.now();
    const base = `${safeFolder(order)}/${shot.key}-${stamp}`;

    const supabase = getSupabase();
    if (!supabase) {
      // Demo mode — no storage configured. Let the flow work locally.
      patch(shot.id, { status: "demo", basePath: base });
      return;
    }

    const { error } = await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(`${base}.jpg`, blob, { contentType: "image/jpeg", upsert: true });
    if (error) {
      patch(shot.id, { status: "error", error: error.message });
      return;
    }
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(`${base}.jpg`);
    patch(shot.id, { status: "saved", basePath: base, remoteUrl: data.publicUrl });
    await saveMeta(base, shot, "");
  }

  async function saveMeta(base: string, shot: ShotState, comment: string) {
    const supabase = getSupabase();
    if (!supabase) return;
    const meta = JSON.stringify({
      order: safeFolder(order),
      key: shot.key,
      label: shot.label,
      comment,
      capturedAt: new Date().toISOString(),
    });
    await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(`${base}.json`, new Blob([meta], { type: "application/json" }), { upsert: true });
  }

  function onCommentBlur(shot: ShotState) {
    if (shot.basePath && (shot.status === "saved")) {
      void saveMeta(shot.basePath, shot, shot.comment);
    }
  }

  function addShot(addon: { key: string; label: string; hint: string }) {
    setShots((prev) => [
      ...prev,
      {
        id: uid(),
        key: `${addon.key}-${prev.filter((s) => s.key.startsWith(addon.key)).length + 1}`,
        label: addon.label,
        hint: addon.hint,
        required: false,
        previewUrl: null,
        comment: "",
        status: "empty",
        basePath: null,
        remoteUrl: null,
        error: null,
      },
    ]);
  }

  function removeShot(id: string) {
    setShots((prev) => prev.filter((s) => s.id !== id));
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-xs font-semibold uppercase tracking-wide text-pi-accent">
          ← Home
        </Link>
        <span className="text-xs text-slate-400">Field photo capture</span>
      </div>

      <h1 className="text-xl font-black text-pi-navy">Photo Capture</h1>
      <p className="mt-1 text-sm text-slate-600">
        Tap each shot to open your camera. Photos upload as you take them — add a quick note and move on.
      </p>

      {!configured && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Demo mode.</strong> Storage isn&apos;t connected yet, so photos stay on this device and
          aren&apos;t saved. You can still walk the whole flow. Connect Supabase to make uploads permanent.
        </div>
      )}

      {/* order */}
      <div className="mt-4">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Order # / property
        </label>
        <input
          value={order}
          onChange={(e) => setOrder(e.target.value)}
          placeholder="PI-2026-0507 or 123 Main St"
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {/* progress */}
      <div className="mt-4 flex items-center justify-between rounded-md bg-slate-50 px-3 py-2 text-sm">
        <span className="text-slate-600">
          {capturedCount} captured · {shots.filter((s) => s.required).length} required
        </span>
        <span className={requiredDone ? "font-semibold text-emerald-700" : "text-slate-400"}>
          {requiredDone ? "All required ✓" : "Required pending"}
        </span>
      </div>

      {/* shots */}
      <div className="mt-4 flex flex-col gap-3">
        {shots.map((shot) => (
          <div key={shot.id} className="rounded-lg border border-pi-border bg-white p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-pi-navy">
                  {shot.label}
                  {shot.required && <span className="ml-1 text-red-500">*</span>}
                </p>
                <p className="text-[11px] text-slate-500">{shot.hint}</p>
              </div>
              <StatusChip status={shot.status} />
            </div>

            <div className="mt-2 flex gap-3">
              {/* preview / capture target */}
              <label className="relative flex h-24 w-24 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-md border border-dashed border-slate-300 bg-slate-50 text-center">
                {shot.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={shot.previewUrl} alt={shot.label} className="h-full w-full object-cover" />
                ) : (
                  <span className="px-1 text-[11px] font-medium text-slate-500">📷 Take photo</span>
                )}
                <input
                  type="file"
                  accept="image/*"
                  className="absolute inset-0 cursor-pointer opacity-0"
                  onChange={(e) => onCapture(shot, e.target.files?.[0])}
                />
              </label>

              <div className="flex-1">
                <input
                  value={shot.comment}
                  onChange={(e) => patch(shot.id, { comment: e.target.value })}
                  onBlur={() => onCommentBlur(shot)}
                  placeholder="Quick note (optional)"
                  className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                />
                <div className="mt-1 flex items-center gap-3">
                  {shot.previewUrl && (
                    <span className="text-[11px] text-pi-accent">Tap the photo to retake</span>
                  )}
                  {!shot.required && (
                    <button
                      onClick={() => removeShot(shot.id)}
                      className="text-[11px] text-slate-400 hover:text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
                {shot.status === "error" && shot.error && (
                  <p className="mt-1 text-[11px] text-red-600">{shot.error}</p>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* add-ons */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Add a shot</p>
        <div className="flex flex-wrap gap-2">
          {ADDON_SHOTS.map((a) => (
            <button
              key={a.key}
              onClick={() => addShot(a)}
              className="rounded-full border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              + {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* finish */}
      <div className="mt-6">
        {requiredDone ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-800">All required photos captured ✓</p>
            <p className="mt-1 text-xs text-emerald-700">
              {capturedCount} photo{capturedCount === 1 ? "" : "s"} for {safeFolder(order)}.
              {configured ? " Saved." : " (Demo mode — not saved.)"} You&apos;re done.
            </p>
          </div>
        ) : (
          <p className="text-center text-xs text-slate-400">
            Capture the required shots (marked *) to finish.
          </p>
        )}
      </div>
    </div>
  );
}

function StatusChip({ status }: { status: ShotStatus }) {
  const map: Record<ShotStatus, { label: string; cls: string }> = {
    empty: { label: "—", cls: "bg-slate-100 text-slate-400" },
    uploading: { label: "Uploading…", cls: "bg-amber-100 text-amber-700" },
    saved: { label: "Saved ✓", cls: "bg-emerald-100 text-emerald-700" },
    demo: { label: "Captured", cls: "bg-sky-100 text-sky-700" },
    error: { label: "Error", cls: "bg-red-100 text-red-700" },
  };
  const s = map[status];
  return <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${s.cls}`}>{s.label}</span>;
}
