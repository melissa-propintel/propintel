"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ADDON_SHOTS, PHOTO_BUCKET, requiredShotsFor, type ShotGroup, type PhotoLevel } from "@/lib/photo-shots";
import { getSupabase, isStorageConfigured } from "@/lib/supabase-browser";
import { getOrderByNumber } from "@/lib/orders";
import { FieldDocs } from "./field-docs";

type ShotStatus = "empty" | "uploading" | "saved" | "demo" | "error";

interface ShotState {
  id: string;
  key: string;
  label: string;
  hint: string;
  required: boolean;
  group: ShotGroup;
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

function initialShots(level: PhotoLevel = "full"): ShotState[] {
  return requiredShotsFor(level).map((s) => ({
    id: uid(),
    key: s.key,
    label: s.label,
    hint: s.hint,
    required: s.required,
    group: s.group,
    previewUrl: null,
    comment: "",
    status: "empty",
    basePath: null,
    remoteUrl: null,
    error: null,
  }));
}

async function downscale(file: File, maxDim = 1200, quality = 0.78): Promise<Blob> {
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
    return file;
  }
}

function safeFolder(s: string): string {
  return (s.trim() || "unassigned").replace(/[^\w.-]+/g, "_").slice(0, 60);
}

const GROUP_ORDER: ShotGroup[] = ["Exterior", "Neighbors", "Mechanicals", "Interior", "Other"];

