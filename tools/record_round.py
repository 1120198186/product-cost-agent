#!/usr/bin/env python3
"""Archive host-reported execution and results without claiming to run a model."""
import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

def record(folder, result_path, report_path, execution):
    folder=Path(folder)
    data=json.loads((folder/'round.json').read_text(encoding='utf-8'))
    if data['status']!='prepared' or (folder/'result.json').exists() or (folder/'result.md').exists():
        raise ValueError('已记录的回合不可覆盖；修复/重试请建新回合并关联原记录。')
    if not execution.get('executionId') or execution.get('mode') not in ('live','replay','test'):
        raise ValueError('宿主须提供真实executionId及live/replay/test模式')
    if execution.get('configurationInheritance') is not True:
        raise ValueError('宿主须确认继承主模型和推理档位')
    if not isinstance(execution.get('modelProfile'),dict):
        raise ValueError('提供modelProfile；实际值未暴露用null并说明，不编造')
    if not execution.get('configurationNote'):
        raise ValueError('提供配置来源/实际值是否可见的说明')
    for name,key in [('prompt.md','promptSha256'),('input.json','inputSha256')]:
        if hashlib.sha256((folder/name).read_bytes()).hexdigest()!=data[key]:
            raise ValueError('派发前后输入已发生变化：'+name)
    raw=Path(result_path).read_bytes(); explanation=Path(report_path).read_bytes()
    json.loads(raw,parse_constant=lambda v: (_ for _ in ()).throw(ValueError('非有限JSON值')))
    if not explanation.strip():raise ValueError('缺少本轮研究说明')
    (folder/'result.json').write_bytes(raw);(folder/'result.md').write_bytes(explanation)
    data.update(status='recorded',recordedAt=datetime.now(timezone.utc).isoformat(),execution=execution,
                resultSha256=hashlib.sha256(raw).hexdigest(),reportSha256=hashlib.sha256(explanation).hexdigest())
    (folder/'round.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return data

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--round',required=True,type=Path);p.add_argument('--result',required=True,type=Path)
    p.add_argument('--report',required=True,type=Path);p.add_argument('--execution',required=True,type=Path)
    a=p.parse_args()
    print(json.dumps(record(a.round,a.result,a.report,json.loads(a.execution.read_text(encoding='utf-8'))),ensure_ascii=False))
