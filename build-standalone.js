/* build-standalone.js — 모든 CSS와 JS를 index.html 하나로 합칩니다.
   사용법: node build-standalone.js   →   dist/index.html 생성 */
const fs = require('fs'), path = require('path');
const base = __dirname;
const read = p => fs.readFileSync(path.join(base, p), 'utf8');

let html = read('index.html');
const css = read('css/styles.css');
const js = ['store.js', 'charts.js', 'reports.js', 'app.js'].map(f => read('js/' + f)).join('\n');

html = html.replace('<link rel="stylesheet" href="css/styles.css">', '<style>\n' + css + '\n</style>');
['store', 'charts', 'reports', 'app'].forEach(f => {
  html = html.replace('<script src="js/' + f + '.js"></script>\n', '');
});
html = html.replace("<script>\nif ('serviceWorker'", '<script>\n' + js + "\nif ('serviceWorker'");

fs.mkdirSync(path.join(base, 'dist'), { recursive: true });
fs.writeFileSync(path.join(base, 'dist/index.html'), html);
console.log('dist/index.html 생성 완료 —', Buffer.byteLength(html), 'bytes');
