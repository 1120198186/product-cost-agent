#!/usr/bin/env python3
"""Mechanical checks only. Semantic truth/comparability remain research obligations."""
import argparse
import hashlib
import json
from pathlib import Path
from project_validation import validate_project
from study_validation import validate, read, text

def check(project_path, study_path=None, approvals=None):
    project=read(project_path);validate_project(project)
    if study_path is None:return {'valid':True,'stage':'decomposition','nodes':len(project['nodes'])}
    study=read(study_path)
    if hashlib.sha256(Path(project_path).read_bytes()).hexdigest()!=study['sourceSha256']:
        raise ValueError('冻结拆分文件哈希不一致')
    validate(study,project)
    expected={n['id'] for n in project['nodes'] if n['kind']=='item' and n['costDomain'] in ('component','process')}
    # The declared stage/scope can be narrower than the whole product, without hiding missing totals.
    seen={i['nodeId'] for i in study['items']}
    if not seen<=expected:raise ValueError('估价包含不存在的成本项')
    approvals=approvals or {}
    for item in study['items']:
        raw=item['raw'];gate=raw.get('comparisonGate',{});identity=raw.get('identity',{})
        if not identity or not gate or not raw.get('spreadAnalysis',{}).get('summary'):
            raise ValueError('最终单项缺少取价对象、可比状态或价差分析：'+item['nodeId'])
        approved=gate.get('humanApproval')
        if approved is not None and approved!=approvals.get(item['nodeId']):
            raise ValueError('人工批准不匹配宿主独立审核记录：'+item['nodeId'])
        if identity.get('pricingRelation')=='weak' and item['estimate']['low'] is not None and approved is None:
            raise ValueError('弱对标不能借pass标签跳过人工批准')
        if item['domain']=='component':
            c=raw.get('classification',{})
            if c.get('marketType') not in ('commodity','proprietary','custom','unknown') or 'selfDeveloped' not in c or c['selfDeveloped'] is not None and type(c['selfDeveloped']) is not bool or not text(c.get('basis')):
                raise ValueError('部件分类/自研标签不完整：'+item['nodeId'])
        for price in raw.get('prices',[]):
            if not text(price.get('sourceKey')) or not text(price.get('seller')) or price.get('regionGroup') not in ('china','non_china'):
                raise ValueError('真实价格须标注供货企业、去重键和地域')
            if price.get('usage') not in ('estimate','reference_only','parameter'):
                raise ValueError('价格采用用途不明确')
        for line in item['estimate'].get('breakdown',[]):
            if line.get('currency',item['estimate']['currency'])!=item['estimate']['currency']:
                raise ValueError('分项币种不能混算')
    return {'valid':True,'items':len(seen),'unresearchedNodeIds':sorted(expected-seen),
            'semanticBoundary':'Does not prove sources were read or estimates are correct; use actual research and cost review.'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--project',required=True,type=Path)
    p.add_argument('--study',type=Path);p.add_argument('--approvals',type=Path)
    a=p.parse_args();print(json.dumps(check(a.project,a.study,read(a.approvals) if a.approvals else None),ensure_ascii=False))
