// 运行时生成 16x16 托盘图标 PNG，免得仓库里放二进制资源
const zlib = require('zlib');
const { nativeImage } = require('electron');

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

// 深灰方块 + 三条浅色“文字行”
function createTrayIcon() {
  const S = 16;
  const rows = [];
  for (let y = 0; y < S; y++) {
    const row = [0];
    for (let x = 0; x < S; x++) {
      const border = x === 0 || y === 0 || x === S - 1 || y === S - 1;
      const line = (y === 4 || y === 8 || y === 12) && x >= 3 && x <= (y === 12 ? 9 : 12);
      if (line) row.push(230, 230, 230, 255);
      else if (border) row.push(120, 120, 120, 255);
      else row.push(40, 40, 40, 255);
    }
    rows.push(Buffer.from(row));
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.concat(rows))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return nativeImage.createFromBuffer(png);
}

module.exports = { createTrayIcon };
