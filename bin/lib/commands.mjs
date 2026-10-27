// bin/lib/commands.mjs —— 机器级 install/clients 与项目级 init；env = { repoDir, out, err }
import fs from 'fs';
import os from 'os';
import path from 'path';
import readline from 'readline';
import { spawn } from 'child_process';
import { deriveClient, versionSemantics, detectExe } from './derive.mjs';
import {
  clientsFilePath, readClients, writeClients, resolveClient, writeProject, ensureGitignore,
} from './config.mjs';
import { listeningPorts, portListening, processesByName, httpStatus, sleep } from './probe.mjs';
import { listPages, pickPage, evaluate, waitForPage } from './cdp.mjs';
import { readShellConfig, classify, checkExitCode } from './shellconfig.mjs';
import { buildDoctorReport, buildStartUrl, startPreflight, stopVerdict } from './actions.mjs';

export function addClientEntry(store, dir, options) {
  const opts = options || {};
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
    throw new Error('目录不存在：' + abs);
  }
  const name = opts.name || deriveClient(abs).name;
  const exe = opts.exe || detectExe(abs);
  if (!exe) {
    throw new Error('在 ' + abs + ' 里找不到 czht.exe 或 iu.Hrball.exe；用 --exe 指定实际主程序');
  }
  store.version = store.version || 1;
  store.clients = store.clients || {};
  store.clients[name] = { dir: abs, exe };
  return name;
}

export function removeClientEntry(store, name) {
  if (!store.clients || !store.clients[name]) return false;
  delete store.clients[name];
  return true;
}

function ask(question, defaultValue) {
  return new Promise((resolve, reject) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    let answered = false;
    rl.once('close', () => {
      if (!answered) reject(new Error('没有读到输入；下一步：在终端里交互运行 wyht-skill init，或先手写 .wyht-skill.json'));
    });
    rl.question(question + (defaultValue ? '（默认 ' + defaultValue + '）' : '') + '：', (answer) => {
      answered = true;
      rl.close();
      resolve((answer || '').trim() || defaultValue || '');
    });
  });
}

async function pickClient(names) {
  console.log('已登记的客户端包：');
  names.forEach((n, i) => console.log('  ' + (i + 1) + ') ' + n));
  const picked = await ask('选择序号或名字', names[0]);
  const index = parseInt(picked, 10);
  return !isNaN(index) && names[index - 1] ? names[index - 1] : picked;
}

export async function cmdClients(args, env) {
  const file = clientsFilePath();
  const store = readClients(file);
  const names = Object.keys(store.clients || {});
  if (!args.sub || args.sub === 'list') {
    env.out('clients · ' + (names.length ? names.length + ' 个' : '空'), []);
    if (!names.length) console.log('  下一步：wyht-skill clients add "<客户端目录>"');
    names.forEach((n) => {
      const c = store.clients[n];
      const exists = fs.existsSync(c.dir);
      console.log('  ' + n + '  ' + (exists ? '' : '❌ 目录不存在 ') + c.dir +
        '  [' + c.exe + ']  ' + versionSemantics(deriveClient(c.dir).version).text);
    });
    return 0;
  }
  if (args.sub === 'add') {
    const dir = args.rest[0];
    if (!dir) {
      env.err('clients add · 缺少目录');
      console.error('  下一步：wyht-skill clients add "<客户端目录>"');
      return 1;
    }
    const name = addClientEntry(store, dir, { name: args.name, exe: args.exe });
    writeClients(file, store);
    env.out('clients add · 成功', ['  ' + name + ' → ' + store.clients[name].dir + '（' + store.clients[name].exe + '）']);
    return 0;
  }
  if (args.sub === 'rm') {
    const name = args.rest[0];
    if (!name || !removeClientEntry(store, name)) {
      env.err('clients rm · 未找到：' + (name || '(未指定)'));
      console.error('  下一步：wyht-skill clients list 查看已登记的名字');
      return 1;
    }
    writeClients(file, store);
    env.out('clients rm · 已移除登记', ['  ' + name + '（目录未删除）']);
    return 0;
  }
  env.err('clients · 未知子命令：' + args.sub + '（可用：list / add / rm）');
  return 1;
}

