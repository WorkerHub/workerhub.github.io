# WorkerHub hub · 首页/目录站

Cloudflare Workers 生态的中文精选应用目录：官方自研项目 + 经收录把关的第三方开源项目，每个项目标清部署方式、所需资源与验证等级。

**本站是纯静态站点**：无后端、无数据库、无鉴权、无站点级 secret（SPEC v1.4 §0 明示例外项）。构建产物是纯静态 HTML，同时发布到主站 `hub.oneboy.app`（Cloudflare Pages）与镜像 `workerhub.github.io`（GitHub Pages），canonical 恒写主域名。

> 本仓库当前处于 S1-A 阶段：脚手架 + 数据管线（schema 校验 + GitHub 自动字段抓取 + 缓存降级）。正式页面与组件、内容数据、投稿基建、双线部署分属后续子单，见文末「范围」。

## 技术栈（SPEC §8.1）

- **Astro 7 + TypeScript**，`output: 'static'`（SSG），零默认 JS，interactive 部分后续用 Astro islands
- **Tailwind CSS 4**（`@tailwindcss/vite`）
- 包管理 **pnpm**；Node 版本由 `.nvmrc` + `engines` 锁定为 **24**，CI 与本地一致

## 常用命令

```bash
pnpm install            # 安装依赖
pnpm dev                # 本地开发（http://localhost:4321）
pnpm build              # 构建：读数据 → schema 校验 → 抓取/合并自动字段 → 输出 dist/
pnpm preview            # 预览 dist/
pnpm validate:data      # 只跑数据文件 schema 校验
pnpm fetch:meta         # 只跑 GitHub 自动字段抓取
pnpm lint               # astro check（类型检查）+ prettier --check
pnpm format             # prettier 自动格式化
pnpm test               # 单元 + 集成测试（node:test）
```

- **构建产物目录：`dist/`**（双线部署都从这里取；CF Pages 构建命令 `pnpm build`，输出目录 `dist`）
- **构建命令：`pnpm build`**（本地与 CI 同一条命令、同一份产物，SPEC §9.1）

## 数据管线（SPEC §4.1 / §9）

```
src/data/projects/<slug>.yaml        人工字段（唯一真源，内容子单维护）
        │  schema 校验（zod，src/lib/project-schema.ts）
        ▼
scripts/fetch-github-meta.ts         GitHub API 抓自动字段（§9.2 白名单）
        │  失败 → 回退缓存 → 无缓存则置空
        ▼
src/data/cache/github-meta.json      自动字段缓存（随构建滚动更新并提交）
        ▼
astro build                         每项目详情页 / 列表页读「人工字段 + 自动字段」
```

- 数据文件是按 §4.1 定义的 `zod` strict 对象：**字段非法、枚举越界、出现未知键或手写自动字段 → 构建失败并点名文件与字段**，不会静默跳过坏数据上线。
- 同一份 schema 同时被 Astro Content Collections（`src/content.config.ts`）与 CI 校验脚本使用，两层都拦，不会分叉。
- 自动字段只取 §9.2 白名单：`stargazers_count`、`forks_count`、`language`、`license.spdx_id`、`pushed_at`、`archived`、`releases/latest`、`open_graph_image`。

### 自动字段容错（§9.2 硬性）

| 情况                         | 行为                                                        |
| ---------------------------- | ----------------------------------------------------------- |
| 抓取成功                     | 写回缓存                                                    |
| 网络故障 / 超时 / 5xx / 限流 | 用 `src/data/cache/github-meta.json` 上次结果兜底，构建继续 |
| 抓取失败且无缓存             | 该项目自动字段置空，页面正常渲染（排序降级为收录日期）      |
| 仓库 404（不存在或私有）     | **判为数据错误 → 构建失败**（§7 要求 CI 明确失败）          |

缓存文件只记录既有事实，缺失/损坏时按空缓存处理并打警告，不会阻塞构建。

### 环境变量

生产构建无需任何变量。以下只用于本地调试、演练与 CI：

