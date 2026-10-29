#!/usr/bin/env python3
"""Fill fixed relationship-graph assets with validated data; never estimate prices."""
import argparse
import base64
import copy
import hashlib
import html
import json
import mimetypes
import re
import shutil
from pathlib import Path
from study_validation import read, totals
from validate_artifacts import check

ROOT=Path(__file__).resolve().parents[1]

def hash_bytes(value):return hashlib.sha256(value).hexdigest()
def json_text(value):return json.dumps(value,ensure_ascii=False,indent=2,allow_nan=False)+'\n'
def safe_path(path):
    if not isinstance(path,str) or not path or Path(path).is_absolute() or '..' in Path(path).parts or '\\' in path or ':' in path:
        raise ValueError('需要包内相对路径：'+str(path))
    return Path(path)

def bundle(project,study):
    items=copy.deepcopy(study['items']);ranges={}
    for item in items:
        item['basisKey']=hash_bytes(json_text({'study':study['id'],'item':item}).encode())
        ranges[item['nodeId']]={'low':None,'high':None,'note':'','currency':item['estimate']['currency'],'basisKey':item['basisKey']}
    metadata={k:study.get(k) for k in ['id','researchedOn','createdAt','promptIndex','runPath','summary','scopeSummary']}
    metadata.update(currentBasis=True,reportPath='cost-studies/'+project['id']+'.json')
    total=totals(items,project,study['productUnit'],scope_gaps=study.get('scopeGaps',[]))
    warnings=[]
    if total['missingNodeIds']:warnings.append('缺项不按零计价：'+ '、'.join(total['missingNodeIds']))
    if total['mixedCurrencies']:warnings.append('币种未统一，金额未混合求和。')
    return {'projectId':project['id'],'currentStudy':metadata,'componentAnalysis':metadata,'processAnalysis':metadata,
            'items':items,'productTotal':total,'componentTotal':totals(items,project,study['productUnit'],'component',study.get('scopeGaps',[])),
            'manufacturingTotal':totals(items,project,study['productUnit'],'process',study.get('scopeGaps',[])),
            'review':{'updatedAt':None,'ranges':ranges,'staleRanges':{},'sourceIdentity':{'studyId':study['id']}},'warnings':warnings}