async function runGit(repo, args) {
  return new Promise((resolve) => {
    const p = spawn('git', ['-C', repo].concat(args), {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: Object.assign({}, process.env, { GIT_TERMINAL_PROMPT: '0' }),
    });
    let text = '';
    let done = false;
    const finish = (ok, message) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({ ok, text: message });
    };
    // 黑洞远端会让 git 永远等下去：给硬超时，别让 install 卡住
    const timer = setTimeout(() => {
      try { p.kill(); } catch (e) { /* 忽略 */ }
      finish(false, '超时（10s）');
    }, 10000);
    p.stdout.on('data', (c) => { text += c; });
    p.stderr.on('data', (c) => { text += c; });
    p.on('error', () => finish(false, 'git 不可用'));
    // 收成一行：git 的多行提示会冲散命令输出
    p.on('close', (code) => finish(code === 0, text.replace(/\s+/g, ' ').trim().slice(0, 160)));
  });
}

export async function cmdInstall(args, env) {
  const repo = env.repoDir;
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const shimDir = path.join(localAppData, 'wyht', 'bin');
  const shim = path.join(shimDir, 'wyht-skill.cmd');
  const standardSkillsDir = path.join(localAppData, 'wyht', 'skills');
  const inStandardLayout = path.resolve(path.dirname(repo)).toLowerCase() === path.resolve(standardSkillsDir).toLowerCase();
  // 标准布局用 %~dp0 相对路径：shim 纯 ASCII，哪怕用户名是中文也不受影响
  const nodeTarget = inStandardLayout
    ? '%~dp0..\\skills\\' + path.basename(repo) + '\\bin\\wyht-skill.mjs'
    : path.join(repo, 'bin', 'wyht-skill.mjs');
  if (/[^\x00-\x7f]/.test(nodeTarget)) {
    throw new Error('shim 路径含非 ASCII 字符（' + nodeTarget + '）；下一步：把技能仓库放到纯 ASCII 路径，或改用引导器安装到 %LOCALAPPDATA%');
  }
  // 先读 package.json：仓库不是 skill 仓库时在写任何文件之前就失败
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  // 刷新只在 git 仓库里做，失败只警告：装不装得上不取决于能不能联网
  let refresh = '未刷新（不是 git 仓库）';
  if (fs.existsSync(path.join(repo, '.git'))) {
    let mayPull = true;
    if (args && args.ref) {
      const co = await runGit(repo, ['checkout', '--quiet', args.ref]);
      if (!co.ok) {
        console.error('警告：切不到 ' + args.ref + '（' + co.text + '），保持当前引用');
        refresh = '刷新跳过（切换引用失败）';
        mayPull = false;
      }
    }
    if (mayPull) {
      const pull = await runGit(repo, ['pull', '--ff-only', '--quiet']);
      refresh = pull.ok ? '已刷新' : '刷新跳过（' + pull.text + '）';
      if (!pull.ok) console.error('警告：' + refresh);
    }
  }
  // .cmd 必须纯 ASCII：cmd.exe 按 OEM 解码，中文会被当成命令执行
  const shimText = '@echo off\r\n' +
    'rem wyht-skill entry: forwards args to the Node CLI inside the skill repo\r\n' +
    'node "' + nodeTarget + '" %*\r\n';
  fs.mkdirSync(shimDir, { recursive: true });
  if (!fs.existsSync(shim) || fs.readFileSync(shim, 'utf8') !== shimText) {
    fs.writeFileSync(shim, shimText, 'ascii');
  }
  env.out('install · 成功', [
    '  仓库 ' + repo + '（v' + pkg.version + '）· ' + refresh,
    '  入口 ' + shim,
    '  下一步：确认 ' + shimDir + ' 在 PATH 里（首次由 bootstrap 追加）；然后 clients add + init',
  ]);
  return 0;
}

