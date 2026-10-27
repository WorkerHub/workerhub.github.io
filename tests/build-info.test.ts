/**
 * 页脚版本号回退链的单测（SPEC §0 / §12 第 8、10 条）：
 * ① HUB_VERSION → ② git describe → ③ CF_PAGES_COMMIT_SHA 截 7 位 → ④ v0.0.0-dev。
 * 主站（CF Pages 浅克隆，`git describe` 必失败）与镜像（完整历史）共用这段逻辑，
 * 所以「③ 生效且形态与镜像的短 SHA 一致」是双线同版的关键一条。
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveVersion } from '../src/lib/build-info.js';

const FULL_SHA = '10f8fa9c4e2b7d3a5f60718293a4b5c6d7e8f901';

/** 模拟「有 git 元数据、describe 成功」。 */
const describeOk = (value: string) => () => value;
/** 模拟「浅克隆 / 无 .git，describe 失败」。 */
const describeFails = () => undefined;

test('① HUB_VERSION 覆盖优先于 git describe（本地覆盖不退化）', () => {
  assert.equal(resolveVersion({ HUB_VERSION: 'v1.2.3' }, describeOk('10f8fa9')), 'v1.2.3');
  assert.equal(resolveVersion({ HUB_VERSION: '  v1.2.3  ' }, describeFails), 'v1.2.3');
});

test('② git describe 成功时直接采用（镜像侧路径）', () => {
  assert.equal(resolveVersion({}, describeOk('10f8fa9')), '10f8fa9');
  assert.equal(resolveVersion({}, describeOk('v1.0.0-3-gabcdef1')), 'v1.0.0-3-gabcdef1');
});

test('③ git describe 失败时取 CF_PAGES_COMMIT_SHA 并截短为 7 位（主站侧路径）', () => {
  const version = resolveVersion({ CF_PAGES_COMMIT_SHA: FULL_SHA }, describeFails);
  assert.equal(version, '10f8fa9');
  assert.equal(version.length, 7);
  assert.notEqual(version, 'v0.0.0-dev');
});

test('③ 短 SHA 形态与镜像侧 git describe 输出一致（双线可比对）', () => {
  assert.equal(
    resolveVersion({ CF_PAGES_COMMIT_SHA: FULL_SHA }, describeFails),
    resolveVersion({}, describeOk('10f8fa9')),
  );
});

test('② 优先于 ③：两者都可用时不看 CF_PAGES_COMMIT_SHA', () => {
  assert.equal(
    resolveVersion({ CF_PAGES_COMMIT_SHA: FULL_SHA }, describeOk('v1.0.0-3-gabcdef1')),
    'v1.0.0-3-gabcdef1',
  );
});

test('④ 全都不可用才回退 v0.0.0-dev', () => {
  assert.equal(resolveVersion({}, describeFails), 'v0.0.0-dev');
  assert.equal(
    resolveVersion({ HUB_VERSION: '   ', CF_PAGES_COMMIT_SHA: '  ' }, describeFails),
    'v0.0.0-dev',
  );
});

test('空字符串的 describe 结果不算命中，继续走回退链', () => {
  assert.equal(resolveVersion({ CF_PAGES_COMMIT_SHA: FULL_SHA }, describeOk('')), '10f8fa9');
});
