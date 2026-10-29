"""Current-basis studies, separate from historical component v4/process v1 archives."""
import argparse
import copy
import hashlib
import json
import math
import os
import re
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlparse

SCOPE_FIELDS = ("id", "parentId", "name", "kind", "costDomain", "quantity", "active",
                "costBoundary", "includedIn", "description", "identification")
KINDS = {"conditional_model", "purchase_reference", "supplier_quote", "unavailable"}
STRATEGIES = {"mature_manufacturing", "published_terminal_tier", "evidenced_batch", "engineering_scenario"}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def finite(value):
    return type(value) in (int, float) and math.isfinite(value)


def scope(node):
    return {key: node.get(key) for key in SCOPE_FIELDS}


def read(path):
    def reject(value):
        raise ValueError("JSON 不允许非有限数值：" + value)
    return json.loads(Path(path).read_text(encoding="utf-8"), parse_constant=reject)


def text(value):
    return isinstance(value, str) and bool(value.strip())


def texts(value):
    return isinstance(value, list) and all(isinstance(v, str) for v in value)


def http(value):
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme in ("http", "https") and bool(parsed.netloc)


def local_path(value):
    return text(value) and not Path(value).is_absolute() and ".." not in Path(value).parts and not urlparse(value).scheme


def range_value(value, label, nullable=True):
    require(isinstance(value, dict), label + "须为对象")
    require("low" in value and "high" in value, label + "缺少上下限")
    low, high = value["low"], value["high"]
    require((low is None) == (high is None), label + "上下限须同时留空")
    require((nullable and low is None) or (finite(low) and finite(high) and 0 <= low <= high), label + "须为非负、有序、有限区间")


def refs(value, sources, label, required=False):
    require(isinstance(value, list) and (bool(value) or not required) and all(isinstance(v, str) and v in sources for v in value), label + "缺少有效来源 ID")