| 变量               | 默认                              | 说明                                                                               |
| ------------------ | --------------------------------- | ---------------------------------------------------------------------------------- |
| `GITHUB_TOKEN`     | 空                                | CI 用工作流自带只读 token；本地缺省走未认证额度。**不要求、也不允许任何 PAT 入仓** |
| `GITHUB_API_BASE`  | `https://api.github.com`          | 演练时指向不可达地址即可模拟 API 故障                                              |
| `HUB_SKIP_FETCH`   | 空                                | 置 `1` 完全跳过抓取，只用缓存/空值                                                 |
| `HUB_PROJECTS_DIR` | `src/data/projects`               | 数据文件目录（演练/测试用）                                                        |
| `HUB_META_CACHE`   | `src/data/cache/github-meta.json` | 自动字段缓存位置                                                                   |
| `HUB_META_REPORT`  | `github-meta-report.json`         | 本次抓取报告（未入库，CI 可取用）                                                  |
| `HUB_VERSION`      | 空                                | 覆盖页脚版本号；缺省现场取 `git describe --tags --always --dirty`                  |

### 降级演练（SPEC §12 第 3 条）

```bash
# 演练 A：API 不可达 + 有缓存 → 走缓存兜底，构建成功
GITHUB_API_BASE=http://127.0.0.1:9 HUB_PROJECTS_DIR=tests/fixtures/projects-run \
HUB_META_CACHE=tests/.tmp/cache.json pnpm build

# 演练 B：API 不可达 + 无缓存 → 自动字段置空，构建成功
GITHUB_API_BASE=http://127.0.0.1:9 HUB_PROJECTS_DIR=tests/fixtures/projects-run \
HUB_META_CACHE=tests/.tmp/empty.json pnpm build

# 演练 C：非法数据 → 构建失败并点名字段
HUB_PROJECTS_DIR=<放了一个坏文件的目录> pnpm build
```

`tests/fixtures/projects-run/` 是演练夹具（指向两个真实 public 仓库），`tests/fixtures/projects/` 是 schema 夹具。两者都不是正式内容。

## 目录结构

```
astro.config.mjs            site = https://hub.oneboy.app（canonical 恒写主域名）
src/content.config.ts       Content Collections 定义（glob loader + zod schema）
src/data/projects/          项目数据文件（内容子单维护）
src/data/cache/             GitHub 自动字段缓存
src/lib/project-schema.ts   数据字段/枚举定义（冻结契约）
src/lib/validate-projects.ts 集合级校验（slug 与文件名一致、slug/repo 查重）
src/lib/github-meta.ts      抓取、缓存、降级、异常清单
src/lib/projects.ts         页面侧取数入口（人工字段 + 自动字段合并、默认排序）
src/lib/build-info.ts       版本号 / 构建时间
src/pages/index.astro       占位页（正式页面由 S2-A 替换）
scripts/                    validate-data.ts / fetch-github-meta.ts
tests/                      单测 + 进程级集成测试 + 夹具
.github/workflows/ci.yml    校验与演练（不含发布）
```

## 双线部署设置核对表（供部署子单执行，本单不碰）

| 项                           | 值 / 要求                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| 主站托管                     | Cloudflare Pages，项目连 `WorkerHub/workerhub.github.io`                                                                  |
| 主站生产分支                 | `main`                                                                                                                    |
| CF Pages 构建命令            | `pnpm build`                                                                                                              |
| CF Pages 输出目录            | `dist`                                                                                                                    |
| CF Pages 环境变量            | 无需业务变量；GitHub 抓取可选注入 `GITHUB_TOKEN`（只读）                                                                  |
| 域名                         | `hub.oneboy.app` 为主域名；`workerhub.oneboy.app` 301 到主域名                                                            |
| 镜像托管                     | GitHub Pages，来源 = **GitHub Actions**                                                                                   |
| GitHub Pages 自定义域名栏    | **必须留空**（填任何域名都会让镜像变跳转、双线失效）                                                                      |
| canonical / sitemap 绝对地址 | 恒为 `https://hub.oneboy.app`，镜像侧同样如此，不按访问域名动态生成                                                       |
| 每日重建                     | 同一个工作流：刷新数据构建 → 发布 GitHub Pages → 用 CF Pages deploy hook 触发主站同版重建（hook URL 只进 GitHub Secrets） |
| 发布失败                     | 两侧各自独立报错，一侧失败不阻塞另一侧                                                                                    |

## 范围（防止顺带扩大，SPEC §11）

- 本单（S1-A）：脚手架、数据管线（schema + 抓取 + 缓存降级）、能让 `pnpm build` 跑通的占位页、CI 校验与演练。
- 不在本单：正式页面/组件与主题（S2-A）、官方与第三方内容数据（内容子单）、CONTRIBUTING 与 PR 模板、每日重建与双线发布（部署子单）、PR 合并与域名绑定（用户关口）。
- 本站不加后端、不加 D1/KV/DO/R2、不加登录鉴权、不引入任何 secret（SPEC §0）。
