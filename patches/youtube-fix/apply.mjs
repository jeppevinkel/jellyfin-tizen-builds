// patches/youtube-fix/apply.mjs
// Usage: node apply.mjs <jellyfin-tizen-dir> <port>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.argv[2];
const port = process.argv[3] ?? '8123';
if (!root || !fs.existsSync(path.join(root, 'config.xml'))) {
    console.error('::error::Invalid jellyfin-tizen dir (config.xml not found): ' + root);
    process.exit(1);
}
const here = path.dirname(fileURLToPath(import.meta.url));

// ── 1. Patch youtubePlayer-plugin chunks (PatchPluginAsync) ──────────────
const inject = fs.readFileSync(path.join(here, 'inject.js'), 'utf8')
    .replaceAll('http://localhost:8123', `http://localhost:${port}`);

function findChunks(dir, out = []) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory() && e.name !== 'node_modules' && e.name !== '.git') findChunks(p, out);
        else if (/^youtubePlayer-plugin.*\.js$/.test(e.name)) out.push(p);
    }
    return out;
}

const chunks = findChunks(root);
if (chunks.length === 0) {
    console.error('::error::No youtubePlayer-plugin*.js chunks found — web layout may have changed');
    process.exit(1);
}
for (const f of chunks) {
    const content = fs.readFileSync(f, 'utf8');
    if (content.includes('__YT_FIX_V17__')) continue;
    fs.writeFileSync(f, inject + '\n' + content);
    console.log(`Patched ${f}`);
}

// ── 2. Create the resolver service (CreateYouTubeResolverAsync) ──────────
const langMap = fs.readFileSync(path.join(here, 'lang-map.js'), 'utf8').trim();
const service = fs.readFileSync(path.join(here, 'service.js'), 'utf8')
    .replace('var PORT = 8123', `var PORT = ${port}`)
    .replace("'origin': 'http://localhost:8123'", `'origin': 'http://localhost:${port}'`)
    .replace('__LANG_MAP__', () => langMap);
fs.mkdirSync(path.join(root, 'service'), { recursive: true });
fs.writeFileSync(path.join(root, 'service', 'service.js'), service);

// ── 3. Patch config.xml (UpdateCorsAsync) ────────────────────────────────
const cfgPath = path.join(root, 'config.xml');
let xml = fs.readFileSync(cfgPath, 'utf8');

// strip existing directives the C# removes
xml = xml
    .replace(/^\s*<access\b[^>]*\/>\s*$/gm, '')
    .replace(/^\s*<(tizen:)?allow-navigation\b[^>]*(\/>|>.*?<\/(tizen:)?allow-navigation>)\s*$/gm, '')
    .replace(/^\s*<tizen:content-security-policy>[\s\S]*?<\/tizen:content-security-policy>\s*$/gm, '');

const pkgId = xml.match(/<tizen:application[^>]*package="([^"]+)"/)?.[1] ?? 'AprZAARz4r';

const csp =
    `default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; ` +
    `script-src * 'unsafe-inline' 'unsafe-eval' http://localhost:${port} https://www.youtube.com; ` +
    `frame-src * http://localhost:${port} https://www.youtube.com; ` +
    `connect-src * http://localhost:${port};`;

let additions = `
    <access origin="*" subdomains="true"/>
    <allow-navigation href="*"/>
    <tizen:allow-navigation>*</tizen:allow-navigation>
    <tizen:content-security-policy>${csp}</tizen:content-security-policy>
    <tizen:allow-mixed-content>true</tizen:allow-mixed-content>`;

if (!xml.includes('.ytresolver')) {
    additions += `
    <tizen:service id="${pkgId}.ytresolver" type="service">
        <tizen:content src="service/service.js"/>
        <tizen:name>ytresolver</tizen:name>
    </tizen:service>`;
}

for (const p of ['internet', 'network.public', 'content.read']) {
    if (!xml.includes(`http://tizen.org/privilege/${p}`)) {
        additions += `\n    <tizen:privilege name="http://tizen.org/privilege/${p}"/>`;
    }
}

xml = xml.replace('</widget>', `${additions}\n</widget>`);
fs.writeFileSync(cfgPath, xml);
console.log(`config.xml patched (pkg=${pkgId}, port=${port})`);