export async function cmdInit(args, projectRoot, project, env) {
  const file = clientsFilePath();
  const store = readClients(file);
  const names = Object.keys(store.clients || {});
  if (!names.length) {
    env.err('init · 机器上还没有登记任何客户端包');
    console.error('  下一步：wyht-skill clients add "<客户端目录>"');
    return 3;
  }
  const existing = project || { version: 1 };
  const chosen = args.use || existing.client || (names.length === 1 ? names[0] : await pickClient(names));
  const client = resolveClient(store, chosen);

  // 联接判定前置：悬挂 junction 让 existsSync 返回 false，必须用 lstat 才不会撞 EEXIST
  const skillsDir = path.join(projectRoot, '.claude', 'skills');
  const link = path.join(skillsDir, 'wyht-client-debug');
  let linkStat = null;
  try { linkStat = fs.lstatSync(link); } catch (e) { linkStat = null; }
  if (linkStat && !linkStat.isSymbolicLink() && !args.force) {
    env.err('init · .claude\\skills\\wyht-client-debug 是实体目录（可能是手工副本）');
    console.error('  确认要替换就加 --force（会先备份为 *.bak-<时间戳>）');
    return 1;
  }

  const webUrl = existing.webUrl || (await ask('本地前端地址', 'http://localhost:8080/yl-client-web'));
  const hisUserId = existing.hisUserId || (await ask('hisUserId（可留空）', ''));

  // 校验都通过了才写盘，避免失败时留下半套配置
  writeProject(projectRoot, { version: 1, client: chosen, webUrl, hisUserId });
  ensureGitignore(projectRoot, '.wyht-skill.json');

  fs.mkdirSync(skillsDir, { recursive: true });
  if (linkStat) {
    if (linkStat.isSymbolicLink()) fs.unlinkSync(link);
    else fs.renameSync(link, link + '.bak-' + Date.now());
  }
  fs.symlinkSync(env.repoDir, link, 'junction');
  env.out('init · 成功', [
    '  客户端 ' + chosen + ' → ' + client.dir,
    '  前端   ' + webUrl,
    '  配置   ' + path.join(projectRoot, '.wyht-skill.json'),
    '  联接   ' + link,
    '  下一步：wyht-skill check',
  ]);
  return 0;
}

export function resolvePorts(ports) {
  return {
    9222: ports.indexOf(9222) !== -1,
    8080: ports.indexOf(8080) !== -1,
    9321: ports.indexOf(9321) !== -1,
  };
}

export function resolveProcesses(rows, names) {
  return (rows || []).filter((r) => names.indexOf(r.name) !== -1);
}

function git(repo, args) {
  return new Promise((resolve) => {
    const p = spawn('git', args, { cwd: repo });
    let text = '';
    p.stdout.on('data', (c) => { text += c; });
    p.on('error', () => resolve(null));
    p.on('close', (code) => resolve(code === 0 ? text : null));
    setTimeout(() => resolve(null), 5000);
  });
}

export async function remoteBehind(repo) {
  await git(repo, ['fetch', '--quiet', 'origin']);
  const counts = await git(repo, ['rev-list', '--left-right', '--count', 'HEAD...origin/main']);
  if (!counts) return null;
  const parts = counts.trim().split(/\s+/);
  return { ahead: parseInt(parts[0], 10) || 0, behind: parseInt(parts[1], 10) || 0 };
}

export async function cmdCheck(args, client, env) {
  const dbPath = path.join(client.dir, 'config.db');
  if (!fs.existsSync(dbPath)) {
    env.out('check · 读取失败', [
      '  找不到 ' + dbPath,
      '  下一步：wyht-skill clients list 确认登记的目录；换包后重新 clients add',
    ]);
    return 4;
  }
  let cfg;
  try {
    cfg = readShellConfig(dbPath);
  } catch (err) {
    env.out('check · 读取失败', [
      '  ' + (err && err.message ? err.message : err),
      '  下一步：确认客户端未被占用、database 文件未损坏',
    ]);
    return 4;
  }
  const verdict = classify(cfg);
  const version = deriveClient(client.dir).version;
  env.out('check · ' + verdict.env, [
    '  客户端 ' + client.dir,
    '  版本   ' + (version || '未识别') + '（' + versionSemantics(version).text + '）',
    '  ServerUrl ' + (cfg.ServerUrl || '<空>') + '  HospitalId ' + (cfg.HospitalId || '<空>'),
    '  判定   ' + verdict.reason,
  ]);
  return checkExitCode(verdict.env);
}

