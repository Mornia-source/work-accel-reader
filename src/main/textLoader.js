// 格式解析层：任何格式最终都输出 string[] 段落。以后加 EPUB/PDF 只需在 PARSERS 里加一项
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');

function decodeText(buf) {
  if (buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) return buf.subarray(3).toString('utf8');
  if (buf[0] === 0xff && buf[1] === 0xfe) return iconv.decode(buf.subarray(2), 'utf16le');
  if (buf[0] === 0xfe && buf[1] === 0xff) return iconv.decode(buf.subarray(2), 'utf16be');

  // 先严格按 UTF-8 解，失败再猜；中文小说里失败的基本都是 GBK
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {}
  const guess = jschardet.detect(buf.subarray(0, 64 * 1024));
  const enc = guess.encoding && /big5/i.test(guess.encoding) ? 'big5' : 'gb18030';
  return iconv.decode(buf, enc);
}

function parseTxt(filePath) {
  const text = decodeText(fs.readFileSync(filePath));
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^[\s　]+|\s+$/g, ''))
    .filter((l) => l.length > 0);
}

const PARSERS = {
  '.txt': parseTxt,
};

const SUPPORTED_EXTS = Object.keys(PARSERS).map((e) => e.slice(1));

function load(filePath) {
  const parser = PARSERS[path.extname(filePath).toLowerCase()];
  if (!parser) throw new Error('暂不支持该格式：' + path.extname(filePath));
  return parser(filePath);
}

module.exports = { load, SUPPORTED_EXTS };
