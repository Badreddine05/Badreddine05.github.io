#!/usr/bin/env node
/**
 * Copy the browser builds of the games from their sibling checkouts, after checking that each
 * checkout sits on the locked commit with a clean tracked tree and that the compiled engine has
 * the locked SHA-256 (the same bytes as the engine validated by the game's CI).
 */
import { cp, lstat, readFile, readdir, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REPOSITORIES = new Map([
  ['frogger', 'Frogger'],
  ['ile-interdite', 'Projet-le-interdite-'],
  ['rebound', 'Projet-programmation-Fonctionnelle-avanc-e-Casse-brique'],
]);
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } }).trim();
const sha256 = async file => createHash('sha256').update(await readFile(file)).digest('hex');
const inside = (parent, child) => {
  const relative = path.relative(parent, child);
  return relative && !relative.startsWith('..') && !path.isAbsolute(relative);
};

async function plainTree(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`Symlink refused: ${item}`);
    if (entry.isDirectory()) await plainTree(item);
    else if (!entry.isFile()) throw new Error(`Unsupported entry: ${item}`);
  }
}

const lock = JSON.parse(await readFile(path.join(ROOT, 'games.lock.json'), 'utf8'));
if (!Array.isArray(lock.games) || lock.games.length === 0) throw new Error('games.lock.json lists no game.');
const seen = new Set();
for (const game of lock.games) {
  const repo = REPOSITORIES.get(game.slug);
  if (!repo || seen.has(game.slug)) throw new Error(`Unknown or duplicate game: ${game.slug}`);
  seen.add(game.slug);
  if (game.repository !== `Badreddine05/${repo}`) throw new Error(`Unexpected repository for ${game.slug}.`);
  if (!/^[a-f0-9]{40}$/.test(game.commit) || !/^[a-f0-9]{64}$/.test(game.sha256)) throw new Error(`Full commit and SHA-256 required for ${game.slug}.`);

  const checkout = path.resolve(ROOT, '..', repo);
  if (git(checkout, 'rev-parse', 'HEAD') !== game.commit) throw new Error(`${repo} is not at the locked commit ${game.commit}.`);
  if (git(checkout, 'status', '--porcelain', '--untracked-files=no')) throw new Error(`${repo} has uncommitted tracked changes.`);

  const source = path.resolve(checkout, game.source);
  const engine = path.resolve(source, game.engine);
  if (!inside(checkout, source) || !inside(source, engine)) throw new Error(`Paths escape the checkout for ${game.slug}.`);
  if ((await lstat(source)).isSymbolicLink()) throw new Error(`Source is a symlink: ${source}`);
  await plainTree(source);
  if (!/<html\b/i.test(await readFile(path.join(source, 'index.html'), 'utf8'))) throw new Error(`No HTML entry point in ${source}`);
  const digest = await sha256(engine);
  if (digest !== game.sha256) throw new Error(`${game.slug}: engine SHA-256 ${digest} differs from the lock.`);

  const target = path.join(ROOT, game.slug);
  if (path.dirname(target) !== path.resolve(ROOT)) throw new Error(`Unexpected target ${target}`);
  await rm(target, { recursive: true, force: true });
  await cp(source, target, { recursive: true, dereference: false, errorOnExist: true, force: false });
  console.log(`${game.slug}: copied ${path.relative(path.resolve(ROOT, '..'), source)} (${game.commit.slice(0, 7)}, engine ${digest.slice(0, 12)}).`);
}
console.log('Games synchronized. Run npm test and review the Git diff before publishing.');
