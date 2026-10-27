import fs from 'fs';
import path from 'path';

export const KNOWN_EXES = ['czht.exe', 'iu.Hrball.exe'];

// 目录名形如 WYHT--3.1.1--x64--20261021_102251--医保凭证：取首个 x.y.z 与尾段作为名字
export function deriveClient(dir) {
  const base = String(dir || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop() || '';
  const m = base.match(/(\d+\.\d+\.\d+)/);
  // 有 `--` 时取最后一个 `--` 之后的部分；没有 `--` 时按 `-` 取末段
  const tail = base.split(base.indexOf('--') !== -1 ? '--' : '-').filter(Boolean).pop() || base;
  return { version: m ? m[1] : null, name: m ? m[1] + '-' + tail : tail };
}

export function versionSemantics(version) {
  if (!version) {
    return { shell: '版本未识别', hotStart: null, text: '版本未识别（目录名里没有 x.y.z）' };
  }
  const parts = String(version).split('.').map((n) => parseInt(n, 10) || 0);
  const major = parts[0];
  const minor = parts[1] || 0;
  const shell = major >= 3 ? 'C++ 原生 CEF' : 'C# 壳（CefSharp 系）';
  const hotStart = major >= 3 && minor >= 1;
  return {
    shell,
    hotStart,
    text: version + ' · ' + shell + ' · ' + (hotStart ? '冷/热启动可用' : '只有冷启动'),
  };
}

export function detectExe(dir) {
  for (const exe of KNOWN_EXES) {
    if (fs.existsSync(path.join(dir, exe))) return exe;
  }
  return null;
}
