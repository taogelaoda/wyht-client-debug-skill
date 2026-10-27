// bin/lib/config.mjs —— 两层配置：项目内 .wyht-skill.json（向上发现）+ LOCALAPPDATA 客户端清单
import fs from 'fs';
import os from 'os';
import path from 'path';

export const PROJECT_FILE = '.wyht-skill.json';

// 客户端清单路径只看 LOCALAPPDATA；非 Windows 回退到用户目录下的 AppData/Local
export function clientsFilePath() {
  return path.join(process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'), 'wyht', 'clients.json');
}

export function findProjectFile(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    const candidate = path.join(dir, PROJECT_FILE);
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

// 显式 'utf8' 且不带 BOM，避免 Windows 工具链额外写入 BOM
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

export function readProject(rootDir) {
  return readJson(path.join(path.resolve(rootDir), PROJECT_FILE), null);
}

export function writeProject(rootDir, value) {
  writeJson(path.join(path.resolve(rootDir), PROJECT_FILE), value);
}

export function ensureGitignore(rootDir, entry) {
  const file = path.join(path.resolve(rootDir), '.gitignore');
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (text.split(/\r?\n/).map((l) => l.trim()).indexOf(entry) !== -1) return;
  const next = text.length && !text.endsWith('\n') ? text + '\n' + entry + '\n' : text + entry + '\n';
  fs.writeFileSync(file, next, 'utf8');
}

export function readClients(file) {
  return readJson(file || clientsFilePath(), { version: 1, clients: {} });
}

export function writeClients(file, value) {
  writeJson(file || clientsFilePath(), value);
}

export function resolveClient(clients, name) {
  const list = (clients && clients.clients) || {};
  const hit = list[name];
  if (!hit) {
    const names = Object.keys(list);
    throw new Error('客户端包「' + name + '」未登记。已登记：' + (names.length ? names.join('、') : '（空）') +
      '；先运行 wyht-skill clients add <目录>，或 wyht-skill clients list 查看');
  }
  return hit;
}
