// Turns dist/index.html into dist/artifact.html for hosting as a claude.ai
// Artifact: the host supplies <html>/<head>/<body>, so emit only the title,
// the stylesheet, the body markup and the module script (relative paths).
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';

const html = readFileSync('dist/index.html', 'utf8');
const css = html.match(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+)"/)[1];
const js = html.match(/<script type="module"[^>]*src="\.?\/?(assets\/[^"]+)"/)[1];
const body = html.match(/<body>([\s\S]*)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
writeFileSync('dist/artifact.html', `<title>Scurry</title>
<link rel="stylesheet" href="${css}">
${body}
<script type="module" src="${js}"></script>
`);
const files = Object.fromEntries(readdirSync('dist/assets').map(f => [`assets/${f}`, `dist/assets/${f}`]));
writeFileSync('dist/artifact-files.json', JSON.stringify(files, null, 2));
console.log(`dist/artifact.html + ${Object.keys(files).length} asset files`);
