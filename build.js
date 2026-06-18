/**
 * 把 index.html + css + js 内联成一个独立的 HTML 文件，输出到 dist/color-lines.html。
 * 这样可以直接微信/邮件发给爸爸，双击即玩，不用管文件夹和相对路径。
 *
 * 用法: node build.js
 */
const fs = require('fs');
const path = require('path');

const root = __dirname;
let html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

// 内联 CSS: <link rel="stylesheet" href="css/styles.css" />
html = html.replace(/<link\s+rel="stylesheet"\s+href="([^"]+)"\s*\/?>/g, (m, href) => {
  const css = fs.readFileSync(path.join(root, href), 'utf8');
  return `<style>\n${css}\n</style>`;
});

// 内联 JS: <script src="js/xxx.js"></script>
html = html.replace(/<script\s+src="([^"]+)"><\/script>/g, (m, src) => {
  const js = fs.readFileSync(path.join(root, src), 'utf8');
  return `<script>\n${js}\n</script>`;
});

const outDir = path.join(root, 'dist');
fs.mkdirSync(outDir, { recursive: true });
// 两个同样内容的单文件：
//  - color-lines.html：发给爸爸双击玩
//  - index.html：直接丢到服务器目录即可访问
const giftFile = path.join(outDir, 'color-lines.html');
const siteFile = path.join(outDir, 'index.html');
fs.writeFileSync(giftFile, html, 'utf8');
fs.writeFileSync(siteFile, html, 'utf8');

const kb = (fs.statSync(giftFile).size / 1024).toFixed(1);
console.log(`已生成单文件 (${kb} KB):`);
console.log(`  ${giftFile}   ← 发给爸爸，双击就能玩`);
console.log(`  ${siteFile}   ← 丢到服务器目录即可访问`);
