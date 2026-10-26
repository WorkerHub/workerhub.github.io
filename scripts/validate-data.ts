#!/usr/bin/env tsx
/**
 * 数据文件校验（SPEC §4.1 / §7）：字段不合法直接非零退出，CI 因此失败。
 *
 * 用法：
 *   pnpm validate:data
 *   HUB_PROJECTS_DIR=fixtures/projects pnpm validate:data
 */
import { PROJECTS_DIR } from '../src/lib/build-config.js';
import { loadProjects } from '../src/lib/load-projects.js';

const result = loadProjects(PROJECTS_DIR);
if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}

const official = result.projects.filter((p) => p.data.source === 'official').length;
const thirdParty = result.projects.length - official;
console.log(result.message);
console.log(`  官方 ${official} 个 / 第三方 ${thirdParty} 个`);
