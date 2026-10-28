import { spawn } from 'child_process';

/**
 * 原生窗口枚举（Windows）。
 *
 * 客户端是 CEF 多窗口应用：主窗体 / 悬浮球 / 气泡各有独立原生窗口，
 * 部分窗口（如悬浮球）不是 CDP 页面目标，只能从 Win32 侧看。这里用
 * EnumWindows 取可见窗口的标题、类名、PID 与矩形，供排查「窗口在不在、在哪」。
 *
 * 实现上用 -EncodedCommand 传脚本：避免 PowerShell 命令行引号/分号被宿主 shell 改写。
 */
const PS_SCRIPT = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition 'using System;using System.Runtime.InteropServices;using System.Text;public class OmpWin{[DllImport("user32.dll")]public static extern bool EnumWindows(EnumProc cb,IntPtr l);public delegate bool EnumProc(IntPtr h,IntPtr l);[DllImport("user32.dll")]public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern int GetClassName(IntPtr h,StringBuilder s,int n);[DllImport("user32.dll")]public static extern bool GetWindowRect(IntPtr h,out RECT r);[DllImport("user32.dll")]public static extern int GetWindowThreadProcessId(IntPtr h,out int procId);[DllImport("user32.dll")]public static extern bool IsWindowVisible(IntPtr h);public struct RECT{public int L;public int T;public int R;public int B;}}'
$out = New-Object System.Collections.ArrayList
$cb = [OmpWin+EnumProc]{ param($h,$l)
  if ([OmpWin]::IsWindowVisible($h)) {
    $tt = New-Object Text.StringBuilder 512; [void][OmpWin]::GetWindowText($h,$tt,512)
    $cc = New-Object Text.StringBuilder 256; [void][OmpWin]::GetClassName($h,$cc,256)
    $rr = New-Object OmpWin+RECT; [void][OmpWin]::GetWindowRect($h,[ref]$rr)
    $proc = 0; [void][OmpWin]::GetWindowThreadProcessId($h,[ref]$proc)
    [void]$out.Add([pscustomobject]@{ title = $tt.ToString(); cls = $cc.ToString(); pid = $proc; l = $rr.L; t = $rr.T; w = ($rr.R - $rr.L); h = ($rr.B - $rr.T) })
  }
  return $true }
[void][OmpWin]::EnumWindows($cb, [IntPtr]::Zero)
ConvertTo-Json -InputObject @($out) -Compress
`;

/**
 * 按标题或类名过滤窗口列表（纯函数，便于单测）。
 *
 * @param {Array<Object>} rows - nativeWindows() 的结果。
 * @param {string} [needle] - 关键字；为空时返回全部。
 * @returns {Array<Object>} 命中的窗口。
 */
export function filterWindows(rows, needle) {
  const list = Array.isArray(rows) ? rows : [];
  if (!needle) return list;
  const text = String(needle).toLowerCase();
  return list.filter((w) => String(w.title || '').toLowerCase().indexOf(text) !== -1
    || String(w.cls || '').toLowerCase().indexOf(text) !== -1);
}

/**
 * 读取当前会话可见的原生窗口。
 *
 * @param {Object} [options] - { timeoutMs }，默认 15s。
 * @returns {Promise<{ ok: boolean, rows: Array<Object>, text: string }>}
 */
export function nativeWindows(options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 15000;
  return new Promise((resolve) => {
    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
    const ps = spawn('powershell', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], {
      windowsHide: true,
    });
    let out = [];
    let err = '';
    let done = false;
    const finish = (result) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(result);
    };
    const timer = setTimeout(() => {
      try { ps.kill(); } catch (e) { /* 忽略 */ }
      finish({ ok: false, rows: [], text: '枚举窗口超时（' + timeoutMs + 'ms）' });
    }, timeoutMs);
    ps.stdout.on('data', (c) => { out.push(c); });
    ps.stderr.on('data', (c) => { err += c; });
    ps.on('error', () => finish({ ok: false, rows: [], text: 'powershell 不可用' }));
    ps.on('close', (code) => {
      if (code !== 0) {
        finish({ ok: false, rows: [], text: (err || 'powershell 退出码 ' + code).trim().slice(0, 200) });
        return;
      }
      const text = Buffer.concat(out).toString('utf8').trim();
      if (!text) {
        finish({ ok: true, rows: [], text: '' });
        return;
      }
      try {
        const parsed = JSON.parse(text);
        finish({ ok: true, rows: Array.isArray(parsed) ? parsed : [parsed], text: '' });
      } catch (e) {
        finish({ ok: false, rows: [], text: '窗口清单解析失败：' + e.message });
      }
    });
  });
}
