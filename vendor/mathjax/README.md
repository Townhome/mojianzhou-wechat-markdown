# MathJax 3.2.2

`tex-svg-full.js` is the unmodified full TeX/SVG component from the official
[`mathjax@3.2.2`](https://www.npmjs.com/package/mathjax/v/3.2.2) npm release:

https://registry.npmjs.org/mathjax/-/mathjax-3.2.2.tgz

Original archive path: `package/es5/tex-svg-full.js`.

SHA-256: `a4354ff94fd868aea0cc6eaaa79a57fda0588646fc46ee3700a349ee0a11cbe6`.

The component includes TeX extensions and SVG font paths. The editor explicitly
enables the bundled `boldsymbol` package and disables the SVG font cache, so its
supported formulas render offline and copied SVGs contain their own glyph paths.
Keep this directory when distributing or opening the editor locally.

MathJax is distributed under the Apache License 2.0; see [LICENSE](./LICENSE).
