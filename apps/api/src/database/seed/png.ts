import { deflateSync } from 'zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * A small hatched PNG, the same diagonal-stripe placeholder the design uses for photos.
 * `tone` shifts the base colour so different documents look different in the review screens.
 */
export function hatchPng(width = 480, height = 320, tone = 0, stripe = 14): Buffer {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  const a: [number, number, number] = [214 - tone, 207 - tone, 193 - tone];
  const b: [number, number, number] = [221 - tone, 215 - tone, 202 - tone];
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const [r, g, bl] = Math.floor((x + y) / stripe) % 2 === 0 ? a : b;
      // a dark frame so the image reads as a document/photo
      const edge = x < 3 || y < 3 || x >= width - 3 || y >= height - 3;
      const o = row + 1 + x * 3;
      raw[o] = edge ? 21 : r;
      raw[o + 1] = edge ? 20 : g;
      raw[o + 2] = edge ? 26 : bl;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
