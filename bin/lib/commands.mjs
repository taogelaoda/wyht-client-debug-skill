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
    const p = spawn('git', ['-C', repo].concat(args), { windowsHide: true });
    let text = '';
    p.stdout.on('data', (c) => { text += c; });
    p.stderr.on('data', (c) => { text += c; });
    // 收成一行：git 的多行提示会冲散命令输出
    const oneLine = () => {
      const flat = text.replace(/\s+/g, ' ').trim();
      return flat.length > 160 ? flat.slice(0, 160) + '…' : flat;
    };
    p.on('error', () => resolve({ ok: false, text: 'git 不可用' }));
    p.on('close', (code) => resolve({ ok: code === 0, text: oneLine() }));
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
  if (!inStandardLayout && /[^\x00-\x7f]/.test(nodeTarget)) {
    throw new Error('仓库路径含非 ASCII 字符（' + nodeTarget + '）；下一步：把技能仓库放到纯 ASCII 路径，或改用引导器安装到 %LOCALAPPDATA%');
  }
  // 先读 package.json：仓库不是 skill 仓库时在写任何文件之前就失败
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  // 刷新只在 git 仓库里做，失败只警告：装不装得上不取决于能不能联网
  let refresh = '未刷新（不是 git 仓库）';
  if (fs.existsSync(path.join(repo, '.git'))) {
    if (args && args.ref) {
      const co = await runGit(repo, ['checkout', '--quiet', args.ref]);
      if (!co.ok) console.error('警告：切不到 ' + args.ref + '（' + co.text + '），保持当前引用');
    }
    const pull = await runGit(repo, ['pull', '--ff-only', '--quiet']);
    refresh = pull.ok ? '已刷新' : '刷新跳过（' + pull.text + '）';
    if (!pull.ok) console.error('警告：' + refresh);
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
