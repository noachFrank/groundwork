// Draws Groundwork's icon (a white "G" on a teal rounded square) and writes
// scripts/groundwork.ico, used by the Desktop and Start menu shortcuts.
// Only Node's built-in modules, so it needs no packages:  node scripts/make-icon.mjs
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const TEAL = [11, 94, 115];
const WHITE = [255, 255, 255];

/** Is the point (x, y), from 0 to 1, inside the shape? */
function background(x, y) {
  const r = 0.2;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
}
function letterG(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const d = Math.hypot(dx, dy);
  const angle = (Math.atan2(-dy, dx) * 180) / Math.PI; // 0 is right, 90 is up
  const ring = d <= 0.31 && d >= 0.19 && !(angle > 8 && angle < 58);
  const bar = x >= 0.52 && x <= 0.81 && y >= 0.45 && y <= 0.56;
  return ring || bar;
}

function png(size) {
  const samples = 4;
  const rows = [];
  for (let py = 0; py < size; py++) {
    const row = Buffer.alloc(1 + size * 4);
    for (let px = 0; px < size; px++) {
      let bg = 0;
      let fg = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const x = (px + (sx + 0.5) / samples) / size;
          const y = (py + (sy + 0.5) / samples) / size;
          if (background(x, y)) {
            bg++;
            if (letterG(x, y)) fg++;
          }
        }
      }
      const n = samples * samples;
      const t = bg ? fg / bg : 0;
      const color = TEAL.map((c, i) => Math.round(c + (WHITE[i] - c) * t));
      row.set([...color, Math.round((bg / n) * 255)], 1 + px * 4);
    }
    rows.push(row);
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// An .ico file is a small directory followed by one PNG per size.
const sizes = [256, 64, 48, 32, 16];
const images = sizes.map(png);
const dir = Buffer.alloc(6 + 16 * sizes.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);
dir.writeUInt16LE(sizes.length, 4);
let offset = dir.length;
sizes.forEach((size, i) => {
  const e = 6 + i * 16;
  dir.writeUInt8(size === 256 ? 0 : size, e);
  dir.writeUInt8(size === 256 ? 0 : size, e + 1);
  dir.writeUInt16LE(1, e + 4);
  dir.writeUInt16LE(32, e + 6);
  dir.writeUInt32LE(images[i].length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += images[i].length;
});
const out = join(dirname(fileURLToPath(import.meta.url)), 'groundwork.ico');
writeFileSync(out, Buffer.concat([dir, ...images]));
console.log(`Wrote ${out}`);