export async function cmdDoctor(args, project, client, env) {
  const ports = resolvePorts((await listeningPorts()) || []);
  const procs = resolveProcesses(await processesByName([client.exe]), [client.exe, 'czht.exe', 'iu.Hrball.exe']);
  const webStatus = await httpStatus(project.webUrl + '/');
  const pages = await listPages();
  const delta = await remoteBehind(env.repoDir);
  const pkg = JSON.parse(fs.readFileSync(path.join(env.repoDir, 'package.json'), 'utf8'));
  env.out('doctor · 已收集', buildDoctorReport({
    nodeVersion: process.version,
    pythonVersion: null,
    repoVersion: pkg.version,
    behind: delta ? delta.behind : null,
    ports,
    processes: procs,
    webStatus,
    pages,
    webUrl: project.webUrl,
  }));
  return 0;
}

export async function cmdStart(args, project, client, env) {
  const ports = (await listeningPorts()) || [];
  const webStatus = await httpStatus(project.webUrl + '/');
  const pages = await listPages();
  const pre = startPreflight({ port9222: ports.indexOf(9222) !== -1, webStatus, pages, webUrl: project.webUrl });
  if (pre.exitCode !== 0) {
    env.out('start · 前置条件未满足', [pre.message]);
    return pre.exitCode;
  }
  const url = buildStartUrl({ webUrl: project.webUrl, hisUserId: project.hisUserId, log: args.log });
  const child = spawn(path.join(client.dir, client.exe), ['--url=' + url], {
    cwd: client.dir, detached: true, stdio: 'ignore',
  });
  child.unref();
  const timeoutMs = (args.timeout || 30) * 1000;
  const hit = await waitForPage((list) => pickPage(list, project.webUrl), { timeoutMs });
  if (!hit) {
    env.out('start · 失败', [
      '  ' + Math.round(timeoutMs / 1000) + 's 内没等到加载本地前端的页面',
      '  日志目录 ' + path.join(client.dir, 'logs'),
      '  下一步：wyht-skill doctor 看端口与进程；确认 dev server 与客户端都没被占用',
    ]);
    return 1;
  }
  const stateFile = path.join(path.dirname(clientsFilePath()), 'state.json');
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, JSON.stringify({ lastPid: child.pid, webUrl: project.webUrl, at: Date.now() }, null, 2), 'utf8');
  env.out('start · 成功', [
    '  PID  ' + child.pid,
    '  页面 ' + hit.url,
    '  包   ' + (args.client || project.client),
    '  下一步：操作复现；页面日志看 frontend/log-service 看板（9321）',
  ]);
  return 0;
}

export async function cmdStop(args, project, client, env) {
  const pages = await listPages();
  const page = pickPage(pages, project.webUrl);
  if (!page) {
    env.out('stop · 前置条件未满足', [
      '  9222 上没有可用的业务页面：' + JSON.stringify((pages || []).map((p) => p.url)),
      '  下一步：按 skill 红线人工处理（不要用 taskkill 代替壳 API）',
    ]);
    return 3;
  }
  const timeoutMs = (args.timeout || 15) * 1000;
  // evaluate 返回 CDP 原样结构，这里只关心调用有没有抛错
  try {
    await evaluate(page, 'initObj.exitApplication()', { timeoutMs });
  } catch (err) {
    env.out('stop · 失败', [
      '  页面 ' + page.url,
      '  ' + (err && err.message ? err.message : err),
      '  下一步：wyht-skill doctor 确认 9222 上列出的页面是本地前端；必要时按 skill 红线人工处理',
    ]);
    return 1;
  }
  const deadline = Date.now() + timeoutMs;
  let verdict = { exitCode: 1, message: '未完成验收' };
  for (;;) {
    const procs = await processesByName([client.exe]);
    const listening = await portListening(9222);
    verdict = stopVerdict({
      processAlive: procs === null ? null : procs.length > 0,
      portListening: listening,
      processes: procs,
    });
    if (verdict.exitCode === 0 || Date.now() > deadline) break;
    await sleep(500);
  }
  env.out('stop · ' + (verdict.exitCode === 0 ? '成功' : '未通过'), ['  页面 ' + page.url, verdict.message]);
  return verdict.exitCode;
}
