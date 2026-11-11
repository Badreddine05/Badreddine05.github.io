import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ORIGIN = 'https://badreddine05.github.io';
const SLUGS = ['retailscope', 'gridpulse', 'flowlens'];
const load = relative => readFile(path.join(ROOT, relative), 'utf8');
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

test('portfolio pages declare French, a title, one h1 and unique IDs', async () => {
  for (const file of ['index.html', 'cv.html', '404.html']) {
    const html = await load(file);
    assert.match(html, /<!doctype html>/i);
    assert.match(html, /<html\b[^>]*lang=["']fr["']/i);
    assert.match(html, /<title>[^<]+<\/title>/i);
    assert.equal((html.match(/<h1\b/gi) || []).length, 1, file);
    const ids = attrs(html, 'id');
    assert.equal(new Set(ids).size, ids.length, `${file} contains duplicate IDs`);
    assert.match(html, /<main\b/i);
  }
});

test('all local portfolio links, media and fragment targets exist', async () => {
  for (const file of ['index.html', 'cv.html', '404.html']) {
    const html = await load(file);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) await resolveLocal(ref, file);
  }
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
  const homepage = await load('index.html');
  for (const slug of SLUGS) {
    assert.ok(attrs(homepage, 'href').some(h => h === `${slug}/` || h === `/${slug}/`), `Missing demo link: ${slug}`);
    const file = `${slug}/index.html`;
    const html = await load(file);
    assert.match(html, /<html\b/i);
    const scripts = attrs(html, 'src').filter(s => /\.m?js(?:\?|$)/.test(s));
    assert.ok(scripts.length > 0, `No bundled JavaScript in ${slug}`);
    for (const ref of [...attrs(html, 'href'), ...attrs(html, 'src')]) await resolveLocal(ref, file);
  }
});

test('CV JSON has the expected public structure and three project links', async () => {
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
  assert.equal(cv.portfolio.length, 3);
  assert.deepEqual(cv.portfolio.map(p => new URL(p.link).pathname).sort(), SLUGS.map(s => `/${s}/`).sort());
  for (const project of cv.portfolio) {
    assert.equal(typeof project.dates, 'string');
    assert.ok(project.dates.trim());
    assert.equal(new URL(project.link).origin, ORIGIN);
  }
});

test('public portfolio and CV do not expose a phone number', async () => {
  const frenchPhone = /(?<!\d)(?:\+33[\s.()-]*[1-9]|0[1-9])(?:[\s.()-]*\d{2}){4}(?!\d)/;
  for (const file of ['index.html', 'cv.html', 'data/cv.json', 'app.js']) {
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

test('discovery files cover all five public entrypoints', async () => {
  assert.match(await load('robots.txt'), /Sitemap: https:\/\/badreddine05\.github\.io\/sitemap\.xml/);
  const urls = [...(await load('sitemap.xml')).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  assert.deepEqual(urls.sort(), [`${ORIGIN}/`, `${ORIGIN}/cv.html`, ...SLUGS.map(s => `${ORIGIN}/${s}/`)].sort());
  await access(path.join(ROOT, '.nojekyll'));
});
