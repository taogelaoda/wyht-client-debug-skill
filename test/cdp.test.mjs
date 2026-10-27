import assert from 'assert';
import { pickPage, cdpEndpoint } from '../bin/lib/cdp.mjs';

const pages = [
  { type: 'page', url: 'devtools://devtools/devtools_app.html', id: '0' },
  { type: 'page', url: 'about:blank', id: '1' },
  { type: 'page', url: 'http://172.17.28.67:81/yl-client-web/home', id: '2' },
  { type: 'page', url: 'http://localhost:8080/yl-client-web/login?x=1', id: '3' },
];

export default [
  {
    name: 'pickPage 优先本地前端前缀并排除 about:',
    fn: () => { assert.strictEqual(pickPage(pages, 'http://localhost:8080/yl-client-web').id, '3'); },
  },
  {
    name: 'pickPage 无匹配时跳过 devtools 与 about，退回第一个业务页',
    fn: () => { assert.strictEqual(pickPage(pages, 'http://nope/').id, '2'); },
  },
  {
    name: 'pickPage 全 about 时返回 null',
    fn: () => { assert.strictEqual(pickPage([{ type: 'page', url: 'about:blank', id: '9' }], 'http://x/'), null); },
  },
  {
    name: 'cdpEndpoint 固定本机 9222',
    fn: () => { assert.strictEqual(cdpEndpoint('/json/list'), 'http://127.0.0.1:9222/json/list'); },
  },
];
