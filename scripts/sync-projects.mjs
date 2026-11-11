#!/usr/bin/env node
/** Integrate immutable public project builds, or explicitly selected sibling dist folders. */
import { cp, lstat, mkdir, readFile, readdir, realpath, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const ALLOWED = new Set(['retailscope', 'gridpulse', 'flowlens']);
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--local')) throw new Error('Usage: node scripts/sync-projects.mjs [--local]');
const local = args.includes('--local');
const ROOT_REAL = await realpath(ROOT);
const gitEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' };

async function exists(file) {
  try { await lstat(file); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

function validateLock(lock) {
  if (!Array.isArray(lock.projects) || lock.projects.length !== 3) throw new Error('The lock must contain exactly three projects.');
  const seen = new Set();
  return lock.projects.map(({ slug, repository, commit }) => {
    if (!ALLOWED.has(slug) || seen.has(slug)) throw new Error(`Unapproved or duplicate slug: ${slug}`);
    seen.add(slug);
    const accepted = [`Badreddine05/${slug}`, `https://github.com/Badreddine05/${slug}`, `https://github.com/Badreddine05/${slug}.git`];
    if (!accepted.includes(repository)) throw new Error(`Unexpected repository for ${slug}.`);
    if (typeof commit !== 'string' || !/^[a-f0-9]{40}$/i.test(commit)) throw new Error(`A full Git SHA is required for ${slug}.`);
    return { slug, repository: `https://github.com/Badreddine05/${slug}.git`, commit: commit.toLowerCase() };
  });
}

async function safeDirectory(directory, expectedParent, name) {
  const absolute = path.resolve(directory);
  if (absolute !== path.resolve(expectedParent, name)) throw new Error(`Unexpected directory: ${absolute}`);
  if (await exists(absolute)) {
    const info = await lstat(absolute);
    if (info.isSymbolicLink() || !info.isDirectory()) throw new Error(`Not a regular directory: ${absolute}`);
    const parentReal = await realpath(expectedParent);
    if (await realpath(absolute) !== path.join(parentReal, name)) throw new Error(`Directory escapes its real parent: ${absolute}`);
  }
  return absolute;
}

async function verifyStaticSource(directory) {
  const info = await lstat(directory);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error(`Invalid build directory: ${directory}`);
  const visit = async dir => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const item = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Build symlink refused: ${item}`);
      if (entry.isDirectory()) await visit(item);
      else if (!entry.isFile()) throw new Error(`Unsupported build entry: ${item}`);
    }
  };
  await visit(directory);
  const html = await readFile(path.join(directory, 'index.html'), 'utf8');
  if (!/<html\b/i.test(html)) throw new Error(`Missing HTML entrypoint: ${directory}`);
}

function run(command, values, cwd, capture = false) {
  return execFileSync(command, values, {
    cwd, shell: false, env: gitEnv, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
}

async function npmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.resolve(path.dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    '/usr/share/nodejs/npm/bin/npm-cli.js',
  ].filter(Boolean);
  try {
    const require = createRequire(import.meta.url);
    candidates.push(path.join(path.dirname(require.resolve('npm/package.json')), 'bin/npm-cli.js'));
  } catch { /* Optional module resolution. */ }
  for (const candidate of candidates) {
    if (path.basename(candidate) === 'npm-cli.js' && await exists(candidate)) return candidate;
  }
  throw new Error('npm-cli.js not found. Use npm run sync or install Node.js with npm.');
}

const projects = validateLock(JSON.parse(await readFile(path.join(ROOT, 'projects.lock.json'), 'utf8')));
let cache, cli;
if (!local) {
  cache = await safeDirectory(path.join(ROOT, '.cache'), ROOT, '.cache');
  await mkdir(cache, { recursive: true });
  cli = await npmCli();
}

for (const project of projects) {
  let source;
  if (local) {
    const sibling = await safeDirectory(path.join(ROOT, '..', project.slug), path.resolve(ROOT, '..'), project.slug);
    source = await safeDirectory(path.join(sibling, 'dist'), sibling, 'dist');
    console.log(`${project.slug}: local dist selected; remote commit identity is not verified in --local mode.`);
  } else {
    const checkout = await safeDirectory(path.join(cache, project.slug), cache, project.slug);
    if (!await exists(checkout)) {
      run('git', ['-c', 'credential.helper=', '-c', 'protocol.file.allow=never', 'clone', '--no-checkout', '--filter=blob:none', '--', project.repository, checkout], ROOT);
    } else {
      const remote = run('git', ['remote', 'get-url', 'origin'], checkout, true).trim();
      if (remote !== project.repository) throw new Error(`Cached remote mismatch for ${project.slug}.`);
    }
    run('git', ['-c', 'credential.helper=', '-c', 'protocol.file.allow=never', 'fetch', '--depth=1', 'origin', project.commit], checkout);
    run('git', ['checkout', '--detach', project.commit], checkout);
    if (run('git', ['rev-parse', 'HEAD'], checkout, true).trim() !== project.commit) throw new Error(`Commit mismatch for ${project.slug}.`);
    run(process.execPath, [cli, 'ci', '--no-audit', '--no-fund'], checkout);
    run(process.execPath, [cli, 'run', 'build'], checkout);
    source = await safeDirectory(path.join(checkout, 'dist'), checkout, 'dist');
  }
  await verifyStaticSource(source);
  const target = await safeDirectory(path.join(ROOT, project.slug), ROOT, project.slug);
  // Resolve, whitelist and verify the real root immediately before recursive replacement.
  if (!ALLOWED.has(path.basename(target)) || path.dirname(target) !== path.resolve(ROOT)) throw new Error(`Unapproved replacement target: ${target}`);
  if (await realpath(ROOT) !== ROOT_REAL) throw new Error('Portfolio real path changed during synchronization.');
  console.log(`Verified replacement target: ${target}`);
  if (await exists(target)) await rm(target, { recursive: true, force: false });
  await cp(source, target, { recursive: true, dereference: false, errorOnExist: true, force: false });
  console.log(`Copied ${project.slug} (${local ? 'local build' : project.commit}).`);
}
console.log('Three applications synchronized. Run npm test and review the Git diff before publishing.');
