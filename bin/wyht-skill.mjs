#!/usr/bin/env node
// bin/wyht-skill.mjs —— 唯一入口（Node >= 24，零 npm 依赖）
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findProjectFile, readProject, readClients, resolveClient, clientsFilePath } from './lib/config.mjs';
import {
  cmdInstall, cmdClients, cmdInit, cmdCheck, cmdDoctor, cmdStart, cmdStop,
} from './lib/commands.mjs';

export const COMMANDS = ['install', 'clients', 'init', 'check', 'doctor', 'start', 'stop'];

export const HELP = [
  'wyht-skill —— 皖医互通客户端调试技能',
  '',
  '用法：wyht-skill <命令> [选项]',
  '',
  '命令：',
  '  install                机器级：刷新仓库 + 写命令入口（幂等）',
  '  clients list|add|rm    机器级：客户端包登记',
  '  init                   项目级：选包 + 写 .wyht-skill.json + 建 .claude/skills 联接',
  '  check                  壳侧自检（安装态 / 前置机 / 直连）',
  '  doctor                 机器状态：进程、端口、前端、仓库版本',
  '  start                  冷启动并确认加载本地前端',
  '  stop                   壳 API 退出并验收',
  '',
  '选项：--client <名> --no-log --timeout <秒> --force --name <名> --exe <文件名> --use <名> --web-url <地址> --his-user-id <ID> --repo-url <地址> --ref <tag/分支> --help',
].join('\n');

export function parseArgs(argv) {
  const args = {
    command: 'install', sub: null, rest: [], log: true, timeout: null,
    client: null, name: null, exe: null, use: null, ref: null, repoUrl: null, force: false, help: false,
    webUrl: null, hisUserId: null,
  };
  const list = argv.slice();
  if (list.length && list[0].charAt(0) !== '-') {
    const cmd = list.shift();
    if (COMMANDS.indexOf(cmd) === -1) {
      throw new Error('未知子命令：' + cmd + '（可用：' + COMMANDS.join(' / ') + '）');
    }
    args.command = cmd;
  }
  if (args.command === 'clients' && list.length && list[0].charAt(0) !== '-') args.sub = list.shift();
  for (let i = 0; i < list.length; i++) {
    const token = list[i];
    if (token === '--no-log') args.log = false;
    else if (token === '--force') args.force = true;
    else if (token === '--help' || token === '-h') args.help = true;
    else if (token === '--client') args.client = list[++i];
    else if (token === '--name') args.name = list[++i];
    else if (token === '--exe') args.exe = list[++i];
    else if (token === '--use') args.use = list[++i];
    else if (token === '--web-url') args.webUrl = list[++i];
    else if (token === '--his-user-id') {
      const next = list[i + 1];
      // PowerShell 会丢掉空串参数；裸 --his-user-id 等价“清空”
      if (next === undefined || String(next).indexOf('--') === 0) { args.hisUserId = ''; }
      else { args.hisUserId = list[++i]; }
    }
    else if (token === '--ref') args.ref = list[++i];
    else if (token === '--repo-url') args.repoUrl = list[++i];
    else if (token === '--timeout') {
      args.timeout = parseInt(list[++i], 10);
      if (isNaN(args.timeout)) throw new Error('未知选项的值：--timeout 需要秒数');
    }
    else if (token.indexOf('--') === 0) throw new Error('未知选项：' + token + '（用 --help 查看可用选项）');
    else args.rest.push(token);
  }
  return args;
}

export function legacyError(argv) {
  const has = (s) => argv.some((a) => String(a).toLowerCase() === s);
  if (has('status')) return 'status 已并入 doctor：改用 wyht-skill doctor（只读，报告版本/端口/进程/前端）';
  if (has('--project') || has('-project') || has('--client-dir') || has('-clientdir')) {
    return 'install 不再接受项目/客户端参数：机器级用 wyht-skill install；项目级用 wyht-skill init（交互式写配置）';
  }
  if (has('install') && (has('--force') || has('-force'))) {
    return 'install 没有需要强制的对象：强制语义只在 init（异源联接 / 实体目录）上有效';
  }
  return null;
}

function selfDir() {
  return path.dirname(fileURLToPath(import.meta.url));
}

function makeEnv() {
  return {
    repoDir: path.resolve(selfDir(), '..'),
    out: (first, lines) => {
      console.log(first);
      (lines || []).forEach((l) => console.log(l));
    },
    err: (first) => console.error(first),
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const legacy = legacyError(argv);
  if (legacy) {
    console.error('wyht-skill · 参数已变更');
    console.error('  ' + legacy);
    return 1;
  }
  const args = parseArgs(argv);
  if (args.help) {
    console.log(HELP);
    return 0;
  }
  const env = makeEnv();
  const projectRoot = args.rest.length && args.command !== 'clients' ? path.resolve(args.rest[0]) : process.cwd();

  if (args.command === 'install') return cmdInstall(args, env);
  if (args.command === 'clients') return cmdClients(args, env);

  const projectFile = findProjectFile(projectRoot);
  let project = null;
  if (projectFile) {
    try {
      project = readProject(path.dirname(projectFile));
    } catch (err) {
      env.err(args.command + ' · 配置损坏');
      console.error('  ' + (err && err.message ? err.message : err));
      return 3;
    }
  }

  if (args.command === 'init') return cmdInit(args, projectRoot, project, env);

  if (!project) {
    env.err(args.command + ' · 未初始化');
    console.error('  当前目录及上级没有 .wyht-skill.json');
    console.error('  下一步：在项目根运行 wyht-skill init');
    return 3;
  }
  let client;
  try {
    client = resolveClient(readClients(clientsFilePath()), args.client || project.client);
  } catch (err) {
    env.err(args.command + ' · 客户端未登记');
    console.error('  ' + (err && err.message ? err.message : err));
    return 3;
  }

  if (args.command === 'check') return cmdCheck(args, client, env);
  if (args.command === 'doctor') return cmdDoctor(args, project, client, env);
  if (args.command === 'start') return cmdStart(args, project, client, env);
  if (args.command === 'stop') return cmdStop(args, project, client, env);
  return 1;
}

// import.meta.url 是 realpath，argv[1] 是字面路径：经 junction 调用时只有 realpath 比较才相等
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(fileURLToPath(import.meta.url))) {
  main().then((code) => process.exit(code || 0)).catch((err) => {
    console.error('wyht-skill · 失败');
    console.error('  ' + (err && err.message ? err.message : err));
    process.exit(1);
  });
}
