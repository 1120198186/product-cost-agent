#!/usr/bin/env python3
"""Package reusable assets separately from the complete Agent definition."""
import hashlib
import json
import zipfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
VERSION=json.loads((ROOT/'agent/manifest.json').read_text(encoding='utf-8'))['version']

def files_in(folder):
    return [p for p in (ROOT/folder).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix not in ('.pyc','.pyo')]

def build():
    dist=ROOT/'dist';dist.mkdir(exist_ok=True)
    parts=[ROOT/'agent/AGENT.md',ROOT/'agent/workflow.json',*sorted((ROOT/'agent/rules').glob('*.md')),*sorted((ROOT/'agent/prompts').glob('*.md'))]
    flat='# 产品成本估算 Agent · 完整导入稿\n\n由源文件生成。供平台导入完整定义；执行单轮时仍按workflow只加载相关规则和必要交接，不能把本稿机械灌入每个子线程。数据接口与HTML资源使用配套固定资产包。\n\n'
    for p in parts:
        body=p.read_text(encoding='utf-8')
        if p.suffix=='.json':body='```json\n'+body+'\n```'
        flat+='\n\n---\n\n# 文件：'+str(p.relative_to(ROOT))+'\n\n'+body
    (ROOT/'agent/COMPLETE_AGENT.md').write_text(flat,encoding='utf-8')
    fixed=files_in('assets')+[ROOT/'tools'/n for n in ('render_review.py','validate_artifacts.py','study_validation.py','project_validation.py')]
    common=[ROOT/n for n in ('README.md','ARCHITECTURE.md','ROADMAP.md')]+files_in('docs')
    agent=files_in('agent')+files_in('knowledge')+common+[ROOT/'tools'/n for n in ('prepare_round.py','record_round.py')]
    complete=sorted(set(agent+fixed+files_in('examples')+files_in('tests')+[Path(__file__).resolve()]))
    outputs=[]
    for name,files in [('agent-definition',agent),('fixed-assets',fixed+common),('product-cost-agent-complete',complete)]:
        filename=f'{name}-v{VERSION}.zip'
        manifest={'package':name,'version':VERSION,'files':[]}
        with zipfile.ZipFile(dist/filename,'w',zipfile.ZIP_DEFLATED) as z:
            for p in sorted(set(files)):
                if p.is_symlink():raise ValueError('Cannot package symlinks')
                rel=p.relative_to(ROOT).as_posix();content=p.read_bytes()
                z.writestr(rel,content)
                manifest['files'].append({'path':rel,'bytes':len(content),'sha256':hashlib.sha256(content).hexdigest()})
            z.writestr('PACKAGE-'+name+'.json',json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
        with zipfile.ZipFile(dist/filename) as z:
            if z.testzip():raise ValueError('ZIP integrity error')
            for row in manifest['files']:
                if hashlib.sha256(z.read(row['path'])).hexdigest()!=row['sha256']:raise ValueError('Hash mismatch')
        outputs.append({'name':filename,'bytes':(dist/filename).stat().st_size,'sha256':hashlib.sha256((dist/filename).read_bytes()).hexdigest(),'files':len(manifest['files'])})
    (dist/'agent-complete-instructions.md').write_text(flat,encoding='utf-8')
    (dist/'SHA256SUMS').write_text(''.join(v['sha256']+'  '+v['name']+'\n' for v in outputs),encoding='utf-8')
    (dist/'release-manifest.json').write_text(json.dumps(outputs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    return outputs

if __name__=='__main__':print(json.dumps(build(),ensure_ascii=False,indent=2))
