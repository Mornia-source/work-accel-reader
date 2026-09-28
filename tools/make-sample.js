// 生成测试用长篇 TXT（GBK 编码，顺带测编码识别）。用法：node tools/make-sample.js
const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

let seed = 20260928;
const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];

const people = ['林舟', '沈砚', '顾晚', '陆明川', '许青禾', '老周', '阿满', '宋先生'];
const places = ['渡口', '旧书铺', '城西的茶馆', '山脚的驿站', '河堤', '钟楼下', '码头仓库', '后院的槐树下'];
const times = ['清晨', '午后', '黄昏时分', '入夜以后', '雨停的时候', '第三天傍晚', '天刚蒙蒙亮'];
const weather = ['细雨一直没停', '风从河面上吹过来', '天阴得厉害', '日头晒得石板发烫', '雾气沿着街巷慢慢散开', '远处传来几声闷雷'];
const actions = [
  '把那封信又读了一遍，折好放回怀里',
  '站在门口犹豫了很久，终于还是推门进去',
  '端起茶碗，却一口也没有喝',
  '低头数着台阶，一共十七级',
  '把账本翻到最后一页，那里夹着一张褪色的车票',
  '沿着墙根走了半条街，确认身后没有人跟着',
  '把灯芯拨亮了一些，屋里的影子跟着晃动',
  '在地图上画了一个圈，又用指甲把它划掉',
];
const thoughts = [
  '有些事情，越是想弄清楚，就越是模糊。',
  '他忽然意识到，这条路自己走过不止一次。',
  '答案也许早就摆在眼前，只是没人愿意承认。',
  '那天晚上说过的话，如今一句也对不上了。',
  '等待本身并不难，难的是不知道在等什么。',
  '所有人都在说谎，只是理由各不相同。',
];
const lines = [
  '“你来晚了。”',
  '“东西带来了吗？”',
  '“我只问一句，那天你在不在场？”',
  '“别回头，往前走。”',
  '“这件事到此为止，谁也别再提。”',
  '“你真以为他会回来？”',
  '“再等一天，就一天。”',
];

function paragraph() {
  const n = 3 + Math.floor(rand() * 5);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const r = rand();
    if (r < 0.3) parts.push(`${pick(times)}，${pick(weather)}。`);
    else if (r < 0.65) parts.push(`${pick(people)}在${pick(places)}${pick(actions)}。`);
    else if (r < 0.85) parts.push(pick(thoughts));
    else parts.push(`${pick(people)}说：${pick(lines)}`);
  }
  return '　　' + parts.join('');
}

const cn = (n) => {
  const d = '零一二三四五六七八九';
  if (n < 10) return d[n];
  if (n < 20) return '十' + (n % 10 ? d[n % 10] : '');
  if (n < 100) return d[Math.floor(n / 10)] + '十' + (n % 10 ? d[n % 10] : '');
  return d[Math.floor(n / 100)] + '百' + (n % 100 === 0 ? '' : n % 100 < 10 ? '零' + d[n % 10] : cn(n % 100).replace(/^十/, '一十'));
};

const out = ['测试长篇《雾港旧事》', ''];
for (let c = 1; c <= 120; c++) {
  out.push(`第${cn(c)}章　${pick(places)}`, '');
  const paras = 25 + Math.floor(rand() * 15);
  for (let p = 0; p < paras; p++) out.push(paragraph(), '');
}
const text = out.join('\r\n');
const file = path.join(__dirname, '..', 'test', 'sample-novel.txt');
fs.writeFileSync(file, iconv.encode(text, 'gbk'));
console.log(`已生成 ${file}，约 ${text.replace(/\s/g, '').length} 字`);
