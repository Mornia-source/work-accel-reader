// 生成打包用图标 build/icon.png（256x256，electron-builder 会自动转成 .ico）
const fs = require('fs');
const path = require('path');
const { drawAppIcon } = require('../src/main/png');

const dir = path.join(__dirname, '..', 'build');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'icon.png'), drawAppIcon(256));
console.log('已生成 build/icon.png');
