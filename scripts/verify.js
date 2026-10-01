const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const application = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(application, 'application script missing');
new vm.Script(application);
const renderer = application.split('    const themeGrid =')[0];
const api = vm.runInNewContext(
  `${renderer}\n({ themeSpecs, themes, renderArticle, imageAssets, setDirectory: value => { markdownDirectory = value; }, sampleMarkdown })`,
  { window: {}, URL, console }
);

assert.equal(api.themeSpecs.length, 9);
assert.equal(new Set(api.themeSpecs.map(theme => theme.key)).size, 9);
assert.match(html, /墨笺舟/);
assert.match(html, /微信公众号 Markdown 排版/);
assert.ok(!/EvoDiary|oykc1234|Kaichen Ouyang|科研日记/i.test(html), 'personal content remains in application');
assert.ok(!/EvoDiary|oykc1234|Kaichen Ouyang|科研日记/i.test(api.sampleMarkdown), 'personal content remains in example');
assert.match(html, /\.article-frame \{ width:min\(100%,680px\)/, 'preview width should match the publishing layout');
const exampleImage = fs.readFileSync(path.join(root, 'examples', 'images', 'transfomer.jpg'));
assert.match(exampleImage.subarray(0, 3).toString('hex'), /^ffd8ff$/, 'local example image is not a JPEG');
assert.equal(api.imageAssets.get('images/transfomer.jpg'), `data:image/jpeg;base64,${exampleImage.toString('base64')}`,
  'opening index.html must preload the example image');

for (const spec of api.themeSpecs) {
  const theme = api.themes[spec.key];
  const rendered = api.renderArticle(api.sampleMarkdown, theme);
  assert.match(rendered, /id="rendered-article"/);
  for (const element of ['<h1', '<h2', '<h3', '<h4', '<blockquote', '<table', '<pre', '<img', '<strong', '<em']) {
    assert.ok(rendered.includes(element), `${spec.key}: ${element} missing`);
  }
  assert.match(rendered, /<img src="data:image\/jpeg;base64,/);
  assert.match(rendered, /图 1｜Transformer 总体结构/);
  assert.match(rendered, /CODE \/ PYTHON/);
  assert.ok(!rendered.includes('CODE / MATH'), `${spec.key}: math fence displayed as code`);
  assert.ok(!rendered.includes('undefined'), `${spec.key}: undefined style value`);
  assert.ok(rendered.includes(theme.accent), `${spec.key}: theme accent missing`);
  const saved = fs.readFileSync(path.join(root, 'themes', `${spec.number}-${spec.key}.html`), 'utf8').trim();
  assert.equal(saved, rendered.trim(), `${spec.key}: fragment out of date; run npm run build`);
}

const theme = api.themes.archive;
const coralCover = api.renderArticle('# 论文分享｜Attention Is All You Need', api.themes.coral);
assert.match(coralCover, /font-size:30px/);
assert.ok(!/font-size:33px;[^\"]*font-size:30px/.test(coralCover), 'Coral Signal title has conflicting font sizes');
assert.match(coralCover, /━━━━　━　━/, 'Coral Signal decoration should survive rich-text copying');
assert.ok(!/<i style="width:52px;height:5px/.test(coralCover), 'Coral Signal still uses empty decorative elements');
api.imageAssets.clear();
api.setDirectory('examples');
api.imageAssets.set('examples/images/transfomer.jpg', `data:image/jpeg;base64,${exampleImage.toString('base64')}`);
assert.match(api.renderArticle(api.sampleMarkdown, theme), /<img src="data:image\/jpeg;base64,/,
  'folder import path does not resolve the example image');
api.setDirectory('article');
api.imageAssets.set('article/images/photo.png', 'data:image/png;base64,AAAA');
const local = api.renderArticle('![本地照片](images/photo.png)', theme);
assert.match(local, /<img src="data:image\/png;base64,AAAA" alt="本地照片"/);
assert.ok(!local.includes('未找到图片'));
const missing = api.renderArticle('![缺失图片](missing.png)', theme);
assert.match(missing, /未找到图片：missing\.png/);
const online = api.renderArticle('![在线图片](https://placehold.co/640x360/png?text=Online+Image)', theme);
assert.match(online, /<img src="https:\/\/placehold\.co\/640x360\/png\?text=Online\+Image"/);
const mathFence = api.renderArticle('```math\n\\frac{a}{b}\n```', theme);
assert.ok(!mathFence.includes('CODE / MATH'));
assert.ok(!mathFence.includes('<pre'));
assert.match(mathFence, /\\frac\{a\}\{b\}/);
const plainCode = api.renderArticle('```text\n$x$\n```', theme);
assert.match(plainCode, /CODE \/ TEXT[\s\S]*<code>\$x\$<\/code>/);
const malicious = api.renderArticle('![图片](javascript:alert(1))', theme);
assert.ok(!malicious.includes('<img src="javascript:'));
assert.ok(!api.renderArticle('<script>alert(1)</script>', theme).includes('<script>'));

const atlas = fs.readFileSync(path.join(root, 'theme-atlas.html'), 'utf8');
assert.equal((atlas.match(/class="atlas-card"/g) || []).length, 9);
assert.ok(!atlas.includes('id="rendered-article"'));
assert.ok(fs.existsSync(path.join(root, 'examples', 'example.md')));
assert.match(fs.readFileSync(path.join(root, 'examples', 'example.md'), 'utf8'), /images\/transfomer\.jpg/);
console.log('Nine themes, Markdown elements, online and local images, escaping, and generated files verified.');
