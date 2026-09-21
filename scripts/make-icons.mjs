// Gera icon-192.png e icon-512.png sem dependências: rasteriza a bússola do icon.svg.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x + 0.5, y + 0.5);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}
function make(size) {
  const s = size / 64;
  const blue = [42, 120, 214], white = [255, 255, 255], orange = [235, 104, 52];
  return png(size, (x, y) => {
    const u = x / s, v = y / s;
    // retângulo arredondado
    const r = 14, cx = Math.min(Math.max(u, r), 64 - r), cy = Math.min(Math.max(v, r), 64 - r);
    if (Math.hypot(u - cx, v - cy) > r) return [0, 0, 0, 0];
    const d = Math.hypot(u - 32, v - 32);
    if (inTriangle(u, v, [32, 14], [37, 30], [27, 30])) return [...orange, 255];
    if (inTriangle(u, v, [37, 30], [32, 50], [27, 30])) return [...white, 255];
    if (d >= 18.5 && d <= 21.5) return [...white, 255];
    return [...blue, 255];
  });
}
writeFileSync('public/icon-192.png', make(192));
writeFileSync('public/icon-512.png', make(512));
console.log('ícones gerados');
