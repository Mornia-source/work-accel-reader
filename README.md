# work-accel-reader

透明置顶、可鼠标穿透的桌面小说阅读器（Windows，Electron）。

## 功能

- **格式**：TXT（自动识别 UTF-8 / GBK / UTF-16 / Big5）、EPUB
- **外观**：背景颜色、文字颜色、背景不透明度与文字不透明度分开调节，字体、字号、行距
- **窗口**：始终置顶、鼠标穿透、无边框可拖动/缩放
- **阅读**：按行/按页翻动，窗口高度自动对齐整行；自动记住每本书的进度
- **章节**：TXT 自动识别“第X章”等标题，EPUB 读取自带目录；目录搜索、上一章/下一章
- **老板键**：一键隐藏窗口，连托盘图标一起消失
- **全局快捷键**：全部可在设置里自定义，自动检查冲突

## 默认快捷键

| 功能 | 快捷键 |
|---|---|
| 老板键 | `Alt+Q` |
| 下一行 / 上一行 | `Alt+↓` / `Alt+↑` |
| 下一页 / 上一页 | `Alt+PageDown` / `Alt+PageUp` |
| 下一章 / 上一章 | `Alt+]` / `Alt+[` |
| 目录 | `Alt+C` |
| 置顶 / 鼠标穿透 | `Alt+T` / `Alt+M` |
| 背景不透明度 − / + | `Alt+1` / `Alt+2` |
| 文字不透明度 − / + | `Alt+3` / `Alt+4` |
| 字号 − / + | `Alt+-` / `Alt+=` |
| 打开文件 / 设置 | `Alt+O` / `Alt+S` |

## 运行

需要 [Node.js](https://nodejs.org)。

双击 `启动测试.bat`：首次运行会自动安装依赖、生成测试小说，然后打开阅读器。

或手动：

```bash
npm install
npm start
```

测试文件可用 `node tools/make-sample.js`（GBK 编码长篇 TXT）和 `node tools/make-sample-epub.js` 生成到 `test/`。

## 打包

```bash
npm run dist
```

在 `dist/` 生成：

- `WorkAccelReader-<版本>-portable.exe`：单文件便携版，双击即用，适合直接发给别人
- `WorkAccelReader-<版本>-win-x64.zip`：解压版，启动更快

国内网络可先设置镜像：`ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/`、`ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/`。

## 结构

```
src/main/main.js        主进程：窗口、全局快捷键、老板键、IPC
src/main/textLoader.js  格式解析：所有格式统一输出 { paras, chapters }
src/main/trayMenu.js    自绘托盘右键菜单
src/main/store.js       配置持久化（%APPDATA%/work-accel-reader/config.json）
src/main/png.js         PNG 编码，生成托盘图标和打包图标
src/renderer/           阅读窗口、设置窗口、托盘菜单页面
tools/                  测试文件生成脚本
```
