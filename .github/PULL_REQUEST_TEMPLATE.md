<!-- hub-submission-pr -->
<!--
投稿 PR 请完整填写下面的勾选项；维护者的代码 PR / 内部数据 PR 可以忽略本模板内容。
规则的唯一真源是仓库根目录的 CONTRIBUTING.md（站点 /submit/ 页在构建时引入同一份文件，二者不得分叉）。

说明：PR 描述里保留上面那行 `hub-submission-pr` 标记时，CI 会按投稿规则检查本 PR 的变更范围
（只允许 src/data/projects/<slug>.yaml 与 public/screenshots/<slug>.webp）。
如果你提的不是投稿 PR，删掉那行标记即可跳过该检查。
-->

## 变更类型

- [ ] 新材料（第三方项目首次收录）
- [ ] 官方项目上架 / 更新（`source: official`）
- [ ] 更新既有条目（改名 / 仓库迁移 / 部署方式 / 免费层变化）
- [ ] 下架（`status: delisted`）
- [ ] 其他（请在下方说明）

## 条目信息

| 项                              | 值                                 |
| ------------------------------- | ---------------------------------- |
| 数据文件                        | `src/data/projects/` 下的哪个文件  |
| `slug`                          |                                    |
| `repo`（上游原仓库，不是 fork） |                                    |
| `source`                        | `third-party` / `official`         |
| `category`                      |                                    |
| `deploy.method`                 |                                    |
| `tier`                          | `listed` / `verified` / `official` |

## 收录门槛逐项勾选（五条全过才可收录，每条都要附证据链接）

- [ ] **1. 开源且许可证明确**：仓库根目录有 LICENSE，且 GitHub 能识别出许可证类型（无许可证一律不收）
  - 证据（LICENSE 文件链接）：
- [ ] **2. 真实可部署在 Cloudflare Workers 或 Pages**：有 wrangler 配置 / Pages 配置，或明确成型的部署文档；仅「理论上能跑」不算
  - 证据（配置文件路径或部署文档链接）：
- [ ] **3. 近 12 个月内有代码更新**：构建时由自动字段 `pushed_at` 判定（老牌稳定项目请在此写豁免理由）
  - 证据（豁免理由；无需手写 `pushed_at`）：
- [ ] **4. 部署步骤可复现**：README 或文档含完整部署章节，本人按文档跑通过
  - 证据（章节链接 + 实际步骤摘要）：
- [ ] **5. 免费层可跑，或付费要求写在明处**：`free_tier` 与 `pricing_note` 与仓库文档一致
  - 证据（价格 / 免费层限制说明链接）：

## 数据合规自查

- [ ] `slug` 与文件名一致（`src/data/projects/<slug>.yaml`），且不与现有项目重复（CI 按 slug 与 repo 双维度查重）
- [ ] 没有手写 GitHub 自动字段（star / fork / 语言 / 许可证 / `pushed_at` / archived / 最新 release / Open Graph 图）
- [ ] 本 PR **只**新增或修改了 `src/data/projects/<slug>.yaml`（可选 `public/screenshots/<slug>.webp`），没改代码、依赖、工作流、模板，也没动别人的条目
- [ ] 中文文案为本人撰写（不是机翻），与该项目的实际功能一致，部署方式与难度**宁可低标不高标**
- [ ] 如填了 `screenshot`：webp 格式、宽度 ≥1200px、体积 ≤300KB，文件名为 `<slug>.webp`
- [ ] 如填了 `tier: verified`：已附 `verified_at` 与 `verified_note_url`（第三方投稿请保持 `listed`，由维护者实测后升级）

## 验证等级声明

- [ ] `listed`（已收录，未实测——第三方投稿默认）
- [ ] `verified`（已验证，附验证记录链接）
- [ ] `official`（仅 WorkerHub 官方项目可用）

## 上架后需要更正 / 作者异议

条目信息有误、或你是被收录项目的作者希望更正/移除，请在本仓库开 issue 说明 `slug` 与诉求（见 CONTRIBUTING 第 9 节，移除不设门槛）。

## 声明

- [ ] 我确认以上信息准确；如为第三方项目，我理解其版权与责任归项目作者，本站收录不构成对质量或安全性的担保
