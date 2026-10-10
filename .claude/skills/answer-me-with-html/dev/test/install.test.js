// Regression tests for the install layout. Research fork: the skill is the parent of dev/ and ships no plugin manifests, so only the
// SKILL.md path check is kept; test/bundle.test.js copies the skill directory out and renders with it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL = fileURLToPath(new URL('../..', import.meta.url));

test('install: script and reference paths referenced by SKILL.md exist', () => {
  const skill = readFileSync(join(SKILL, 'SKILL.md'), 'utf8');
  const refs = [...skill.matchAll(/\$\{CLAUDE_SKILL_DIR\}\/([\w./-]+)/g), ...skill.matchAll(/\]\(((?:references|examples)\/[\w./-]+)\)/g)].map((m) => m[1]);
  assert.ok(refs.length >= 2);
  for (const rel of refs) assert.ok(existsSync(join(SKILL, rel)), rel);
});
