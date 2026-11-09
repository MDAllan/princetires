// node --test 'scripts/*.test.mjs' — unit tests for theme-check-gate.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseThemeCheckOutput, relFile, flatten, diff } from './theme-check-gate.mjs';

const THEME = '/ci/repo/princetires';
const out = (offenses) => [{ path: `${THEME}/sections/a.liquid`, offenses }];
const off = (check, message, row, severity = 'error') => ({ check, message, severity, start_row: row });

test('parses JSON even with a banner line around it', () => {
  assert.deepEqual(parseThemeCheckOutput('[]'), []);
  assert.deepEqual(parseThemeCheckOutput('Update available!\n[{"path":"x","offenses":[]}]\n'), [{ path: 'x', offenses: [] }]);
  assert.throws(() => parseThemeCheckOutput('boom'));
});

test('paths become theme-relative wherever the repo is checked out', () => {
  assert.equal(relFile(`${THEME}/snippets/b.liquid`, THEME), 'snippets/b.liquid');
  assert.equal(relFile('princetires/layout/theme.liquid', THEME), 'layout/theme.liquid');
});

test('line moves are not new; an extra copy of the same offense is', () => {
  const base = flatten(out([off('ImgWidthAndHeight', 'Missing width', 10), off('ImgWidthAndHeight', 'Missing width', 20)]), THEME);
  assert.equal(base.length, 1);
  assert.equal(base[0].count, 2);

  const moved = flatten(out([off('ImgWidthAndHeight', 'Missing width', 13), off('ImgWidthAndHeight', 'Missing width', 23)]), THEME);
  assert.deepEqual(diff(moved, base).added, []);

  const extra = flatten(out([off('ImgWidthAndHeight', 'Missing width', 1), off('ImgWidthAndHeight', 'Missing width', 2), off('ImgWidthAndHeight', 'Missing width', 3)]), THEME);
  const { added } = diff(extra, base);
  assert.equal(added.length, 1);
  assert.equal(added[0].newCount, 1);
});

test('a different message or file is new; a removed offense is reported as fixed', () => {
  const base = flatten(out([off('LiquidHTMLSyntaxError', 'expected end', 5)]), THEME);
  const now = flatten(out([off('LiquidHTMLSyntaxError', 'div not closed', 5)]), THEME);
  const { added, fixed } = diff(now, base);
  assert.equal(added[0].message, 'div not closed');
  assert.equal(fixed[0].message, 'expected end');
});

test('rejects output that is not Theme Check shaped', () => {
  assert.throws(() => flatten({ nope: true }, THEME));
  assert.throws(() => flatten([{ file: 'x' }], THEME));
});
