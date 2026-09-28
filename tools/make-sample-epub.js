// 生成测试用 EPUB（EPUB2 结构，toc.ncx 目录 + 封面纯图片页）。用法：node tools/make-sample-epub.js
const path = require('path');
const AdmZip = require('adm-zip');

const zip = new AdmZip();
const add = (name, text) => zip.addFile(name, Buffer.from(text, 'utf8'));

add('mimetype', 'application/epub+zip');
add('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`);

const N = 30;
const items = [];
const refs = [];
const nav = [];
add('OEBPS/Text/cover.xhtml', '<html><body><div><img src="../cover.jpg"/></div></body></html>');
items.push('<item id="cover" href="Text/cover.xhtml" media-type="application/xhtml+xml"/>');
refs.push('<itemref idref="cover"/>');
for (let i = 1; i <= N; i++) {
  const body = Array.from({ length: 40 }, (_, k) =>
    `<p>这是第 ${i} 章的第 ${k + 1} 段。&ldquo;雾港的钟声&rdquo;又响了一次&hellip;&hellip;他数着台阶往下走，<ruby>渡<rt>dù</rt></ruby>口的灯一盏接一盏亮起来。</p>`
  ).join('\n');
  add(`OEBPS/Text/ch${i}.xhtml`, `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>c${i}</title><style>p{}</style></head>
<body><h2>第${i}章 雾港之${i}</h2>\n${body}</body></html>`);
  items.push(`<item id="c${i}" href="Text/ch${i}.xhtml" media-type="application/xhtml+xml"/>`);
  refs.push(`<itemref idref="c${i}"/>`);
  nav.push(`<navPoint id="n${i}" playOrder="${i}"><navLabel><text>第${i}章 雾港之${i}</text></navLabel><content src="Text/ch${i}.xhtml"/></navPoint>`);
}
add('OEBPS/toc.ncx', `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>${nav.join('')}</navMap></ncx>`);
add('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
  <metadata><dc:title xmlns:dc="http://purl.org/dc/elements/1.1/">测试 EPUB</dc:title></metadata>
  <manifest>${items.join('')}<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest>
  <spine toc="ncx">${refs.join('')}</spine>
</package>`);

const file = path.join(__dirname, '..', 'test', 'sample.epub');
zip.writeZip(file);
console.log('已生成 ' + file);
