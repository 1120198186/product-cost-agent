# 产品成本估算 Agent

输入公司、产品名和已知信息，得到一级成本拆分、部件及成品工艺估价，并在同一关系图中审阅来源、对标理由、价差解释和人工采用区间。

这是可交给内部平台执行的**独立 Agent 定义与固定资产包**，不采用 Skill 交付形式。平台按 Agent 定义负责实际模型调用、联网和子会话调度；仓库不绑定平台 API，不附加一套用户未要求的模型服务。

## 给内部平台的入口

先读 [`agent/AGENT.md`](agent/AGENT.md)，按 [`agent/workflow.json`](agent/workflow.json) 执行。`agent/manifest.json` 提供入口和能力清单，是本项目的可读清单，不声称是某平台的原生导入格式。

平台需要一份完整文本时，可读 [`agent/COMPLETE_AGENT.md`](agent/COMPLETE_AGENT.md) 或 Release 的 `agent-complete-instructions.md`。这是同一规则的完整导入稿；实际执行仍按阶段只取相关上下文，避免每个子线程加载全部规则。

GitHub Releases 提供：

- **`product-cost-agent-complete-v1.0.0.zip`**：完整交付，直接把这个包交给平台最方便。
- **`agent-definition-v1.0.0.zip`**：Agent 入口、工作流、规则、阶段提示词及上下文/归档工具。
- **`fixed-assets-v1.0.0.zip`**：HTML/CSS/JS模板、数据接口、校验和渲染工具。

分开的两个包解压到同一个项目目录即可配套使用；完整包已包含二者。`dist/SHA256SUMS`（Release附件）用于核验。

## 固定与可变内容

| 类别 | 位置 | 用法 |
|---|---|---|
| 固定资产 | `assets/web/`、`assets/schemas/`，渲染/校验工具 | 每轮填数据，复用模板与接口；不让模型每次重写页面 |
| 可迭代 Agent 内容 | `agent/AGENT.md`、`workflow.json`、`rules/`、`prompts/` | 保存已确认目标、执行路径及业务规则，按版本更新 |
| 可变知识资产 | `knowledge/` | 原材料价、阶梯、工艺/质量/面积系数及处理经验；有来源、日期、适用范围和确认状态 |
| 每次运行的数据 | `runs/<run-id>/`，默认不入Git | 冻结拆分、证据、完整提示词/实际执行记录、研究结果、人工审核；不自动变成通用规则 |

公开仓库没有森云实际研究档案、内部报价、人工审核记录、账号配置或凭证。`examples/demo/` 是显式标记的合成接口测试，**不能作为成本知识或真实报价**。

## 已固化的执行约定

- 第一步一个产品逻辑线程，规划、拆分、验证分别执行。一级组成仅分组；数量、范围、排重、型号/供应商及工艺采用关系在此冻结。
- 第二、三步每成本项独立子线程，各自规划、必要对标、取价计算、独立价差验证。每轮是真实独立调用，继承主模型和推理档位，自动交接必要产物，无主线程逐轮语义审批。
- 先追求最接近成本：原件/实际供应对象优先，其次准确型号其他供货商；必要时选最接近的1–2个价值对标。确实只有弱对标才暂停该项目标金额，等人员审核。
- 只把真实数值放入价格库，按企业去重、中国/中国以外分类；建议来源数量仅按粗略成本份额，至少3条为搜索目标，不足不凑。
- 采购使用实际公开阶梯；制造默认成熟大批量平均单件。用户指定数量才补缺档估计，用户选择真实批次才研究产销/排产依据，不默认1K/10K。
- 注塑采用主动估计质量及适用综合系数；目标本身需开模时单列模具。PCB采用单列核心器件与剩余板卡模型，均不逐个重拆二级小料。
- 工艺继承既定范围，直接报价→资源模型→工程情景；候选执行成本单列，正常循环资源不摊没。大价差要独立查原因、量化驱动，不机械取平均或压窄。
- 同一关系图点击节点查看成本，重要信息在首层，来源阶梯及证据可展开；人工区间与研究独立。

逐条核对见 [`docs/RULE_TRACEABILITY.md`](docs/RULE_TRACEABILITY.md)。实际子会话应只加载当前所需规则及证据，避免全文历史灌入，也不为短而漏关键约束。

## 可选工具（Python 3.9+，标准库即可）

生成一轮完整任务书，**不调用模型**：

```bash
python3 tools/prepare_round.py --stage component-pricing \
  --input examples/demo/round-input.json --route mass \
  --output runs/demo/C-DEMO/pricing-01
```

平台将生成的 `prompt.md` 交给一个独立子会话；实际完成后归档：

```bash
python3 tools/record_round.py --round runs/demo/C-DEMO/pricing-01 \
  --result <实际结果.json> --report <实际结果.md> --execution <宿主执行记录.json>
```

宿主执行记录格式、输入/输出与交接见 [`docs/EXECUTION.md`](docs/EXECUTION.md)。不要把准备提示词、测试数据或重放标成已经运行模型。

校验并生成关系图（下面使用合成示例，不进行研究）：

```bash
python3 tools/validate_artifacts.py --project examples/demo/project.json --study examples/demo/study.json
python3 tools/render_review.py --project examples/demo/project.json --study examples/demo/study.json \
  --media-root examples/demo --output runs/demo/report
```

打开生成的 `runs/demo/report/打开.html`。真实研究有阶段引用时还需 `--archive-root <包含相对研究路径的目录>`；不要生成断链。审核值保存到浏览器，保存本项后导出JSON发回；换研究版本不能直接套用旧值。外部网页和未归档网络图片需联网。

## 验证与范围

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -v
node tests/offline_ui.test.js <生成的打开.html>
python3 tools/build_release.py
```

当前交付验证包括独立规则复检、完整上下文组装、不可覆盖的回合归档、冻结边界/数值/审核状态校验、合成数据渲染及审核导入导出、资产打包完整性。复用的关系图来自已有项目；本次没有在新的内部平台上实际运行模型或重新完成产品估价，不能以文本/接口检查保证所有产品估价质量。平台接手后应以真实代表产品完成验收，见 [`docs/ACCEPTANCE.md`](docs/ACCEPTANCE.md)。

架构与后续记录：[`ARCHITECTURE.md`](ARCHITECTURE.md)、[`ROADMAP.md`](ROADMAP.md)。
