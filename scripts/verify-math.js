const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)];
const configuration = scripts[0][1];
const application = scripts.at(-1)[1];
const engine = fs.readFileSync(path.join(root, 'vendor/mathjax/tex-svg-full.js'), 'utf8');
const formula = String.raw`\psi(\mathbf z)=W_d^\top(\mathbf z-\boldsymbol\mu).`;
const screenshotMarkdown = String.raw`若把选出的 $d$ 个方向排成矩阵 $W_d$，对新状态的压缩可以写为：

$$
${formula}
$$

样本均值 $\boldsymbol\mu$ 用于中心化新观测，映射 $\psi$ 将高维特征 $\mathbf z$ 转成沿这 $d$ 个方向的坐标。`;

function createPage() {
  // outside-only runs the real bundled engine while keeping this check offline.
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  const { window } = dom;
  const copied = [];
  const downloads = [];
  window.ClipboardItem = class {
    constructor(data) { this.data = data; }
  };
  Object.defineProperty(window.navigator, 'clipboard', {
    value: { write: async items => { copied.push(items); } }
  });
  window.URL.createObjectURL = blob => {
    downloads.push(blob);
    return 'blob:https://example.test/article';
  };
  window.URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {};
  window.eval(configuration);
  window.eval(`${application}\nwindow.testRenderer = { themeSpecs, themes, renderArticle, sampleMarkdown };`);
  return { dom, window, copied, downloads };
}

function readBlob(window, blob) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });
}

function assertRenderedFormula(article, label) {
  assert.equal(article.querySelector('[data-math-pending]'), null, `${label}: TeX fallback remains`);
  assert.equal(article.querySelector('[data-mjx-error]'), null, `${label}: MathJax error remains`);
  const svgs = article.querySelectorAll('svg');
  assert.equal(svgs.length, 5, `${label}: screenshot formulas missing`);
  for (const svg of svgs) {
    assert.ok(svg.querySelector('path'), `${label}: SVG has no glyph paths`);
    assert.equal(svg.querySelector('use'), null, `${label}: SVG depends on a shared font cache`);
    assert.equal(svg.style.fontSize, '1em', `${label}: formula no longer inherits text size`);
  }
  assert.equal(article.querySelector('.equation-scroll').style.overflowX, 'auto');
  assert.equal(article.querySelector('.inline-equation-scroll').style.overflowX, 'auto');
}

async function main() {
  const page = createPage();
  const { dom, window, copied, downloads } = page;
  try {
    const script = window.document.getElementById('MathJax-script');
    assert.equal(script.getAttribute('src'), 'vendor/mathjax/tex-svg-full.js');
    assert.equal(script.defer, true);
    window.document.getElementById('markdown-input').value = screenshotMarkdown;
    window.render();
    assert.ok(window.document.querySelector('[data-math-pending]'), 'initial formula should wait for the engine');

    const copying = window.copyArticle();
    window.document.getElementById('download-button').click();
    assert.equal(copied.length, 0, 'copy exported raw TeX before the engine was ready');
    assert.equal(downloads.length, 0, 'download exported raw TeX before the engine was ready');

    window.eval(engine);
    await window.mathJaxReady;
    await copying;
    assert.equal(window.MathJax.version, '3.2.2');
    assertRenderedFormula(window.document.getElementById('rendered-article'), 'startup refresh');
    assert.equal(copied.length, 1);
    assert.equal(downloads.length, 1);
    const copiedHtml = await readBlob(window, copied[0][0].data['text/html']);
    const downloadedHtml = await readBlob(window, downloads[0]);
    for (const exported of [copiedHtml, downloadedHtml]) {
      assert.match(exported, /<svg/);
      assert.match(exported, /<path/);
      assert.ok(!/data-math-pending|data-mjx-error|\\boldsymbol|\\mathbf|\\psi/.test(exported), 'export contains unrendered TeX');
    }

    const api = window.testRenderer;
    for (const spec of api.themeSpecs) {
      const container = window.document.createElement('div');
      container.innerHTML = api.renderArticle(screenshotMarkdown, api.themes[spec.key]);
      assertRenderedFormula(container, spec.key);
      const saved = fs.readFileSync(path.join(root, 'themes', `${spec.number}-${spec.key}.html`), 'utf8').replace(/\r\n/g, '\n').trim();
      assert.ok(!/data-math-pending|data-mjx-error/.test(saved), `${spec.key}: sample contains unfinished formulas`);
      assert.equal(saved, api.renderArticle(api.sampleMarkdown, api.themes[spec.key]).trim(), `${spec.key}: fragment out of date; run npm run build`);
    }
    for (const tex of [String.raw`\boldsymbol{\mu}`, String.raw`\frac{a}{b}`, String.raw`\begin{aligned}a&=b+c\\d&=e\end{aligned}`]) {
      const node = window.MathJax.tex2svg(tex, { display: true });
      assert.ok(node.querySelector('svg path'), `${tex}: no SVG glyphs`);
      assert.equal(node.querySelector('[data-mjx-error]'), null, `${tex}: MathJax error`);
    }
    const plainMu = window.MathJax.tex2svg(String.raw`\mu`).querySelector('path').getAttribute('data-c');
    const boldMu = window.MathJax.tex2svg(String.raw`\boldsymbol\mu`).querySelector('path').getAttribute('data-c');
    assert.notEqual(boldMu, plainMu, 'boldsymbol mu rendered as a normal-weight mu');
    assert.equal(window.document.querySelectorAll('script[src]').length, 1, 'engine tried to load an external extension');

    window.document.getElementById('markdown-input').value = String.raw`$\notARealMathCommand$`;
    window.render();
    assert.ok(window.document.querySelector('[data-mjx-error]'), 'invalid command should be visible as an error');
    await window.copyArticle();
    assert.equal(copied.length, 1, 'copy should stop when a formula has an error');
  } finally {
    dom.window.close();
  }

  const failed = createPage();
  try {
    failed.window.document.getElementById('markdown-input').value = screenshotMarkdown;
    failed.window.render();
    const copying = failed.window.copyArticle();
    failed.window.mathJaxLoadFailed();
    await copying;
    assert.equal(failed.copied.length, 0, 'failed engine exported raw TeX');
    assert.match(failed.window.document.getElementById('copy-status').textContent, /公式加载失败/);
    failed.window.document.getElementById('markdown-input').value = '没有公式的普通正文';
    failed.window.render();
    await failed.window.copyArticle();
    assert.equal(failed.copied.length, 1, 'engine failure should not prevent copying articles without formulas');
  } finally {
    failed.dom.window.close();
  }
  console.log('Real offline MathJax: screenshot formulas, bold Greek glyphs, nine themes, startup refresh, copy/download readiness, and load failures verified.');
}

const timeout = setTimeout(() => {
  console.error('Formula verification timed out before MathJax became ready.');
  process.exit(1);
}, 10000);

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => clearTimeout(timeout));
