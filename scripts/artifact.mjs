// Turns dist/index.html into dist/artifact.html for hosting as a claude.ai
// Artifact: the host supplies <html>/<head>/<body>, so emit only the title,
// the stylesheet, the body markup and the module script (relative paths).
//
// It also writes dist/artifact-files.json: the complete `files` map to publish,
// every built asset plus `null` for each asset the previous publish had that
// this build no longer emits. Publishing that whole map (never a hand-picked
// subset) keeps the page and its hashed assets in step. A hand-picked publish
// once shipped a page whose stylesheet (a new CSS hash) was never uploaded.
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const css = html.match(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+)"/)[1];
const js = html.match(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+)"/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
writeFileSync('dist/artifact.html', `<title>Scurry</title>
<link rel="stylesheet" href="${css}">
${body}
<script type="module" src="${js}"></script>
`);

const now = readdirSync('dist/assets').map(f => `assets/${f}`);
const files = Object.fromEntries(now.map(p => [p, `dist/${p}`]));
for (const p of [css, js]) if (!files[p]) throw new Error(`artifact.html references ${p}, which the build did not emit`);
// Remove what the last publish had and this build doesn't.
const LEDGER = 'scripts/artifact-published.json';
const before = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : [];
const stale = before.filter(p => !files[p]);
for (const p of stale) files[p] = null;
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 2));
writeFileSync(LEDGER, JSON.stringify(now.sort(), null, 2) + '\n');
console.log(`dist/artifact.html · ${now.length} assets to publish, ${stale.length} stale to remove · css ${css} · js ${js}`);
