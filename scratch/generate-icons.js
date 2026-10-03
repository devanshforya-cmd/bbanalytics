const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Minimal PNG generator in pure Node.js (standard library only)
function createSolidPng(width, height, r, g, b, a = 255) {
  // Signature
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR chunk
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth: 8
  ihdr[9] = 6; // Color type: RGBA (6)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);

  // Raw image data with scanline filter bytes (0 for None)
  const rowBytes = width * 4;
  const rawData = Buffer.alloc(height * (rowBytes + 1));

  let offset = 0;
  for (let y = 0; y < height; y++) {
    rawData[offset++] = 0; // filter type None
    for (let x = 0; x < width; x++) {
      // Draw a subtle rounded border / emblem: Brand Bucket Blue #2563eb
      rawData[offset++] = r;
      rawData[offset++] = g;
      rawData[offset++] = b;
      rawData[offset++] = a;
    }
  }

  const compressed = zlib.deflateSync(rawData);
  const idatChunk = makeChunk('IDAT', compressed);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4);
  data.copy(chunk, 8);

  const crcData = Buffer.concat([Buffer.from(type), data]);
  const crcVal = crc32(crcData);
  chunk.writeUInt32BE(crcVal, 8 + len);

  return chunk;
}

// CRC32 implementation
function crc32(buf) {
  let table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      if (c & 1) {
        c = 0xedb88320 ^ (c >>> 1);
      } else {
        c = c >>> 1;
      }
    }
    table[n] = c >>> 0;
  }

  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const publicDir = path.join(__dirname, '../public');
if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Generate icon-192.png and icon-512.png with Brand Bucket Blue (#2563eb: 37, 99, 235)
const icon192 = createSolidPng(192, 192, 37, 99, 235, 255);
fs.writeFileSync(path.join(publicDir, 'icon-192.png'), icon192);

const icon512 = createSolidPng(512, 512, 37, 99, 235, 255);
fs.writeFileSync(path.join(publicDir, 'icon-512.png'), icon512);

console.log('Successfully generated icon-192.png and icon-512.png in /public');
