import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://badreddine05.github.io';
const SLUGS = ['retailscope', 'gridpulse', 'flowlens'];
const STUDIES = ['retailscope', 'gridpulse', 'flowlens', 'neurolab'];
const PAGES = ['index.html', 'cv.html', '404.html', ...STUDIES.map(s => `projets/${s}/index.html`)];
const load = relative => readFile(path.join(ROOT, relative), 'utf8');
const GAME_REPOS = { frogger: 'Frogger', 'ile-interdite': 'Projet-le-interdite-', rebound: 'Projet-programmation-Fonctionnelle-avanc-e-Casse-brique' };
const GAME_LOCK = JSON.parse(await load('games.lock.json'));
const GAMES = GAME_LOCK.games.map(g => g.slug);
const attrs = (html, attribute) => [...html.matchAll(new RegExp(`\\b${attribute}\\s*=\\s*["']([^"']*)["']`, 'gi'))].map(m => m[1]);

async function resolveLocal(ref, page) {
  if (/^(?:mailto:|tel:|data:|blob:)/i.test(ref)) return null;
  assert.ok(!/^javascript:/i.test(ref), `Unsafe link in ${page}`);
  const url = new URL(ref.replaceAll('&amp;', '&'), `${ORIGIN}/${page}`);
  if (url.origin !== ORIGIN) return null;
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = path.resolve(ROOT, '.' + pathname);
  const relative = path.relative(ROOT, file);
  assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative), `Link escapes site root: ${ref}`);
  await access(file);
  if (url.hash && /\.html?$/i.test(file)) {
    const target = await readFile(file, 'utf8');
    assert.ok(attrs(target, 'id').includes(decodeURIComponent(url.hash.slice(1))), `Missing anchor ${url.hash} from ${page}`);
  }
  return relative;
}

test('pages declare French, a title, a description, one h1 and unique IDs', async () => {
  for (const file of PAGES) {
    const html = await load(file);
    assert.match(html, /<!doctype html>/i, file);
    assert.match(html, /<html\b[^>]*lang=["']fr["']/i, file);
    assert.match(html, /<title>[^<]+<\/title>/i, file);
    assert.match(html, /<meta name="viewport"/i, file);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, file);
    const ids = attrs(html, 'id');
    assert.equal(new Set(ids).size, ids.length, `${file} contains duplicate IDs`);
    assert.match(html, /<main\b/i, file);
    if (file !== '404.html') assert.match(html, /<meta name="description" content="[^"]{40,}"/i, file);
  }
});

test('all local links, media and fragment targets exist', async () => {
  for (const file of PAGES) {
    const html = await load(file);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) await resolveLocal(ref, file);
  }
});

test('the home page links every case study, application and repository', async () => {
  const html = await load('index.html');
  const hrefs = attrs(html, 'href');
  for (const slug of STUDIES) assert.ok(hrefs.includes(`projets/${slug}/`), `Missing case study link: ${slug}`);
  for (const slug of SLUGS) assert.ok(hrefs.includes(`${slug}/`), `Missing application link: ${slug}`);
  for (const repo of ['retailscope', 'gridpulse', 'flowlens', 'BCI']) assert.ok(hrefs.includes(`https://github.com/Badreddine05/${repo}`), `Missing repository: ${repo}`);
  for (const slug of GAMES) assert.ok(hrefs.includes(`${slug}/`), `Missing game link: ${slug}`);
  for (const repo of Object.values(GAME_REPOS)) assert.ok(hrefs.includes(`https://github.com/Badreddine05/${repo}`), `Missing game repository: ${repo}`);
});

