const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const localImage = fs.readFileSync(path.join(root, 'examples', 'images', 'transfomer.jpg'));
const dataUrl = `data:image/jpeg;base64,${localImage.toString('base64')}`;
const indexPath = path.join(root, 'index.html');
const originalHtml = fs.readFileSync(indexPath, 'utf8');
const bundlePattern = /(    const bundledExampleImage = ')[^']*(';)/;
if (!bundlePattern.test(originalHtml)) throw new Error('Bundled example image declaration not found');
const html = originalHtml.replace(bundlePattern, (_, before, after) => `${before}${dataUrl}${after}`);
if (html !== originalHtml) fs.writeFileSync(indexPath, html, 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const application = scripts.at(-1)?.[1];
if (!application) throw new Error('Application script not found');
const renderer = application.split('    const themeGrid =')[0];
const { themeSpecs, themes, renderArticle, sampleMarkdown, imageAssets } = vm.runInNewContext(
  `${renderer}\n({ themeSpecs, themes, renderArticle, sampleMarkdown, imageAssets })`,
  { window: {}, URL, console }
);
if (imageAssets.get('images/transfomer.jpg') !== dataUrl) throw new Error('Bundled image not initialized');

const examples = path.join(root, 'examples');
const fragments = path.join(root, 'themes');
fs.mkdirSync(examples, { recursive: true });
fs.mkdirSync(fragments, { recursive: true });
fs.writeFileSync(path.join(examples, 'example.md'), `${sampleMarkdown}\n`, 'utf8');

const specimen = sampleMarkdown.split('## 02｜')[0].trim();
for (const spec of themeSpecs) {
  const article = renderArticle(sampleMarkdown, themes[spec.key]);
  fs.writeFileSync(path.join(fragments, `${spec.number}-${spec.key}.html`), article + '\n', 'utf8');
}

const cards = themeSpecs.map(spec => {
  const theme = themes[spec.key];
  const article = renderArticle(specimen, theme).replace('id="rendered-article"', 'class="atlas-article"');
  return `<article class="atlas-card" id="theme-${spec.key}">
    <div class="atlas-card-head"><div class="palette-bar"><span style="background:${theme.pair[0]}"></span><span style="background:${theme.pair[1]}"></span></div><div><small>THEME ${spec.number} / 09</small><h2>${spec.name}</h2><p>${spec.english}</p></div></div>
    <div class="atlas-sheet">${article}</div>
  </article>`;
}).join('\n');

const atlas = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>九套主题对照 · 墨笺舟</title>
  <style>
    * { box-sizing:border-box; }
    body { margin:0;background:#eae8e1;color:#1b2429;font-family:system-ui,-apple-system,'Microsoft YaHei',sans-serif; }
    a { color:inherit;text-underline-offset:4px; }
    .atlas { width:min(1500px,calc(100% - 48px));margin:auto;padding:35px 0 70px; }
    .masthead { display:flex;justify-content:space-between;align-items:flex-end;gap:20px;border-top:5px solid #1b2429;border-bottom:1px solid #a9ada9;padding:18px 0 24px; }
    .masthead small,.intro small,.atlas-card-head small { font-size:11px;font-weight:800;letter-spacing:.15em; }
    .masthead h1 { margin:9px 0 0;font-family:Georgia,'Songti SC',serif;font-size:clamp(36px,5vw,68px);line-height:1.1; }
    .masthead b { color:#aeb2ac;font-family:Georgia,serif;font-size:clamp(70px,10vw,140px);line-height:.8; }
    .intro { display:flex;justify-content:space-between;gap:20px;align-items:center;padding:18px 0 26px; }
    .intro p { max-width:680px;margin:8px 0 0;color:#5e6769;font-size:13px;line-height:1.7; }
    .intro a { flex:none;font-size:13px;font-weight:700; }
    .atlas-grid { display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:40px 25px; }
    .atlas-card { min-width:0; }
    .atlas-card-head { display:flex;align-items:center;gap:13px;min-height:80px; }
    .palette-bar { display:flex;flex:none;width:40px;height:55px;border:1px solid #bbb; }
    .palette-bar span { flex:1; }
    .atlas-card-head h2 { margin:3px 0 1px;font-family:Georgia,'Songti SC',serif;font-size:21px; }
    .atlas-card-head p { margin:0;color:#697274;font-size:11px; }
    .atlas-sheet { border:1px solid #cdd0ca;box-shadow:0 13px 28px rgba(24,36,40,.09); }
    .atlas-article { width:100%; }
    @media(max-width:1050px){.atlas-grid{grid-template-columns:repeat(2,minmax(0,1fr));}}
    @media(max-width:680px){.atlas{width:calc(100% - 28px);padding-top:16px}.masthead b{display:none}.intro{display:block}.intro a{display:inline-block;margin-top:12px}.atlas-grid{grid-template-columns:1fr}}
  </style>
</head>
<body>
  <main class="atlas">
    <header class="masthead"><div><small>墨笺舟 / WECHAT ARTICLE THEMES</small><h1>九种颜色，九种叙事。</h1></div><b aria-hidden="true">09</b></header>
    <div class="intro"><div><small>同一篇论文分享 · 九种风格</small><p>主题只改变外观，不改动 Markdown 内容。选择适合公众号文章的配色，再回到墨笺舟工作台继续排版。</p></div><a href="index.html">打开墨笺舟 ↗</a></div>
    <section class="atlas-grid" aria-label="九套主题对照">${cards}</section>
  </main>
</body>
</html>
`;
fs.writeFileSync(path.join(root, 'theme-atlas.html'), atlas, 'utf8');
console.log(`Generated example, ${themeSpecs.length} theme fragments, and atlas.`);
