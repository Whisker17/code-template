import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PKG = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));

// 模拟 npx skills add：只复制 skill 目录到隔离位置，确认打包版不依赖仓库里的任何文件。
test('bundle: skill 目录单独复制出去后仍能渲染', () => {
  const dir = mkdtempSync(join(tmpdir(), 'am-bundle-'));
  try {
    // 只复制运行时需要的部分（不含 dev/ 源码），确认打包版自给自足。
    const skillRoot = join(ROOT, '..');
    cpSync(skillRoot, join(dir, 'answer-me-with-html'), { recursive: true, filter: (p) => !relative(skillRoot, p).split(sep).includes('dev') });
    const cli = join(dir, 'answer-me-with-html/scripts/am.mjs');
    const env = { ...process.env, AM_NO_OPEN: '1', AM_NO_BAKE: '1' };

    const version = spawnSync(process.execPath, [cli, '--version'], { encoding: 'utf8', env });
    assert.equal(version.stdout.trim(), PKG.version, '打包版版本号应与 package.json 一致（忘了 npm run build？）');

    const out = join(dir, 'out.html');
    const r = spawnSync(process.execPath, [cli, 'render', '-', '-o', out], {
      input: '---\ntitle: 打包测试\n---\n## A\n```flow\nA -> B\n```\n', encoding: 'utf8', env, cwd: dir,
    });
    assert.equal(r.status, 0, r.stderr);
    const html = readFileSync(out, 'utf8');
    assert.match(html, /<h1>打包测试<\/h1>/);
    assert.match(html, /class="am-node /);
    assert.match(html, /--font-mono/, 'CSS 已内联');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
