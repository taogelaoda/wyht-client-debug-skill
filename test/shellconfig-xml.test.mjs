// test/shellconfig-xml.test.mjs —— 2.x（C# 壳）的 XML 配置与配置源探测
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readXmlShellConfig, detectShellConfig } from '../bin/lib/shellconfig.mjs';

const XML = `\ufeff<?xml version="1.0" encoding="utf-8"?>
<configuration>
  <appSettings>
    <add key="ClientVersion" value="2.1.7.3" />
    <add key="IsFirstRun" value="false" />
    <add key="ServerUrl" value="http://172.17.28.67:81/iuPublicClientServer" />
    <add key="HospitalId" value="8926" />
    <add key="NotInterested" value="x" />
  </appSettings>
</configuration>`;

function makeDir(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wyht-cfg-'));
  for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), content);
  return dir;
}

export default [
  {
    name: 'XML 配置只取关心的键，忽略其它 appSettings',
    fn: () => {
      const dir = makeDir({ 'iu.Hrball.exe.config': XML });
      const cfg = readXmlShellConfig(path.join(dir, 'iu.Hrball.exe.config'));
      assert.strictEqual(cfg.ServerUrl, 'http://172.17.28.67:81/iuPublicClientServer');
      assert.strictEqual(cfg.IsFirstRun, 'false');
      assert.strictEqual(cfg.HospitalId, '8926');
      assert.strictEqual(cfg.NotInterested, undefined);
    },
  },
  {
    name: '配置源优先 config.db，其次 <exe>.config',
    fn: () => {
      const both = makeDir({ 'config.db': '', 'iu.Hrball.exe.config': XML });
      assert.strictEqual(detectShellConfig({ dir: both, exe: 'iu.Hrball.exe' }).kind, 'sqlite');

      const legacy = makeDir({ 'iu.Hrball.exe.config': XML });
      const src = detectShellConfig({ dir: legacy, exe: 'iu.Hrball.exe' });
      assert.strictEqual(src.kind, 'xml');
      assert.ok(src.path.endsWith('iu.Hrball.exe.config'));

      const empty = makeDir({ 'readme.txt': 'x' });
      assert.strictEqual(detectShellConfig({ dir: empty, exe: 'iu.Hrball.exe' }), null);
    },
  },
];
