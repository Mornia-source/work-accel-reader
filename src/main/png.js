// 极简 RGBA PNG 编码器（纯 Node，无 electron 依赖，打包图标脚本也能用）
const zlib = require('zlib');

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

// pixel(x, y) 返回 [r, g, b, a]
function encodePng(width, height, pixel) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 4); // 行首 filter 字节 = 0
    for (let x = 0; x < width; x++) row.set(pixel(x, y), 1 + x * 4);
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// 应用图标：深灰底 + 边框 + 三条“文字行”，按尺寸等比绘制
function drawAppIcon(size) {
  const u = size / 16; // 以 16px 设计稿为单位
  const border = Math.max(1, Math.round(size / 64));
  const lines = [4, 8, 12].map((row, i) => ({
    y0: Math.round(row * u),
    y1: Math.round(row * u) + Math.max(1, Math.round(u)),
    x0: Math.round(3 * u),
    x1: Math.round((i === 2 ? 10 : 13) * u),
  }));
  return encodePng(size, size, (x, y) => {
    if (lines.some((l) => y >= l.y0 && y < l.y1 && x >= l.x0 && x < l.x1)) return [230, 230, 230, 255];
    if (x < border || y < border || x >= size - border || y >= size - border) return [120, 120, 120, 255];
    return [40, 40, 40, 255];
  });
}

module.exports = { encodePng, drawAppIcon };
