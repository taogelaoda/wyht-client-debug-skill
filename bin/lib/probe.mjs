import { execFile } from 'child_process';

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function parseNetstatListening(text) {
  const ports = [];
  String(text || '')
    .split(/\r?\n/)
    .forEach((line) => {
      if (line.indexOf('LISTENING') === -1) return;
      const m = line.match(/:(\d+)\s+\S+\s+LISTENING/i);
      if (!m) return;
      const port = parseInt(m[1], 10);
      if (ports.indexOf(port) === -1) ports.push(port);
    });
  return ports;
}

export function parseTasklist(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.charAt(0) === '"')
    .map((line) => {
      const cells = line.split('","').map((c) => c.replace(/^"|"$/g, ''));
      return { name: cells[0], pid: parseInt(cells[1], 10) };
    })
    .filter((row) => !isNaN(row.pid));
}

function execText(file, args) {
  return new Promise((resolve) => {
    execFile(file, args, { windowsHide: true, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      resolve(err ? '' : String(stdout || ''));
    });
  });
}

export async function listeningPorts() {
  return parseNetstatListening(await execText('netstat', ['-ano']));
}

export async function portListening(port) {
  return (await listeningPorts()).indexOf(Number(port)) !== -1;
}

export async function processesByName(names) {
  const all = [];
  for (const name of names) {
    const text = await execText('tasklist', ['/FI', 'IMAGENAME eq ' + name, '/FO', 'CSV', '/NH']);
    parseTasklist(text).forEach((row) => all.push(row));
  }
  return all;
}

export async function httpStatus(url, options) {
  const opts = options || {};
  const timeoutMs = opts.timeoutMs || 3000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'manual' });
    return res.status;
  } catch (e) {
    return 0;
  } finally {
    clearTimeout(timer);
  }
}
