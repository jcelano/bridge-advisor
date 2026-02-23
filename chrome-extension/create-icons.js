/**
 * Generates PNG icon files for the Chrome extension.
 * Run once from inside the chrome-extension/ directory:
 *
 *   node create-icons.js
 *
 * Produces: icons/icon16.png  icons/icon48.png  icons/icon128.png
 *
 * No npm packages required — uses only Node.js built-ins (zlib + fs).
 */

import { deflateSync } from 'zlib';
import { writeFileSync, mkdirSync } from 'fs';

// ── CRC32 (required by the PNG spec) ────────────────────────────────────────
const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[i] = c;
}
function crc32(buf) {
  let crc = 0xFFFFFFFF;
  for (const byte of buf) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ── PNG chunk builder ────────────────────────────────────────────────────────
function chunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf  = Buffer.allocUnsafe(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcBuf  = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

// ── Solid-color RGBA PNG ─────────────────────────────────────────────────────
function solidPNG(size, [r, g, b, a = 255]) {
  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8]  = 8;  // bit depth
  ihdr[9]  = 6;  // color type: RGBA
  ihdr[10] = 0;  // compression: deflate
  ihdr[11] = 0;  // filter: adaptive
  ihdr[12] = 0;  // interlace: none

  // Raw scanlines: each starts with filter byte 0 (None)
  const rowBytes = 1 + size * 4;
  const raw = Buffer.allocUnsafe(size * rowBytes);
  for (let y = 0; y < size; y++) {
    const base = y * rowBytes;
    raw[base] = 0; // filter byte
    for (let x = 0; x < size; x++) {
      const px = base + 1 + x * 4;
      raw[px] = r; raw[px + 1] = g; raw[px + 2] = b; raw[px + 3] = a;
    }
  }

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Generate icons ───────────────────────────────────────────────────────────
// Dark forest green (#1a3a1a) — matches Bridge Advisor's color scheme
const BG = [26, 58, 26];

mkdirSync('./icons', { recursive: true });
for (const size of [16, 48, 128]) {
  const png = solidPNG(size, BG);
  writeFileSync(`./icons/icon${size}.png`, png);
  console.log(`✓ icons/icon${size}.png  (${png.length} bytes)`);
}
console.log('\nDone. Load the extension at chrome://extensions → Load unpacked.');
