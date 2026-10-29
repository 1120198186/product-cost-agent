"""Structural invariants reused from the reviewed cost workspace."""
import re
from urllib.parse import urlparse

def safe_url(url, allow_local=False):
    return isinstance(url,str) and ((allow_local and url.startswith("/assets/") and ".." not in url.split("/")) or (urlparse(url).scheme in ("http","https") and bool(urlparse(url).netloc)))

def validate_project(project):
    """Check invariants that matter to later pricing and citation review."""
    if not isinstance(project, dict) or not isinstance(project.get("nodes"), list):
        raise ValueError("项目缺少节点数组")
    sources = project.get("sources", [])
    source_ids = {s.get("id") for s in sources}
    if len(source_ids) != len(sources) or not all(safe_url(s.get("url", ""), allow_local=True) for s in sources):
        raise ValueError("来源 ID 重复或链接无效")
    nodes = project["nodes"]
    ids = [n.get("id") for n in nodes]
    by_id = {n.get("id"): n for n in nodes}
    if len(ids) != len(by_id) or not ids or any(not i for i in ids):
        raise ValueError("节点 ID 缺失或重复")
    roots = [n for n in nodes if n.get("kind") == "root"]
    if len(roots) != 1 or roots[0].get("parentId"):
        raise ValueError("必须且只能有一个根节点")
    for n in nodes:
        if n.get("kind") not in ("root", "category", "group", "item"):
            raise ValueError("节点类型无效")
        if n.get("costDomain") not in ("component", "process", "overhead"):
            raise ValueError("成本类别无效")
        if n.get("status") not in ("confirmed", "inferred", "unverified"):
            raise ValueError("确认状态无效")
        if n.get("costBoundary") not in ("aggregate", "independent", "included", "pending"):
            raise ValueError("计价边界无效")
        if n.get("kind") != "root" and n.get("parentId") not in by_id:
            raise ValueError("父节点不存在: " + str(n.get("id")))
        if n.get("kind") == "category" and n.get("parentId") != roots[0]["id"]:
            raise ValueError("类别应属于整机")
        if n.get("kind") == "group" and by_id[n["parentId"]].get("kind") != "category":
            raise ValueError("分组应属于类别")
        if n.get("kind") == "item" and by_id[n["parentId"]].get("kind") != "group":
            raise ValueError("项目应属于分组")
        if n.get("kind") not in ("root", "category") and by_id[n["parentId"]].get("costDomain") != n.get("costDomain"):
            raise ValueError("父子节点成本类别不同")
        if n.get("kind") in ("root", "category", "group") and n.get("costBoundary") != "aggregate":
            raise ValueError("汇总节点不能作为独立计价项")
        if n.get("kind") == "item" and n.get("active") and n.get("costDomain") != "overhead" and n.get("costBoundary") != "independent":
            raise ValueError("参与累计的部件和工艺必须是独立一级成本: " + n["id"])
        if n.get("kind") == "item" and n.get("costBoundary") == "included" and n.get("includedIn") not in by_id:
            raise ValueError("已包含项目缺少被包含节点")
        if any(e not in source_ids for e in n.get("evidence", [])):
            raise ValueError("节点引用了不存在的来源: " + n["id"])
        if n.get("kind") == "item" and n.get("costDomain") == "component":
            info = n.get("identification")
            tiers = ("specification", "exact_model_supplier", "exact_model", "similar_part", "benchmark_product", "performance_benchmark")
            fields = ("confirmedModel", "confirmedMaker", "confirmedSupplier", "referenceTier", "referenceModel", "referenceMaker", "match")
            if not isinstance(info, dict) or any(not isinstance(info.get(k), str) for k in fields):
                raise ValueError("物料成本项缺少型号与参考信息: " + n["id"])
            if info["referenceTier"] not in tiers or not info["referenceModel"] or not info["match"]:
                raise ValueError("物料成本项缺少可审阅的参考对象或可比说明: " + n["id"])
            if not isinstance(info.get("path"), list) or not info["path"] or not all(isinstance(step, str) and step.strip() for step in info["path"]):
                raise ValueError("物料成本项缺少逐级查找路径: " + n["id"])
            if not isinstance(info.get("sourceIds"), list) or not info["sourceIds"] or any(s not in source_ids for s in info["sourceIds"]):
                raise ValueError("物料成本项参考来源缺失或无效: " + n["id"])
            if info["referenceTier"] == "exact_model_supplier" and (not info["confirmedModel"] or not info["confirmedSupplier"]):
                raise ValueError("实装型号与供应商未同时证实: " + n["id"])
            if info["referenceTier"] == "exact_model" and not info["confirmedModel"]:
                raise ValueError("实装型号未证实: " + n["id"])
            if info["referenceTier"] in ("exact_model_supplier", "exact_model") and info["referenceModel"] != info["confirmedModel"]:
                raise ValueError("实装型号与参考型号不一致: " + n["id"])
        img = n.get("imageUrl", "")
        if img and not safe_url(img, allow_local=True):
            raise ValueError("图片链接无效: " + n["id"])
        if n.get("imageSourceId", "") and n["imageSourceId"] not in source_ids:
            raise ValueError("图片来源不存在: " + n["id"])
        if n.get("kind") == "item" and (not img or not n.get("imageLabel") or not n.get("imageSourceId")):
            raise ValueError("项目必须配图、标注性质与来源: " + n["id"])
        if n.get("kind") == "item" and n.get("costDomain") != "overhead" and not n.get("description"):
            raise ValueError("部件和工艺必须有介绍: " + n["id"])
        seen = {n["id"]}
        p = n.get("parentId")
        while p:
            if p in seen:
                raise ValueError("节点树存在环")
            seen.add(p)
            p = by_id[p].get("parentId")
    domains = {n["costDomain"] for n in nodes if n["kind"] == "category"}
    if domains != {"component", "process", "overhead"}:
        raise ValueError("必须包含部件、工艺、利管销研发三类")
    overhead = [n for n in nodes if n["kind"] == "item" and n["costDomain"] == "overhead"]
    if {n["name"] for n in overhead} != {"利润", "管理", "销售", "研发"} or any(n.get("description") for n in overhead):
        raise ValueError("利管销研发必须固定为四项，且不写介绍")
    if any(k in n for n in nodes for k in ("price", "cost", "low", "high")):
        raise ValueError("第一阶段不能包含价格")
    return project

