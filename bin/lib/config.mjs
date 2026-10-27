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
    // 同名目录不算配置文件，否则下游 JSON.parse 会 EISDIR
    try {
      if (fs.statSync(candidate).isFile()) return candidate;
    } catch (e) { /* 不存在继续向上找 */ }
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    throw new Error(file + ' 不是合法 JSON（' + err.message + '）；下一步：修复或删除该文件后重跑');
  }
}

// 先写临时文件再改名：clients.json 是机器级唯一真相，覆盖写被中断会留下半截 JSON
function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
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
  const hit = Object.prototype.hasOwnProperty.call(list, name) ? list[name] : undefined;
  if (!hit) {
    const names = Object.keys(list);
    throw new Error('客户端包「' + name + '」未登记。已登记：' + (names.length ? names.join('、') : '（空）') +
      '；先运行 wyht-skill clients add <目录>，或 wyht-skill clients list 查看');
  }
  return hit;
}
