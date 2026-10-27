import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const dir = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
let passed = 0;
const failures = [];

for (const file of files) {
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  for (const c of mod.default || []) {
    try {
      await c.fn();
      passed += 1;
      console.log('PASS  ' + file + ' :: ' + c.name);
    } catch (err) {
      failures.push({ file, name: c.name, err });
      console.log('FAIL  ' + file + ' :: ' + c.name + '\n      ' + (err && err.message));
    }
  }
}

console.log('\n结果: ' + passed + ' 通过 / ' + failures.length + ' 失败');
process.exit(failures.length ? 1 : 0);
