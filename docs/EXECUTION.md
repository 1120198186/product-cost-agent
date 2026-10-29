# 宿主执行与数据交接

宿主读 `agent/AGENT.md` 并组织实际调用；不需要适配本项目的网络API。`workflow.json`描述逻辑依赖，可映射到平台自己的任务/子线程机制。

## 回合

每个逻辑线程使用固定逻辑ID；每轮一个新的物理执行ID/会话。不携带其他成本项历史，上一轮必要产物和证据作为新输入。每轮内部的工具调用次数与推理策略由模型按任务决定。不要用一次模型调用的多个标题冒充多个回合。

第一步规划→拆分→验证，输出后冻结 `project.json` 的字节和SHA256。第二步先作粗略来源分配，每项规划结果决定是否对标和使用哪种模型，然后取价、独立分析。第三步沿用第一步工艺和第二步包范围，不把其他部件报价全传给工艺线程；来源目标可沿用或按本轮补分配。

相互独立项可并行，宿主按自身资源安排并发，不降低模型/推理档位。依赖产物通过后直接调度下一轮，无主线程语义评审。机械校验失败时另建修复回合，携原错误及必要上下文，不改原记录，不无限重试；持续失败保留该项缺口而非伪造成功。模型可纠正前轮判断，但不能静默改冻结拆分。

## 输入结构

`prepare_round.py`接受一个JSON对象，不强制套无关字段。通常提供：

- `userRequest`：本次用户已授权目标和特殊口径。
- `product`：产品名、版本、计量单位、必要背景和先验。
- `nodeSnapshot`：当前项完整冻结字段；第一步则给产品已有资料。
- `relatedScopes`：只给会改变当前费用包含关系的其他包边界，不给其研究史。
- `sourceTarget`、`sourceTargetMeaning`：本项来源建议数及含义，不传粗略金额锚点。
- `priorResult`：上一轮必要事实、所选路径、参照、来源、未知与限制；最终分析轮需要完整本项报价/模型数据。
- `knowledge`：与本项相关且有适用范围的知识条目，区分已确认与候选。
- `humanApproval`：仅在宿主收到实际批准后注入，注明对象、版本、批准人/时间/理由。

若资料很长，保留必要结论和可访问的明确引用，允许按需补读；不能只写“参考上文”。不要求中间产物强制短小，不能为省token漏掉采购范围、可比限制或真实阶梯。

## 输出

第一步使用 `assets/schemas/decomposition.schema.json`。冻结时宿主添加项目 `id`、`status=ready`，保存真实日期及输入。节点ID用于后续绑定，不能因显示名变化自动新建费用。

最终单项遵循 `assets/schemas/cost-item-contract.md`。装配整份研究：

```json
{
  "schemaVersion": 1,
  "id": "product-study-v1",
  "sourceProjectId": "product",
  "sourceSha256": "冻结project.json的真实SHA256",
  "researchedOn": "实际研究日期YYYY-MM-DD",
  "createdAt": "实际ISO时间",
  "promptIndex": "research-runs/run-id/index.html",
  "runPath": "research-runs/run-id",
  "productUnit": "台",
  "summary": "本轮已估范围及主要限制",
  "scopeSummary": "本次用户授权范围",
  "items": []
}
```

`items`填真实最终单项。允许用户仅要求第二/三步的部分研究，但必须列未研究范围，不把没有记录视作零。`raw.researchRounds`写实际已完成回合的相对prompt/result路径。节点的采购数量与每成品数量不是一回事，按 `usagePerProduct` 只乘一次。

推荐目录：

```text
runs/<run-id>/
  project.json                 # 冻结、不可被估价改写
  study.json                   # 新研究版本
  approvals.json               # 宿主认可的独立人工批准记录
  research-runs/<run-id>/
    decomposition/<phase>/
    items/<node-id>/<phase>-<revision>/
      input.json
      prompt.md
      round.json
      result.json
      result.md
      evidence/...
  report/                      # 固定模板渲染
```

`record_round.py --execution`接收宿主提供的JSON：

```json
{
  "executionId": "宿主实际返回的执行ID",
  "mode": "live",
  "configurationInheritance": true,
  "modelProfile": {"model": null, "reasoningEffort": null},
  "configurationNote": "继承主配置；宿主未暴露实际型号/档位"
}
```

宿主暴露实际值则填实际值。`live/replay/test`必须真实；工具只记录声明，无法替宿主证明已联网或模型确实运行。`recorded`只表示结果已归档，不代表估价质量通过。

## 人工审核与修订

人工区间独立于研究，报告导出JSON是人工选择。弱对标批准另由可信宿主人员入口取得，不能让子模型生成自己的批准。`approvals.json`以nodeId为键，值至少含 `approved:true, approvedBy, approvedAt, reason`；应额外绑定参照对象/研究版本。校验工具会核对研究内批准对象与该独立记录相等，身份鉴别由宿主负责。

获批后只为该项新建pricing、analysis版本回合，更新需要复核的价格，保留旧项结果。修改拆分需建立新的第一步版本、重新匹配受影响估值，旧人工采用区间待复核。归档和研究版本不靠修改同名文件掩盖历史。
