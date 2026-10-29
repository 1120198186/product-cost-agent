# 当前成本项数据接口

输出 currentStudy 的一个 item 对象（不是整份研究），JSON结构如下，下列字段用于模板展示与校验（可扩展，不规定推理过程）：
nodeId, domain, nodeSnapshot（原样输入快照）, summary（面向成本人员）, critical（短文本数组）, methodSteps（文本数组）, coverage:{status:'complete'或'partial',scopeText,missing:[]},
estimate:{low,high,currency:'CNY'或真实币种,unit,kind:'purchase_reference'|'supplier_quote'|'conditional_model'|'unavailable',quantityStrategy:'published_terminal_tier'|'mature_manufacturing'|'engineering_scenario'|'evidenced_batch',basis,label,note,formula,breakdown:[{label,low,high,currency,sourceIds:[]}],evidenceRefs:[]},
usagePerProduct:{low,high,unit（和estimate.unit一致）,basis}或null（颗数未知必须null）, perProductEstimate:{low,high,currency,unit:本轮productUnit}或null；明确每台1份的工艺/采购包可用1。不得把单位采购价当成每台总额。若目标估价待审，estimate.low/high均null、kind='unavailable'。
raw:{classification:{marketType:'commodity'|'proprietary'|'custom'|'unknown',selfDeveloped:true|false|null,basis},identity:{actualModel,actualSupplier,pricingObject,pricingRelation:'actual_supplier'|'exact_model'|'equivalent'|'weak'|'model',explanation},comparisonGate:{status:'pass'|'needs_review'|'not_applicable',reason},
sources:[{id,title,url（真实http链接）,kind:'quote'|'model_parameter'|'technical',region:'china'|'non_china',numericEvidence,notes,capturedOn,verifiedOn,evidenceLevel}],
prices:[{id,name,seller,sourceKey,url,sourceIds:[],quoteKind:'actual_quote'|'reference_quote'|'model_parameter',regionGroup:'china'|'non_china',usage:'estimate'|'reference_only'|'parameter',scope,priceText,capturedOn,verifiedOn,qualityTags:[],tiers:[{minQty（未知可null）,maxQty,unitPrice,currency,unit,quantityBasis}]}],
parameters:[{name,low,high,unit,type:'fact'|'estimate',basis,sourceIds:[],sourceUrls:[]}],
targets:[{id,model,maker,comparability:'exact'|'equivalent'|'weak'|'model_parameter',reason,differences,sources:[{title,url}]}],
spreadAnalysis:{summary,drivers:[{factor,explanation,impact（可用文本说明数额/公式）,evidenceRefs:[],status:'confirmed'|'inferred'|'unresolved'}],primaryReason,unresolved:[],followUp:[]},searchLog:[],coverageNote}。
sources ID唯一，所有sourceIds/evidenceRefs必须有效。工程参数可以引用适用技术依据，但basis必须标明本项目估计，不伪称原文数值。未知不要造来源。breakdown若非空，两侧分别求和等于estimate上下限；不能用不同币种混算。没有适合分解的直接报价用空breakdown。真实区间报价用unitPriceLow/unitPriceHigh替代unitPrice，不造阶梯；无数值页面只列technical，不能进入prices。价格源按独立供货企业去重，与参数来源分别报告。不需要生成旧quantityEstimates或manualRanges。
每个数值模型保留计算公式/参数；建议用计算脚本复算，保存在当前阶段目录。可以用estimate额外字段保留其他情景，不冒充主估计。analysis轮必须提交完整可发布item，不止提交评语。人工批准记录只接受宿主提供的独立记录，模型不得自行填写humanApproval。

raw.researchRounds由宿主按实际回合填入：[{phase,label,promptPath,resultPath}]，路径相对研究根目录，不放本机绝对路径。raw.identity与raw.spreadAnalysis为最终回合必需；字段细节见说明，额外证据可扩展。