def validate(study, project=None, require_current=True):
    """Validate saved/publication shape without executing formula strings or research content."""
    require(isinstance(study, dict) and study.get("schemaVersion") == 1, "当前口径研究版本必须为 1")
    # Reject NaN/Infinity anywhere, including unused evidence fields.
    try:
        json.dumps(study, allow_nan=False)
    except (ValueError, TypeError) as exc:
        raise ValueError("研究须为有限数值的纯 JSON") from exc
    for key in ("id", "sourceProjectId"):
        require(isinstance(study.get(key), str) and re.fullmatch(r"[a-z0-9-]+", study[key]), key + "无效")
    require(isinstance(study.get("sourceSha256"), str) and re.fullmatch(r"[0-9a-f]{64}", study["sourceSha256"]), "缺少来源文件哈希")
    date.fromisoformat(study.get("researchedOn", ""))
    require(text(study.get("createdAt")), "缺少研究创建时间")
    datetime.fromisoformat(study["createdAt"].replace("Z", "+00:00"))
    for key in ("promptIndex", "runPath"):
        require(local_path(study.get(key)), key + "须为项目内相对路径")
    require(text(study.get("productUnit", "套")), "缺少成品计量单位")
    require(text(study.get("summary")), "缺少研究摘要")
    require(study.get("scopeSummary") is None or text(study["scopeSummary"]), "范围说明须为文本")
    items = study.get("items")
    require(isinstance(items, list), "研究缺少 items 数组")
    ids = [item.get("nodeId") for item in items if isinstance(item, dict)]
    require(len(ids) == len(items) == len(set(ids)) and all(text(i) for i in ids), "研究节点 ID 缺失或重复")
    nodes = {node["id"]: node for node in project["nodes"]} if project else {}
    gaps = study.get('scopeGaps', [])
    require(isinstance(gaps, list) and all(isinstance(g, dict) and text(g.get('nodeId')) and text(g.get('reason')) for g in gaps), '范围缺口须明确节点与原因')
    require(len({g['nodeId'] for g in gaps}) == len(gaps), '范围缺口节点重复')
    if project:
        require(all(g['nodeId'] in nodes and nodes[g['nodeId']].get('kind') == 'item' for g in gaps), '范围缺口引用了不存在的成本节点')
    if project:
        require(study["sourceProjectId"] == project["id"], "研究来源项目不匹配")
    for item in items:
        node_id = item["nodeId"]
        require(item.get("domain") in ("component", "process"), "研究只能关联物料或工艺")
        snapshot = item.get("nodeSnapshot")
        require(isinstance(snapshot, dict) and snapshot.get("id") == node_id and snapshot.get("kind") == "item" and snapshot.get("costDomain") == item["domain"], "节点快照无效：" + node_id)
        if project and require_current:
            require(node_id in nodes and scope(snapshot) == scope(nodes[node_id]), "节点口径与当前项目不符：" + node_id)
        for key in ("critical", "methodSteps"):
            require(texts(item.get(key)), key + "须为文本数组")
        require(text(item.get("summary")), "缺少单项摘要")
        if "coverage" in item:
            coverage = item["coverage"]
            require(isinstance(coverage, dict) and coverage.get("status") in ("complete", "partial"), "覆盖状态须为 complete 或 partial")
            require(text(coverage.get("scopeText")), "覆盖范围须说明实际已估范围")
            missing = coverage.get("missing")
            require(texts(missing) and all(text(gap) for gap in missing), "覆盖缺口须为非空文本组成的数组")
            require(bool(missing) == (coverage["status"] == "partial"), "部分覆盖须列明具体缺口；完整覆盖不能有缺口")
        raw = item.get("raw")
        require(isinstance(raw, dict) and isinstance(raw.get("sources"), list), "缺少原始依据")
        sources = {}
        for source in raw["sources"]:
            require(isinstance(source, dict) and text(source.get("id")) and source["id"] not in sources, "来源 ID 缺失或重复")
            require(http(source.get("url")) and text(source.get("title")) and source.get("kind") in ("quote", "model_parameter", "technical"), "来源须有标题、HTTP(S) 链接和证据类型")
            sources[source["id"]] = source
        estimate = item.get("estimate")
        range_value(estimate, "单项估计")
        require(estimate.get("kind") in KINDS and estimate.get("quantityStrategy") in STRATEGIES, "缺少估价性质或数量策略")
        require(re.fullmatch(r"[A-Z]{3}", estimate.get("currency", "")) is not None, "估价币种无效")
        for key in ("unit", "basis", "label", "note", "formula"):
            require(text(estimate.get(key)), "估价缺少 " + key)
        refs(estimate.get("evidenceRefs"), sources, "估价", estimate["low"] is not None)
        gate = raw.get("comparisonGate")
        if gate is not None:
            require(isinstance(gate, dict) and gate.get("status") in ("pass", "needs_review", "not_applicable")
                    and text(gate.get("reason")), "可比性审核须明确状态与理由")
            approval = gate.get("humanApproval")
            if approval is not None:
                require(isinstance(approval, dict) and approval.get("approved") is True
                        and all(text(approval.get(key)) for key in ("approvedBy", "approvedAt", "reason")),
                        "人工批准须明确批准人、时间与理由")
                datetime.fromisoformat(approval["approvedAt"].replace("Z", "+00:00"))
            require(gate["status"] != "needs_review" or estimate["low"] is None or approval is not None,
                    "可比性待审核项未经明确人工批准不得填写目标估价")
        identity = raw.get("identity")
        if identity is not None:
            require(isinstance(identity, dict) and text(identity.get("pricingObject"))
                    and identity.get("pricingRelation") in ("actual_supplier", "exact_model", "equivalent", "weak", "model")
                    and text(identity.get("explanation")), "本次取价须明确对象、关系与采用理由")
        if "researchRounds" in raw:
            require(isinstance(raw["researchRounds"], list) and all(isinstance(row, dict)
                    and text(row.get("phase")) and text(row.get("label"))
                    and local_path(row.get("promptPath")) and local_path(row.get("resultPath"))
                    for row in raw["researchRounds"]), "分阶段档案须保留阶段名称与项目内提示词、结果路径")
        if estimate["kind"] == "unavailable":
            require(estimate["low"] is None, "未知估价不能填写数值")
        else:
            require(estimate["low"] is not None, "无数值估价应标记 unavailable")
        if estimate["quantityStrategy"] == "evidenced_batch":
            require(finite(estimate.get("batchQty")) and estimate["batchQty"] > 0, "实际批次模式缺少有据批量")
            refs(estimate.get("batchEvidenceRefs"), sources, "批量", True)
        elif "batchQty" in estimate:
            raise ValueError("非实际批次模式不能填写目标批量")
        breakdown = estimate.get("breakdown")
        require(isinstance(breakdown, list), "缺少费用分解数组")
        for row in breakdown:
            range_value(row, "费用分解", False)
            require(text(row.get("label")), "费用分解缺少名称")
            refs(row.get("sourceIds"), sources, "费用分解", True)
        if breakdown and estimate["low"] is not None:
            require(all(math.isclose(sum(row[side] for row in breakdown), estimate[side], rel_tol=1e-8, abs_tol=1e-8) for side in ("low", "high")), "费用分解之和须等于单项估价")
        for side in raw.get("scenarios", {}).values():
            require(isinstance(side, dict), "工艺情景须为对象")
            for row in side.get("variable", []) + side.get("perOrder", []) + side.get("perBatch", []):
                refs(row.get("sourceIds"), sources, "工艺模型数值", True)
                if "factors" in row:
                    require(isinstance(row["factors"], list) and row["factors"] and all(finite(v) and v >= 0 for v in row["factors"]) and finite(row.get("divisor")) and row["divisor"] > 0, "工艺因子须为有效数值")
                else:
                    require(finite(row.get("cost")) and row["cost"] >= 0 and finite(row.get("capacity")) and row["capacity"] > 0, "工艺批处理数值无效")
        for row in raw.get("parameters", []):
            range_value(row, "模型参数", False)
            require(row.get("type") in ("fact", "estimate") and text(row.get("basis")) and text(row.get("unit")), "模型参数必须区分事实与假设并说明单位与依据")
            refs(row.get("sourceIds"), sources, "模型参数", True)
        for row in raw.get("prices", []):
            require(text(row.get("id")) and http(row.get("url")) and row.get("quoteKind") in ("actual_quote", "reference_quote", "model_parameter"), "数值价格缺少 ID、来源链接或性质")
            refs(row.get("sourceIds"), sources, "数值价格", True)
            require(isinstance(row.get("tiers"), list) and row["tiers"], "数值价格缺少阶梯")
            for tier in row["tiers"]:
                scalar = finite(tier.get("unitPrice")) and tier["unitPrice"] >= 0
                interval = (finite(tier.get("unitPriceLow")) and finite(tier.get("unitPriceHigh"))
                            and 0 <= tier["unitPriceLow"] <= tier["unitPriceHigh"])
                require((scalar and "unitPriceLow" not in tier and "unitPriceHigh" not in tier
                         or interval and "unitPrice" not in tier)
                        and text(tier.get("unit")) and re.fullmatch(r"[A-Z]{3}", tier.get("currency", "")), "价格金额或单位无效")
                for key in ("minQty", "maxQty"):
                    require(tier.get(key) is None or finite(tier[key]) and tier[key] > 0, "价格数量无效")
                require(tier.get("minQty") is None or tier.get("maxQty") is None or tier["minQty"] <= tier["maxQty"], "价格数量上下限倒置")
        prices = {row["id"]: row for row in raw.get("prices", [])}
        require(len(prices) == len(raw.get("prices", [])), "价格 ID 重复")
        for point in estimate.get("pricePoints", []):
            require(point.get("priceId") in prices and type(point.get("tierIndex")) is int and 0 <= point["tierIndex"] < len(prices[point["priceId"]]["tiers"]), "价格端点引用无效")
            require(finite(point.get("conversionRate")) and point["conversionRate"] > 0 and finite(point.get("convertedPrice")) and point["convertedPrice"] >= 0, "价格端点金额无效")
            tier = prices[point["priceId"]]["tiers"][point["tierIndex"]]
            require(finite(tier.get("unitPrice")), "区间报价不能作为已明确的固定阶梯端点")
            require(math.isclose(tier["unitPrice"] * point["conversionRate"], point["convertedPrice"], rel_tol=1e-8, abs_tol=1e-8), "价格端点换算错误")
            if tier["currency"] != estimate["currency"]:
                require(point.get("rateSourceUrls") and all(http(u) for u in point["rateSourceUrls"]), "换汇缺少依据链接")
            require(all(http(u) for u in point.get("sourceUrls", [])), "价格端点来源链接无效")
        if estimate["kind"] == "supplier_quote":
            require(any(row.get("quoteKind") == "actual_quote" for row in raw.get("prices", [])) and any(sources[r]["kind"] == "quote" for r in estimate["evidenceRefs"]), "供应商实报价须有实际报价记录，模型不得标作实价")
        usage = item.get("usagePerProduct")
        product_value = item.get("perProductEstimate")
        require("usagePerProduct" in item and "perProductEstimate" in item, "须明确提供每成品用量/金额，未知时填 null")
        if usage is not None:
            range_value(usage, "每成品用量", False)
            require(usage.get("unit") == estimate["unit"] and text(usage.get("basis")), "用量单位须对应本项估价单位，且说明依据")
        if product_value is not None:
            range_value(product_value, "每成品金额")
            require(usage is not None and product_value.get("currency") == estimate["currency"] and product_value.get("unit") == study.get("productUnit", "套"), "每成品金额须有同币种、同口径用量")
            require((product_value["low"] is None) == (estimate["low"] is None), "未知估价不能被转成零金额")
            if estimate["low"] is not None:
                require(all(math.isclose(product_value[side], estimate[side] * usage[side], rel_tol=1e-8, abs_tol=1e-8) for side in ("low", "high")), "每成品金额必须等于单项估价 × 用量")
    return study


