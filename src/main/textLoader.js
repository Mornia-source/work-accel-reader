// 格式解析层：任何格式最终都输出 { paras: string[], chapters: [{ title, para }] }
// 以后加格式只需在 PARSERS 里加一项
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');
const jschardet = require('jschardet');
const AdmZip = require('adm-zip');

// ---------- 通用 ----------

function cleanLines(text) {
  return text
    .split(/\r\n|\r|\n/)
    .map((l) => l.replace(/^[\s　]+|[\s　]+$/g, ''))
    .filter((l) => l.length > 0);
}

// 常见网文章节标题：第十二章 / 第12回 / 卷三 / 序章 / 楔子 / Chapter 5 …
const CHAPTER_RE = new RegExp(
  '^(' +
    '第[0-9零〇一二两三四五六七八九十百千万]+[章节回卷集部篇幕]' +
    '|卷[0-9零〇一二三四五六七八九十百千]+' +
    '|(序章|序言|序|楔子|引子|前言|后记|尾声|终章|番外|完本感言)([\\s　:：·—-]|$)' +
    '|chapter\\s*[0-9ivxlc]+' +
    ')',
  'i'
);

function detectChapters(paras) {
  const chapters = [];
  paras.forEach((p, i) => {
    if (p.length <= 40 && CHAPTER_RE.test(p)) chapters.push({ title: p, para: i });
  });
  return chapters;
}

// ---------- TXT ----------

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
  const paras = cleanLines(decodeText(fs.readFileSync(filePath)));
  return { paras, chapters: detectChapters(paras) };
}

// ---------- EPUB ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…', mdash: '—', ndash: '–', middot: '·' };

function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function htmlToText(html) {
  const body = (html.match(/<body[^>]*>([\s\S]*)<\/body>/i) || [, html])[1];
  return decodeEntities(
    body
      .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<rt[^>]*>[\s\S]*?<\/rt>/gi, '') // 注音
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|article)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
}

const attr = (tag, name) => {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i'));
  return m ? m[2] ?? m[3] : null;
};

// zip 内相对路径解析，去掉 #锚点
function resolveHref(baseDir, href) {
  const clean = decodeURIComponent(href.split('#')[0]);
  return path.posix.normalize(path.posix.join(baseDir, clean)).replace(/^\.\//, '');
}

function readEntry(zip, name) {
  const e = zip.getEntry(name) || zip.getEntries().find((x) => x.entryName.toLowerCase() === name.toLowerCase());
  return e ? e.getData().toString('utf8') : null;
}

// 从 toc.ncx（EPUB2）或 nav.xhtml（EPUB3）读出 文件路径 → 标题
function readTocTitles(zip, opfDir, manifest, opf) {
  const titles = new Map();
  const add = (href, title, dir) => {
    const key = resolveHref(dir, href);
    title = decodeEntities(title.replace(/<[^>]+>/g, '')).trim();
    if (title && !titles.has(key)) titles.set(key, title);
  };

  const navItem = [...manifest.values()].find((m) => /(^|\s)nav(\s|$)/.test(m.properties || ''));
  if (navItem) {
    const html = readEntry(zip, navItem.path);
    const dir = path.posix.dirname(navItem.path);
    const toc = html && (html.match(/<nav[^>]*toc[^>]*>([\s\S]*?)<\/nav>/i) || [, html])[1];
    if (toc) for (const m of toc.matchAll(/<a\s[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) add(m[1], m[2], dir);
  }
  if (!titles.size) {
    const spineTag = opf.match(/<spine[^>]*>/i);
    const ncxId = spineTag && attr(spineTag[0], 'toc');
    const ncxItem = (ncxId && manifest.get(ncxId)) || [...manifest.values()].find((m) => /ncx/.test(m.mediaType));
    const ncx = ncxItem && readEntry(zip, ncxItem.path);
    if (ncx) {
      const dir = path.posix.dirname(ncxItem.path);
      for (const m of ncx.matchAll(/<navPoint[\s\S]*?<text>([\s\S]*?)<\/text>[\s\S]*?<content[^>]*src\s*=\s*["']([^"']+)["']/gi)) add(m[2], m[1], dir);
    }
  }
  return titles;
}

function parseEpub(filePath) {
  const zip = new AdmZip(filePath);
  const container = readEntry(zip, 'META-INF/container.xml');
  const rootTag = container && container.match(/<rootfile\s[^>]*>/i);
  const opfPath = rootTag && attr(rootTag[0], 'full-path');
  const opf = opfPath && readEntry(zip, opfPath);
  if (!opf) throw new Error('EPUB 结构损坏（找不到 OPF）');
  const opfDir = path.posix.dirname(opfPath);

  const manifest = new Map();
  for (const m of opf.matchAll(/<item\s[^>]*>/gi)) {
    const id = attr(m[0], 'id');
    const href = attr(m[0], 'href');
    if (id && href) {
      manifest.set(id, {
        path: resolveHref(opfDir, href),
        mediaType: attr(m[0], 'media-type') || '',
        properties: attr(m[0], 'properties') || '',
      });
    }
  }
  const titles = readTocTitles(zip, opfDir, manifest, opf);

  const paras = [];
  const chapters = [];
  for (const m of opf.matchAll(/<itemref\s[^>]*>/gi)) {
    const item = manifest.get(attr(m[0], 'idref'));
    if (!item || !/html|xml/.test(item.mediaType)) continue;
    const html = readEntry(zip, item.path);
    if (!html) continue;
    const lines = cleanLines(htmlToText(html));
    if (!lines.length) continue; // 纯图片页（封面、插图）
    const title = titles.get(item.path);
    if (title) chapters.push({ title, para: paras.length });
    paras.push(...lines);
  }
  // 没有目录文件的 EPUB 退回到正则识别
  return { paras, chapters: chapters.length ? chapters : detectChapters(paras) };
}

// ---------- 入口 ----------

const PARSERS = {
  '.txt': parseTxt,
  '.epub': parseEpub,
};

const SUPPORTED_EXTS = Object.keys(PARSERS).map((e) => e.slice(1));

function load(filePath) {
  const parser = PARSERS[path.extname(filePath).toLowerCase()];
  if (!parser) throw new Error('暂不支持该格式：' + path.extname(filePath));
  return parser(filePath);
}

module.exports = { load, SUPPORTED_EXTS };
