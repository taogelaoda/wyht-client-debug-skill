import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DatabaseSync } from 'node:sqlite';
import { readShellConfig, classify, checkExitCode } from '../bin/lib/shellconfig.mjs';

function makeDb(rows) {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wyht-db-')), 'config.db');
  const db = new DatabaseSync(file);
  db.exec('create table iu_Hrball_exe (key text primary key, value text)');
  const insert = db.prepare('insert into iu_Hrball_exe (key, value) values (?, ?)');
  rows.forEach(([k, v]) => insert.run(k, v));
  db.close();
  return file;
}

export default [
  {
    name: '读出五个键',
    fn: () => {
      const file = makeDb([['IsFirstRun', 'false'], ['ServerUrl', 'http://1.2.3.4/x'], ['HospitalId', '8926']]);
      const cfg = readShellConfig(file);
      assert.strictEqual(cfg.IsFirstRun, 'false');
      assert.strictEqual(cfg.ServerUrl, 'http://1.2.3.4/x');
      assert.strictEqual(cfg.HospitalId, '8926');
    },
  },
  {
    name: 'IsFirstRun=true → install',
    fn: () => {
      assert.strictEqual(classify({ IsFirstRun: 'true', ServerUrl: 'http://x' }).env, 'install');
    },
  },
  {
    name: 'IsFirstRun 缺失按安装态处理',
    fn: () => {
      assert.strictEqual(classify({ ServerUrl: 'http://x' }).env, 'install');
      // 值两侧有空白、SQL NULL 都算安装态，与 python 一致
      assert.strictEqual(classify({ IsFirstRun: ' 1 ' }).env, 'install');
      assert.strictEqual(classify({ IsFirstRun: null, ServerUrl: 'http://x' }).env, 'install');
      // 但空串不是缺键：继续按 ServerUrl 判定
      assert.strictEqual(classify({ IsFirstRun: '', ServerUrl: 'http://1.2.3.4/x' }).env, 'direct');
    },
  },
  {
    name: 'ServerUrl 为空 → install',
    fn: () => {
      assert.strictEqual(classify({ IsFirstRun: 'false', ServerUrl: '' }).env, 'install');
    },
  },
  {
    name: '内网地址 → frontend',
    fn: () => {
      assert.strictEqual(classify({ IsFirstRun: 'false', ServerUrl: 'http://172.17.28.67:81/iuPublicClientServer' }).env, 'frontend');
      // 回环 / 单段机器名 / 内网后缀 / CGNAT
      ['http://127.0.0.1:8080/', 'http://hisserver/', 'http://his.lan/', 'http://100.64.0.1/'].forEach((url) => {
        assert.strictEqual(classify({ IsFirstRun: 'false', ServerUrl: url }).env, 'frontend', url);
      });
    },
  },
  {
    name: '公网域名 → direct',
    fn: () => {
      assert.strictEqual(classify({ IsFirstRun: 'false', ServerUrl: 'https://his.example.com/api' }).env, 'direct');
    },
  },
  {
    name: '退出码映射 2/3/0',
    fn: () => {
      assert.strictEqual(checkExitCode('install'), 2);
      assert.strictEqual(checkExitCode('frontend'), 3);
      assert.strictEqual(checkExitCode('direct'), 0);
    },
  },
];
