#!/usr/bin/env node
// Renders public/brand/icon-*.png from the brand geometry (analytic coverage,
// 4x4 supersampled). Dependency-free. Re-run: node scripts/render-brand-png.cjs
const zlib = require("zlib"), fs = require("fs"), path = require("path");
const NAVY = [10, 31, 68], GOLD = [201, 162, 39], WHITE = [255, 255, 255];
const seg = (x, y, ax, ay, bx, by) => {
  const pax = x - ax, pay = y - ay, bax = bx - ax, bay = by - ay;
  const h = Math.max(0, Math.min(1, (pax * bax + pay * bay) / (bax * bax + bay * bay)));
  return Math.hypot(pax - bax * h, pay - bay * h);
};
const check = (x, y) =>
  Math.min(seg(x, y, 18.4, 24.6, 22.2, 28.4), seg(x, y, 22.2, 28.4, 30, 20.6)) - 1.5;
const ring = (x, y) => Math.abs(Math.hypot(x - 24, y - 24) - 13) - 0.8;
const ell = (x, y, rx, ry) => {
  const k = Math.hypot((x - 24) / rx, (y - 24) / ry);
  const g = Math.hypot((x - 24) / (rx * rx), (y - 24) / (ry * ry));
  return Math.abs((k - 1) / Math.max(g, 1e-9)) - 0.8;
};
const gold = (x, y) =>
  ring(x, y) < 0 || ell(x, y, 13, 5.4) < 0 || ell(x, y, 5.4, 13) < 0 ||
  (Math.abs(y - 18) < 0.55 && x > 12.6 && x < 35.4) ||
  (Math.abs(y - 30) < 0.55 && x > 12.6 && x < 35.4);
const bgSq = (x, y, r) => {
  const qx = Math.abs(x - 24) - (24 - r), qy = Math.abs(y - 24) - (24 - r);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
};
function render(size, transparentBg) {
  const s = size / 48, rows = [];
  for (let py = 0; py < size; py++) {
    const row = new Uint8Array(size * 4);
    for (let px = 0; px < size; px++) {
      let bg = 0, gd = 0, wh = 0;
      for (let sy = 0; sy < 4; sy++) for (let sx = 0; sx < 4; sx++) {
        const vx = (px + (sx + 0.5) / 4) / s, vy = (py + (sy + 0.5) / 4) / s;
        if (!transparentBg && bgSq(vx, vy, 10) < 0) bg++;
        if (gold(vx, vy)) gd++;
        if (check(vx, vy) < 0) wh++;
      }
      let c = transparentBg && wh === 0 && gd === 0 ? [0, 0, 0] : wh > 0 ? WHITE : gd > 0 ? GOLD : NAVY;
      const a = transparentBg ? Math.max(bg, gd, wh) / 16 : 1;
      const i = px * 4;
      row[i] = c[0]; row[i + 1] = c[1]; row[i + 2] = c[2];
      row[i + 3] = Math.round(a * 255);
    }
    rows.push(row);
  }
  return rows;
}
const table = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
const crc32 = (buf) => {
  let c = ~0;
  for (const b of buf) c = table[(c ^ b) & 0xff] ^ (c >>> 8);
  return ~c >>> 0;
};
function png(rows, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = size * 4 + 1, raw = Buffer.alloc(stride * size);
  rows.forEach((row, y) => { raw[y * stride] = 0; raw.set(row, y * stride + 1); });
  const emit = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
    const t = Buffer.from(type, "ascii");
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
    return Buffer.concat([len, t, data, crc]);
  };
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    emit("IHDR", ihdr), emit("IDAT", zlib.deflateSync(raw, { level: 9 })),
    emit("IEND", Buffer.alloc(0)),
  ]);
}
const OUT = path.join(__dirname, "..", "public", "brand");
fs.mkdirSync(OUT, { recursive: true });
for (const size of [16, 32, 48, 192, 512]) {
  const transparent = size >= 192;
  fs.writeFileSync(path.join(OUT, `icon-${size}.png`), png(render(size, transparent), size));
}
console.log("PNG brand assets written to public/brand");
