// 移植自原 scripts/check_env.py：只读判定，不做任何写操作。
import { DatabaseSync } from 'node:sqlite';

export const KEYS = ['IsFirstRun', 'ServerUrl', 'HospitalId', 'ClientType', 'HospitalUserName'];
const PRIVATE_SUFFIXES = ['.local', '.lan', '.internal', '.corp'];

export function readShellConfig(dbPath) {
  // 与原 python 脚本的 timeout=3 对齐：客户端持独占锁时等待而不是立刻 locked
  const db = new DatabaseSync(dbPath, { readOnly: true, timeout: 3000 });
  try {
    const rows = db
      .prepare('select key, value from iu_Hrball_exe where key in (' + KEYS.map(() => '?').join(',') + ')')
      .all(...KEYS);
    const map = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return map;
  } finally {
    db.close();
  }
}

function hostOf(serverUrl) {
  try {
    return new URL(serverUrl).hostname.toLowerCase();
  } catch (e) {
    return '';
  }
}

function isPrivateHost(host) {
  if (!host) return false;
  if (host === 'localhost') return true;
  if (PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return true;
  // 不带点的主机名（如 hisserver）视作内网机器名
  if (host.indexOf('.') === -1) return !/^\d+$/.test(host.replace(/-/g, ''));
  // 注意：这里比 python 的 ipaddress.is_private 多判了 CGNAT（100.64/10），
  // 文档段（192.0.2/24 等）与保留段未覆盖——是行为选择，不是逐段移植。
  const v4 = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!v4) return false;
  const a = parseInt(v4[1], 10);
  const b = parseInt(v4[2], 10);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 198 && (b === 18 || b === 19))
  );
}

export function classify(cfg) {
  const rawFirst = cfg.IsFirstRun;
  // 只有 缺键 / SQL NULL 才算安装态（与原 python 一致）；空串不算，继续按 ServerUrl 判定
  // 宿主读配置的默认值是 true：键缺失同样算安装态，不能当已装
  const isFirst = rawFirst === undefined || rawFirst === null
    ? true
    : ['true', '1'].indexOf(String(rawFirst).trim().toLowerCase()) !== -1;
  const serverUrl = String(cfg.ServerUrl || '').trim();
  if (isFirst) {
    const shown = rawFirst === undefined || rawFirst === null ? '缺失（按 true 处理）' : rawFirst;
    return { env: 'install', reason: 'IsFirstRun=' + shown + ' → 安装态：宿主强制加载 file:///html/InitForm.html，--url 被忽略' };
  }
  if (!serverUrl) {
    return { env: 'install', reason: 'IsFirstRun=false 但 ServerUrl 为空 → 配置被清，等同安装态' };
  }
  const host = hostOf(serverUrl);
  if (isPrivateHost(host)) {
    return { env: 'frontend', reason: 'ServerUrl 主机 ' + host + ' 属内网 → 接口经医院前置机代理到外网' };
  }
  return { env: 'direct', reason: 'ServerUrl 主机 ' + host + ' 为公网 → 直连云端' };
}

export function checkExitCode(env) {
  if (env === 'install') return 2;
  if (env === 'frontend') return 3;
  if (env === 'direct') return 0;
  return 4; // 4 = 读取失败/未知，沿用原脚本的失败码
}