test('every figure has a module and a dataset', async () => {
  const modules = { retailscope: 'retailscope', gridpulse: 'gridpulse', flowlens: 'flowlens', neurolab: 'neurolab' };
  for (const slug of STUDIES) {
    const html = await load(`projets/${slug}/index.html`);
    assert.ok((html.match(/data-fig="/g) || []).length >= 4, `${slug} should have at least four figures`);
    assert.match(html, new RegExp(`assets/js/figs/${modules[slug]}\\.js`), slug);
    const figs = await load(`assets/js/figs/${modules[slug]}.js`);
    for (const name of attrs(html, 'data-fig')) assert.match(figs, new RegExp(`\\b${name}\\b`), `${slug}: no renderer for ${name}`);
    const data = JSON.parse(await load(`data/figures/${slug}.json`));
    assert.ok(Object.keys(data).length > 3, `${slug}.json looks empty`);
  }
  const home = JSON.parse(await load('data/figures/home.json'));
  assert.equal(home.morph.length, 4);
  for (const shape of home.morph) assert.equal(shape.values.length, 240);
});

test('figure datasets agree with the published project results', async () => {
  const flow = JSON.parse(await load('data/figures/flowlens.json'));
  assert.equal(flow.totals.cases, 31509);
  assert.equal(flow.totals.median, 19.07);
  const grid = JSON.parse(await load('data/figures/gridpulse.json'));
  assert.equal(grid.heat.length, 731 * 24);
  assert.equal(grid.meta.model.mae_mw, 2709.55);
  const retail = JSON.parse(await load('data/figures/retailscope.json'));
  assert.equal(retail.meta.counts.source_rows, 541909);
  const neuro = JSON.parse(await load('data/figures/neurolab.json'));
  assert.equal(neuro.subjects.length, 9);
  assert.equal(neuro.records.length, 27);
});

test('lock identifies exactly three approved repositories with immutable references', async () => {
  const lock = JSON.parse(await load('projects.lock.json'));
  assert.ok(Array.isArray(lock.projects));
  assert.deepEqual(lock.projects.map(p => p.slug).sort(), [...SLUGS].sort());
  for (const project of lock.projects) {
    assert.match(project.commit, /^[a-f0-9]{40}$/i);
    assert.ok([`Badreddine05/${project.slug}`, `https://github.com/Badreddine05/${project.slug}`, `https://github.com/Badreddine05/${project.slug}.git`].includes(project.repository));
  }
});

test('three application entrypoints and their referenced local bundles exist', async () => {
  for (const slug of SLUGS) {
    const file = `${slug}/index.html`;
    const html = await load(file);
    assert.match(html, /<html\b/i);
    const scripts = attrs(html, 'src').filter(s => /\.m?js(?:\?|$)/.test(s));
    assert.ok(scripts.length > 0, `No bundled JavaScript in ${slug}`);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) await resolveLocal(ref, file);
  }
});

test('game builds match their lock and load only local files', async () => {
  const { createHash } = await import('node:crypto');
  assert.ok(GAMES.length > 0, 'games.lock.json lists no game');
  for (const game of GAME_LOCK.games) {
    assert.ok(GAME_REPOS[game.slug], `Unknown game ${game.slug}`);
    assert.equal(game.repository, `Badreddine05/${GAME_REPOS[game.slug]}`);
    assert.match(game.commit, /^[a-f0-9]{40}$/);
    const file = `${game.slug}/index.html`;
    const html = await load(file);
    assert.match(html, /<html\b[^>]*lang=["']fr["']/i, file);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, file);
    assert.match(html, /<meta name="description" content="[^"]{40,}"/i, file);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) await resolveLocal(ref, file);
    const engine = await readFile(path.join(ROOT, game.slug, game.engine));
    assert.equal(createHash('sha256').update(engine).digest('hex'), game.sha256, `${game.slug}: engine differs from the lock`);
  }
});

test('brand marks, fonts and licence notices are shipped', async () => {
  for (const name of ['mark', 'flowlens', 'gridpulse', 'retailscope', 'neurolab', 'frogger', 'ile-interdite', 'rebound']) {
    const svg = await load(`assets/brand/${name}.svg`);
    assert.match(svg, /<svg\b[^>]*viewBox/);
  }
  for (const font of ['newsreader-opsz.woff2', 'newsreader-italic.woff2', 'plex-sans.woff2', 'plex-mono-400.woff2', 'plex-mono-500.woff2']) {
    assert.ok((await stat(path.join(ROOT, 'assets/fonts', font))).size > 1000, font);
  }
  for (const notice of ['assets/fonts/Newsreader-OFL.txt', 'assets/fonts/IBM-Plex-Sans-OFL.txt', 'assets/fonts/IBM-Plex-Mono-OFL.txt', 'assets/vendor/d3-LICENSE.txt']) {
    assert.match(await load(notice), /(Open Font License|Permission to use)/, notice);
  }
});

test('CV JSON has the expected public structure and links to every project', async () => {
  const cv = JSON.parse(await load('data/cv.json'));
  for (const field of ['name', 'title', 'location', 'email', 'github', 'linkedin', 'website', 'summary', 'languages', 'certifications', 'interests']) {
    assert.equal(typeof cv[field], 'string', field); assert.ok(cv[field].trim(), field);
  }
  for (const field of ['experiences', 'education', 'skills', 'portfolio', 'otherProjects']) {
    assert.ok(Array.isArray(cv[field]) && cv[field].length > 0, field);
    for (const entry of cv[field]) assert.ok(typeof entry.title === 'string' && entry.title.trim());
  }
  assert.equal(cv.github, 'https://github.com/Badreddine05');
  assert.equal(new URL(cv.website).origin, ORIGIN);
  const targets = cv.portfolio.map(p => { const url = new URL(p.link); assert.equal(url.origin, ORIGIN, p.title); return url.pathname + url.hash; });
  assert.deepEqual(targets.sort(), [...SLUGS.map(s => `/${s}/`), '/projets/neurolab/'].sort());
  const pages = [...cv.portfolio, ...cv.otherProjects].flatMap(p => p.pages ?? []).map(p => p.href);
  assert.deepEqual(pages.sort(), ['projets/neurolab/', ...GAMES.map(s => `${s}/`)].sort());
  for (const href of pages) await access(path.join(ROOT, href, 'index.html'));
});

test('public pages and CV do not expose a phone number', async () => {
  const frenchPhone = /(?<!\d)(?:\+33[\s.()-]*[1-9]|0[1-9])(?:[\s.()-]*\d{2}){4}(?!\d)/;
  for (const file of [...PAGES, 'data/cv.json', 'assets/js/home.js', 'assets/js/site.js']) {
    const text = await load(file);
    assert.doesNotMatch(text, /href\s*=\s*["']tel:/i, file);
    assert.doesNotMatch(text, frenchPhone, file);
  }
  const cv = JSON.parse(await load('data/cv.json'));
  assert.ok(!Object.keys(cv).some(key => /phone|telephone|téléphone|mobile/i.test(key)));
});

test('PDF is present and has a PDF signature', async () => {
  const file = path.join(ROOT, 'assets/CV_Badreddine_Channoufi.pdf');
  assert.ok((await stat(file)).size > 1000);
  const buffer = await readFile(file);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-');
});

test('discovery files cover every public entrypoint', async () => {
  assert.match(await load('robots.txt'), /Sitemap: https:\/\/badreddine05\.github\.io\/sitemap\.xml/);
  const urls = [...(await load('sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  const expected = [`${ORIGIN}/`, `${ORIGIN}/cv.html`, ...STUDIES.map(s => `${ORIGIN}/projets/${s}/`), ...SLUGS.map(s => `${ORIGIN}/${s}/`), ...GAMES.map(s => `${ORIGIN}/${s}/`)];
  assert.deepEqual(urls.sort(), expected.sort());
  await access(path.join(ROOT, '.nojekyll'));
});