def totals(items, project, product_unit="套", domain=None, scope_gaps=None):
    expected = {node["id"] for node in project["nodes"] if node.get("kind") == "item" and node.get("active") and node.get("costBoundary") == "independent" and node.get("costDomain") in ((domain,) if domain else ("component", "process"))}
    domains = (domain,) if domain else ('component', 'process')
    nodes = {n['id']:n for n in project['nodes']}
    forced_missing = {g['nodeId'] for g in (scope_gaps or []) if g['nodeId'] in nodes and nodes[g['nodeId']].get('costDomain') in domains}
    expected |= forced_missing
    values = {item["nodeId"]: item.get("perProductEstimate") for item in items if item["nodeId"] in expected}
    partial = {item["nodeId"] for item in items if item["nodeId"] in expected and item.get("coverage", {}).get("status") == "partial"}
    valid = {key: value for key, value in values.items() if isinstance(value, dict) and finite(value.get("low")) and finite(value.get("high")) and value.get("unit") == product_unit}
    currencies = {value["currency"] for value in valid.values()}
    same_currency = len(currencies) <= 1
    missing = sorted((expected - valid.keys()) | partial | forced_missing)
    complete = bool(expected) and not missing and same_currency
    subtotal = {side: sum(row[side] for row in valid.values()) if valid and same_currency else None for side in ("low", "high")}
    label = {"component": "成品物料合计", "process": "成品工艺合计", None: "成品物料与工艺合计"}[domain]
    return {"low": subtotal["low"] if complete else None, "high": subtotal["high"] if complete else None,
            "currency": next(iter(currencies)) if len(currencies) == 1 else "CNY", "unit": product_unit,
            "status": "complete" if complete else "partial" if valid else "unavailable", "complete": complete,
            "subtotal": subtotal, "includedNodeIds": sorted(valid), "missingNodeIds": missing, "partialNodeIds": sorted(partial),
            "expectedNodeIds": sorted(expected), "scopeGapNodeIds": sorted(forced_missing), "mixedCurrencies": not same_currency, "label": label,
            "note": "仅汇总当前启用且独立计价项的明确每成品金额；部分覆盖金额只进入已估小计，范围缺口与未估价项均不按零处理。不含利润、管理、销售、研发；人工确认值另存，不混入研究合计。"}