export default function CapturePage() {
  const [order, setOrder] = useState("");
  const [address, setAddress] = useState("");
  const [propertyType, setPropertyType] = useState("Single Family");
  const [overallNote, setOverallNote] = useState("");
  const [shots, setShots] = useState<ShotState[]>(initialShots);
  const [lockedOrder, setLockedOrder] = useState(false);
  const configured = isStorageConfigured();
  const shotRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // From an order assignment link (/capture?order=…&level=…): lock the order,
  // load the address, and use the lite/full shot set.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const lvl = q.get("level");
    if (lvl === "lite") setShots(initialShots("lite"));
    const o = q.get("order");
    if (!o) return;
    setOrder(o);
    setLockedOrder(true);
    void (async () => {
      try {
        const ord = await getOrderByNumber(o);
        if (ord) {
          setAddress(ord.property_address || "");
        }
      } catch {
        /* address is best-effort */
      }
    })();
  }, []);

  const requiredShots = shots.filter((s) => s.required);
  const requiredDone = useMemo(
    () => requiredShots.every((s) => s.status === "saved" || s.status === "demo"),
    [requiredShots],
  );
  const capturedCount = shots.filter((s) => s.status === "saved" || s.status === "demo").length;
  const requiredCaptured = requiredShots.filter((s) => s.status === "saved" || s.status === "demo").length;

  function patch(id: string, updates: Partial<ShotState>) {
    setShots((prev) => prev.map((s) => (s.id === id ? { ...s, ...updates } : s)));
  }

  // After a capture, jump to the next required shot still empty.
  function advanceFrom(justDoneId: string) {
    const idx = shots.findIndex((s) => s.id === justDoneId);
    const next = shots
      .slice(idx + 1)
      .concat(shots.slice(0, idx))
      .find((s) => s.required && s.status === "empty");
    if (next) {
      const el = shotRefs.current[next.id];
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        el.classList.add("ring-2", "ring-pi-accent");
        setTimeout(() => el?.classList.remove("ring-2", "ring-pi-accent"), 1600);
      }
    }
  }

  async function saveOrderMeta() {
    const supabase = getSupabase();
    if (!supabase) return;
    const meta = JSON.stringify({
      order: safeFolder(order),
      address,
      propertyType,
      overallNote,
      updatedAt: new Date().toISOString(),
    });
    await supabase.storage
      .from(PHOTO_BUCKET)
      .upload(`${safeFolder(order)}/_order.json`, new Blob([meta], { type: "application/json" }), { upsert: true });
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
      patch(shot.id, { status: "demo", basePath: base });
      advanceFrom(shot.id);
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
    await saveMeta(base, shot, shot.comment);
    advanceFrom(shot.id);
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
    if (shot.basePath && shot.status === "saved") void saveMeta(shot.basePath, shot, shot.comment);
  }

  function addShot(addon: { key: string; label: string; hint: string; group: ShotGroup }) {
    setShots((prev) => [
      ...prev,
      {
        id: uid(),
        key: `${addon.key}-${prev.filter((s) => s.key.startsWith(addon.key)).length + 1}`,
        label: addon.label,
        hint: addon.hint,
        required: false,
        group: addon.group,
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

  const groups = GROUP_ORDER.map((g) => ({ group: g, items: shots.filter((s) => s.group === g) })).filter(
    (x) => x.items.length > 0,
  );

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-6">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-black text-pi-navy">PropIntel</span>
        <span className="text-xs text-slate-400">Field photo capture</span>
      </div>

      {/* order + address header */}
      <div className="rounded-lg bg-pi-navy px-4 py-3 text-white">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-blue-200">Your assignment</p>
        {address ? (
          <p className="text-base font-bold">{address}</p>
        ) : (
          <p className="text-sm italic text-blue-100">Enter your order number below</p>
        )}
        <p className="text-xs text-blue-200">Order {order || "—"}</p>
      </div>

      {/* property type */}
      <div className="mt-3 flex items-center gap-2">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Property type</label>
        <select
          value={propertyType}
          onChange={(e) => {
            setPropertyType(e.target.value);
          }}
          onBlur={() => void saveOrderMeta()}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm"
        >
          <option>Single Family</option>
          <option>Multi-family (2-4 units)</option>
          <option>Multi-family (5+ units)</option>
          <option>Condo / Townhome</option>
          <option>Manufactured</option>
          <option>Other</option>
        </select>
      </div>

      {/* INSTRUCTIONS — always open, the key fix */}
      <div className="mt-3 rounded-lg border border-pi-border bg-white p-3 text-xs text-slate-700">
        <p className="text-sm font-bold text-pi-navy">Before you start</p>
        <ol className="mt-1 list-decimal space-y-1 pl-4">
          <li>
            <strong>Open this link in your phone&apos;s web browser</strong> (Safari on iPhone, Chrome on
            Android) — not inside a text or email preview.
          </li>
          <li>
            The first time you tap a photo box, your phone will ask to use the camera — tap <strong>Allow</strong>.
          </li>
          <li>Each photo uploads automatically. When all the red items show &ldquo;Saved&rdquo;, you&apos;re done.</li>
        </ol>

        <p className="mt-2 rounded bg-red-50 p-2 font-semibold text-red-700">
          Photos we MUST have:
          <span className="mt-1 block font-normal text-red-700">
            Front of the house and all 4 sides · the roof (from the ground) · the home on the left, the
            right, and across the street · the electrical / breaker box · the HVAC unit · the hot water
            heater. If you can get inside: every room and any damage. Add anything else you think we should
            see.
          </span>
        </p>

        <details className="mt-2">
          <summary className="cursor-pointer font-semibold text-pi-navy">Camera opens to a black screen?</summary>
          <ul className="mt-1 list-disc space-y-1 pl-4 text-slate-600">
            <li>
              <strong>Easiest fix:</strong> open your phone&apos;s normal <strong>Camera app</strong>, take the
              photos, come back here, tap the box → <strong>Photo Library</strong>, and pick them.
            </li>
            <li>
              <strong>Allow the camera:</strong> iPhone → Settings → Safari → Camera → <strong>Allow</strong>;
              Android → Settings → Apps → your browser → Permissions → Camera → <strong>Allow</strong>.
            </li>
            <li>Still black? Fully close the browser and reopen this link, or restart the phone.</li>
          </ul>
        </details>
      </div>

      {!configured && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
          <strong>Demo mode.</strong> Storage isn&apos;t connected, so photos stay on this device. You can
          still walk the whole flow.
        </div>
      )}

      {/* manual order entry only if not opened from a link */}
      {!lockedOrder && (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">Order #</label>
          <input
            value={order}
            onChange={(e) => setOrder(e.target.value)}
            placeholder="PI-2026-0507"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
          />
        </div>
      )}

      {/* progress */}
      <div className="sticky top-0 z-10 mt-4 flex items-center justify-between rounded-md bg-slate-100 px-3 py-2 text-sm shadow-sm">
        <span className="text-slate-600">
          {requiredCaptured}/{requiredShots.length} required · {capturedCount} total
        </span>
        <span className={requiredDone ? "font-semibold text-emerald-700" : "text-slate-400"}>
          {requiredDone ? "All required ✓" : "Keep going"}
        </span>
      </div>

      {/* shots grouped */}
      <div className="mt-4 flex flex-col gap-4">
        {groups.map(({ group, items }) => (
          <div key={group}>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{group}</p>
            <div className="flex flex-col gap-3">
              {items.map((shot) => (
                <div
                  key={shot.id}
                  ref={(el) => {
                    shotRefs.current[shot.id] = el;
                  }}
                  className={`rounded-lg border bg-white p-3 transition ${
                    shot.required && shot.status === "empty" ? "border-red-200" : "border-pi-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-pi-navy">
                        {shot.label}
                        {shot.required && (
                          <span className="ml-1.5 rounded bg-red-100 px-1 py-0.5 text-[9px] font-bold uppercase text-red-700">
                            Required
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-slate-500">{shot.hint}</p>
                    </div>
                    <StatusChip status={shot.status} />
                  </div>

                  <div className="mt-2 flex gap-3">
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
                        placeholder="Note for this photo (optional)"
                        className="w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm"
                      />
                      <div className="mt-1 flex items-center gap-3">
                        {shot.previewUrl && <span className="text-[11px] text-pi-accent">Tap photo to retake</span>}
                        {!shot.required && (
                          <button onClick={() => removeShot(shot.id)} className="text-[11px] text-slate-400 hover:text-red-500">
                            Remove
                          </button>
                        )}
                      </div>
                      {shot.status === "error" && shot.error && <p className="mt-1 text-[11px] text-red-600">{shot.error}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* add-ons */}
      <div className="mt-4">
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Add more photos</p>
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

      {/* MLS & field documents + the agent's read */}
      <FieldDocs folder={safeFolder(order)} />

      {/* overall comments */}
      <div className="mt-5">
        <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
          Anything we should know? (overall comments)
        </label>
        <textarea
          value={overallNote}
          onChange={(e) => setOverallNote(e.target.value)}
          onBlur={() => void saveOrderMeta()}
          placeholder="Occupancy, access, condition, neighborhood — anything you noticed."
          rows={3}
          className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
        />
      </div>

      {/* finish */}
      <div className="mt-5">
        {requiredDone ? (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-center">
            <p className="text-sm font-semibold text-emerald-800">All required photos captured ✓</p>
            <p className="mt-1 text-xs text-emerald-700">
              {capturedCount} photo{capturedCount === 1 ? "" : "s"} for {address || safeFolder(order)}.
              {configured ? " Saved." : " (Demo mode — not saved.)"} You&apos;re done — thank you!
            </p>
          </div>
        ) : (
          <p className="text-center text-xs text-slate-400">Capture all the red &ldquo;Required&rdquo; photos to finish.</p>
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
