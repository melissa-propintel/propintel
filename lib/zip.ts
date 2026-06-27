// Minimal ZIP writer (store method, no compression) — dependency-free.
// PDFs are already compressed, so storing them is fine and keeps this tiny.
// Produces a Blob suitable for download in the browser.

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function makeZip(files: { name: string; data: Uint8Array }[]): Blob {
  const enc = new TextEncoder();
  const entries: ZipEntry[] = files.map((f) => ({ name: f.name.replace(/\\/g, "/"), data: f.data }));

  const localParts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    const crc = crc32(e.data);
    const size = e.data.length;

    // Local file header (30 bytes + name)
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); // signature
    lh.setUint16(4, 20, true); // version needed
    lh.setUint16(6, 0, true); // flags
    lh.setUint16(8, 0, true); // method 0 = store
    lh.setUint16(10, 0, true); // mod time
    lh.setUint16(12, 0, true); // mod date
    lh.setUint32(14, crc, true);
    lh.setUint32(18, size, true); // compressed size
    lh.setUint32(22, size, true); // uncompressed size
    lh.setUint16(26, nameBytes.length, true);
    lh.setUint16(28, 0, true); // extra len
    const lhBytes = new Uint8Array(lh.buffer);
    localParts.push(lhBytes, nameBytes, e.data);

    // Central directory header (46 bytes + name)
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true);
    ch.setUint16(4, 20, true); // version made by
    ch.setUint16(6, 20, true); // version needed
    ch.setUint16(8, 0, true);
    ch.setUint16(10, 0, true);
    ch.setUint16(12, 0, true);
    ch.setUint16(14, 0, true);
    ch.setUint32(16, crc, true);
    ch.setUint32(20, size, true);
    ch.setUint32(24, size, true);
    ch.setUint16(28, nameBytes.length, true);
    ch.setUint16(30, 0, true); // extra
    ch.setUint16(32, 0, true); // comment
    ch.setUint16(34, 0, true); // disk
    ch.setUint16(36, 0, true); // internal attrs
    ch.setUint32(38, 0, true); // external attrs
    ch.setUint32(42, offset, true); // local header offset
    central.push(new Uint8Array(ch.buffer), nameBytes);

    offset += lhBytes.length + nameBytes.length + e.data.length;
  }

  const centralStart = offset;
  let centralSize = 0;
  for (const c of central) centralSize += c.length;

  // End of central directory (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, centralStart, true);
  ev.setUint16(20, 0, true);

  // Concatenate into a single ArrayBuffer-backed array (Blob-friendly under strict TS).
  const all = [...localParts, ...central, eocd];
  let total = 0;
  for (const p of all) total += p.length;
  const out = new Uint8Array(total);
  let pos = 0;
  for (const p of all) {
    out.set(p, pos);
    pos += p.length;
  }
  return new Blob([out], { type: "application/zip" });
}
