// Prints a short ground-truth digest of the repo (branch, log, tree, recent slices,
// verdicts, TODO head) for a fresh session (/warboss-horde:resume), so a restarted
// session boots from the work itself instead of an old transcript.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const cwdIdx = argv.indexOf('--cwd');
const cwd = cwdIdx >= 0 && argv[cwdIdx + 1] ? path.resolve(argv[cwdIdx + 1]) : process.cwd();

const git = (args) => {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return null;
  }
};

const sections = [];
const section = (title, body) => sections.push('## ' + title + '\n' + body);

// 1. Branch
const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
const isRepo = branch !== null;
if (!isRepo) {
  section('Branch', '(not a git repository)');
} else {
  const log = git(['log', '--oneline', '-10']);
  const logTrim = log === null ? '' : log.trim();
  section('Branch', branch.trim() + (logTrim ? '\n' + logTrim : ''));

  // 2. Working tree
  const status = git(['status', '--short']) ?? '';
  const lines = status.split('\n').filter((l) => l !== '');
  if (lines.length === 0) {
    section('Working tree', '(clean)');
  } else {
    const shown = lines.slice(0, 30);
    if (lines.length > 30) shown.push(`(+${lines.length - 30} more)`);
    section('Working tree', shown.join('\n'));
  }
}

// 3. Recent slices
const slicesDir = path.join(cwd, '.warboss-horde', 'slices');
if (fs.existsSync(slicesDir)) {
  const names = fs.readdirSync(slicesDir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => ({ f, mtime: fs.statSync(path.join(slicesDir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)
    .slice(0, 10)
    .map((x) => x.f.slice(0, -'.md'.length));
  if (names.length > 0) section('Recent slices', names.join('\n'));
}

// 4. Recent verdicts
const verdictsFile = path.join(cwd, '.warboss-horde', 'verdicts.jsonl');
if (fs.existsSync(verdictsFile)) {
  const parsed = [];
  for (const line of fs.readFileSync(verdictsFile, 'utf8').split('\n')) {
    if (line.trim() === '') continue;
    try {
      parsed.push(JSON.parse(line));
    } catch {
      // skip unparseable line
    }
  }
  const out = parsed.slice(-8).map((v) =>
    `${v.slice} ${v.verdict} r${v.round}` + (v.cause ? ` ${v.cause}` : ''));
  if (out.length > 0) section('Recent verdicts', out.join('\n'));
}

// 5. TODO head
const todoFile = path.join(cwd, 'TODO.md');
if (fs.existsSync(todoFile)) {
  section('TODO', fs.readFileSync(todoFile, 'utf8').split('\n').slice(0, 40).join('\n'));
}

let text = sections.join('\n\n');
if (text.length > 16000) text = text.slice(0, 16000) + '\n…(truncated)';
process.stdout.write(text + '\n');
