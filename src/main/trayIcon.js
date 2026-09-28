// 运行时生成托盘图标，免得仓库里放二进制资源
const { nativeImage } = require('electron');
const { drawAppIcon } = require('./png');

function createTrayIcon() {
  return nativeImage.createFromBuffer(drawAppIcon(16));
}

module.exports = { createTrayIcon };
