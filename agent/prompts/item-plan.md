# 本项研究与路径规划

核实当前冻结项身份/规格及决定取价路径的关键事实，只补会改变路线选择的资料。不要在规划轮提前完成逐一候选比较、全量下载或全量报价研究。

部件判明分类、实装型号/供应对象已知程度及自研状态；选择 catalog、mass、pcba 或有理由的 custom_model。工艺选择先直接报价、再资源模型、必要工程情景的实际研究路线。决定是否确实需要单独对标轮，不能为增加阶段而增加。

result.json 至少有 nodeId、route、classification、needsBenchmark、knownFacts、unknowns、researchPlan、evidence（title/url/finding）、handoff。需要对标时说明为何原件路径不足及关键可比参数；用模型时说明主要驱动和参数获取方式。后轮可以据新证据改进路线，保留原因；不能改冻结项。