def render(project_path,study_path,out,archive_root=None,media_root=None,approvals=None):
    check(project_path,study_path,read(approvals) if approvals else None)
    out=Path(out).resolve()
    if out.exists():raise ValueError('输出目录已存在，使用新目录以保留旧研究/人工数据。')
    project=read(project_path);study=read(study_path)
    for field in ('promptIndex','runPath'):safe_path(study[field])
    out.mkdir(parents=True)
    archive_links=[]
    for item in study['items']:
        for row in item['raw'].get('researchRounds',[]):
            for key in ('promptPath','resultPath'):
                relative=safe_path(row[key]);archive_links.append(relative)
                if archive_root is None:raise ValueError('有阶段引用时请提供--archive-root，不能生成断链报告。')
                source=(Path(archive_root)/relative).resolve()
                source.relative_to(Path(archive_root).resolve())
                if not source.is_file():raise ValueError('阶段引用不存在：'+str(relative))
                # Include the whole referenced round, not unrelated products or credentials.
                for f in source.parent.rglob('*'):
                    if not f.is_file() or f.suffix.lower() not in ('.json','.md','.txt','.csv','.pdf','.png','.jpg','.jpeg','.webp','.py'):continue
                    if f.is_symlink():raise ValueError('研究档案不能通过符号链接导出')
                    rel=f.relative_to(Path(archive_root).resolve());dest=out/rel
                    dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(f,dest)
    project_dest=out/'projects'/(project['id']+'.json');project_dest.parent.mkdir(parents=True)
    project_dest.write_bytes(Path(project_path).read_bytes())
    study_dest=out/'cost-studies'/(project['id']+'.json');study_dest.parent.mkdir(parents=True)
    study_dest.write_bytes(Path(study_path).read_bytes())
    # Plain-text HTML readers preserve the original artifacts and need no Markdown plugin.
    pages={p.relative_to(out).as_posix():p.relative_to(out).as_posix()+'.html' for p in out.rglob('*') if p.is_file() and p.suffix in ('.json','.md','.txt','.csv','.py')}
    for original,mirror in pages.items():
        raw=(out/original).read_text(encoding='utf-8',errors='replace')
        (out/mirror).write_text('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>'+html.escape(original)+'</title><style>body{max-width:1100px;margin:28px auto;padding:20px;font:14px/1.8 system-ui}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>'+html.escape(original)+'</h1><pre>'+html.escape(raw)+'</pre>',encoding='utf-8')
    rows=[]
    for item in study['items']:
        links=[]
        for r in item['raw'].get('researchRounds',[]):
            import posixpath
            links.append(html.escape(r.get('label',r['phase']))+'：'+ ' · '.join('<a href="'+html.escape(posixpath.relpath(pages.get(r[k],r[k]),str(Path(study['promptIndex']).parent)))+'">'+label+'</a>' for k,label in [('promptPath','提示词'),('resultPath','结果')]))
        rows.append('<h2>'+html.escape(item['nodeId'])+'</h2>'+'<br>'.join(links))
    index=out/study['promptIndex'];index.parent.mkdir(parents=True,exist_ok=True)
    index.write_text('<!doctype html><meta charset="utf-8"><title>研究档案</title><style>body{font:15px/1.8 system-ui;margin:32px}</style><h1>各阶段提示词与结果</h1>'+(''.join(rows) if archive_links else '<p>本报告没有附加阶段档案；示例数据不是实际研究执行。</p>'),encoding='utf-8')
    display=copy.deepcopy(project);display['status']='ready'
    image_warnings=[]
    for node in display['nodes']:
        image=node.get('imageUrl','')
        if image.startswith('/assets/'):
            source=None
            if media_root:
                source=(Path(media_root)/safe_path(image.lstrip('/'))).resolve()
                source.relative_to(Path(media_root).resolve())
            if source and source.is_file():
                mime=mimetypes.guess_type(source.name)[0] or 'application/octet-stream'
                if not mime.startswith('image/'):raise ValueError('图片类型不支持')
                node['imageUrl']='data:'+mime+';base64,'+base64.b64encode(source.read_bytes()).decode()
            else:
                node['imageUrl']='';node['imageLabel']='局部图未归档；参见原始资料'
                image_warnings.append(node['id'])
        # HTTP images remain original links; no implicit network fetch or invented substitutes.
    data={'packageId':study['id']+'-'+hash_bytes(Path(study_path).read_bytes())[:12],
          'studyId':study['id'],'sourceSha256':study['sourceSha256'],'project':display,'bundle':bundle(project,study),
          'assets':{'items':[]},'documentPages':pages}
    if image_warnings:data['bundle']['warnings'].append('下列项配图未归档：'+ '、'.join(image_warnings))
    template=(ROOT/'assets/web/index.html').read_text(encoding='utf-8')
    template=re.sub(r'\s*<(?:link|script)[^>]+(?:href|src)="/static/[^\"]+"[^>]*>(?:</script>)?','',template)
    css='\n'.join((ROOT/'assets/web'/f).read_text(encoding='utf-8') for f in ('style.css','cost-detail.css','offline-review.css'))
    js='\n'.join((ROOT/'assets/web'/f).read_text(encoding='utf-8') for f in ('offline-review.js','cost-detail.js','app.js')).replace('</script','<\\/script')
    data_json=json.dumps(data,ensure_ascii=False,separators=(',',':'),allow_nan=False).replace('<','\\u003c').replace('\u2028','\\u2028').replace('\u2029','\\u2029')
    template=template.replace('</head>','<style>'+css+'</style><script id="offline-data" type="application/json">'+data_json+'</script><script>'+js+'</script></head>')
    name=html.escape(project['productName'])
    toolbar='<section class="offline-toolbar"><h2>'+name+' · 成本审核</h2><p>研究与人工确认分别保存。包内资料可离线查看；外部网站及未归档网络图片需联网。</p><div class="offline-actions"><label>审核人<input id="offline-reviewer" maxlength="100" placeholder="姓名或团队（可选）"></label><button id="offline-export" class="primary">导出审核结果</button><button id="offline-import" class="subtle">导入审核结果</button><button id="offline-csv" class="subtle">导出审核表 CSV</button><a href="./'+html.escape(study['promptIndex'])+'" target="_blank">研究与提示词档案 ↗</a><input id="offline-file" class="offline-hidden" type="file" accept=".json,application/json"></div><p id="offline-status" role="status"></p></section>'
    template=template.replace('</header>','</header>'+toolbar,1)
    guide='<div class="offline-guide"><h1>查看、审核、导出</h1><p>在项目关系图中点击部件或工艺，查看估价依据。填写人工区间后先点击“保存本项”，再从顶部导出JSON发回。相同研究版本可导入继续审核；CSV供表格阅读。</p><p>浏览器保存不改写HTML或ZIP，不自动同步；换电脑或清理数据前请导出。拆分与研究只读，未估金额不按零计价。</p></div>'
    template=re.sub(r'<div class="hero">.*?</div>\s*<form id="start-form"',guide+'<form id="start-form"',template,count=1,flags=re.S)
    template=re.sub(r'<title>.*?</title>','<title>'+name+' · 成本审核</title>',template,count=1)
    (out/'打开.html').write_text(template,encoding='utf-8')
    (out/'index.html').write_text('<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=打开.html"><a href="打开.html">打开成本关系图</a>',encoding='utf-8')
    (out/'使用说明.txt').write_text('完整解压后双击打开.html。填写区间后保存本项，再导出审核JSON发回。换浏览器/电脑前请导出；浏览器保存不会修改HTML/ZIP。原价、研究区间与人工采用值分别保留。包内证据可离线读，外部网页/未归档图片需要联网。本包不运行模型。\n',encoding='utf-8')
    manifest={'projectId':project['id'],'studyId':study['id'],'entry':'打开.html','imageWarnings':image_warnings,
              'files':[{'path':str(p.relative_to(out)),'sha256':hash_bytes(p.read_bytes())} for p in sorted(out.rglob('*')) if p.is_file()]}
    (out/'package-manifest.json').write_text(json_text(manifest),encoding='utf-8')
    return {'output':str(out),'items':len(study['items']),'archiveLinks':len(archive_links),'imageWarnings':image_warnings}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    for name in ('project','study','output'):p.add_argument('--'+name,required=True,type=Path)
    for name in ('archive-root','media-root','approvals'):p.add_argument('--'+name,type=Path)
    a=p.parse_args();print(json.dumps(render(a.project,a.study,a.output,a.archive_root,a.media_root,a.approvals),ensure_ascii=False))
