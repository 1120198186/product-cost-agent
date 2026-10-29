/* Optional, exported review package only. No network service or model account. */
window.CostOffline = (() => {
  'use strict';
  const snapshot = JSON.parse(document.getElementById('offline-data').textContent);
  const copy = value => JSON.parse(JSON.stringify(value));
  const key = 'cost-review/' + snapshot.packageId;
  const baseline = snapshot.bundle.review;
  const filename = String(snapshot.project.productName || '产品成本').replace(/[\\/:*?"<>|]/g,'_');
  let memory = {reviewer:'', review:copy(baseline)}, storageOK = true;
  const message = text => { const el=document.getElementById('offline-status'); if(el)el.textContent=text; };
  const freshTime = previous => new Date(Math.max(Date.now(),(Date.parse(previous)||0)+1)).toISOString();

  function validateRanges(rows) {
    if (!rows || typeof rows !== 'object' || Array.isArray(rows) || Object.keys(rows).sort().join('|') !== Object.keys(baseline.ranges).sort().join('|')) throw Error('审核文件的成本项与本包不一致。');
    const clean = {};
    for (const [id, expected] of Object.entries(baseline.ranges)) {
      const row=rows[id];
      if (!row || row.basisKey!==expected.basisKey || row.currency!==expected.currency) throw Error('估价版本或币种不一致：'+id);
      const {low,high}=row;
      if ((low===null)!==(high===null) || low!==null && (!Number.isFinite(low)||!Number.isFinite(high)||low<0||low>high)) throw Error('上下限须同时留空，或填写非负且有序的数值：'+id);
      if (typeof row.note!=='string'||row.note.length>2000) throw Error('审核备注无效或超过2000字：'+id);
      clean[id]={low,high,note:row.note,currency:row.currency,basisKey:row.basisKey};
    }
    return clean;
  }
  function read() {
    if(storageOK) {
      try {
        const raw=localStorage.getItem(key);
        if(raw) {
          const parsed=JSON.parse(raw);
          if(typeof parsed.reviewer!=='string'||parsed.reviewer.length>100) throw Error('审核人无效');
          parsed.review.ranges=validateRanges(parsed.review.ranges);
          memory=parsed;
        }
      } catch(e) { storageOK=false; message('浏览器保存不可用；当前会话可继续审核，请及时导出审核文件。'); }
    }
    return copy(memory);
  }
  function write(record) {
    memory=copy(record);
    if(storageOK)try{localStorage.setItem(key,JSON.stringify(record));}catch(e){storageOK=false;}
    message(storageOK?'已保存在此浏览器。发回时请导出审核文件；原HTML不会被改写。':'本次会话已保存；浏览器未持久保存，请导出审核文件后再关闭。');
  }
  function bundle() {const b=copy(snapshot.bundle);b.review=read().review;return b;}
  function validateImport(value) {
    if(!value || value.format!=='cost-offline-review' || value.version!==1 || value.packageId!==snapshot.packageId || value.studyId!==snapshot.studyId || value.projectId!==snapshot.project.id || value.sourceSha256!==snapshot.sourceSha256) throw Error('这不是本项目、本研究版本的审核文件。请使用对应版本的共享包。');
    if(typeof value.reviewer!=='string'||value.reviewer.length>100)throw Error('审核人无效。');
    return {reviewer:value.reviewer,ranges:validateRanges(value.review?.ranges)};
  }
  function importReview(value) {
    const clean=validateImport(value), record=read();
    record.reviewer=clean.reviewer;
    record.review={...copy(baseline),ranges:clean.ranges,updatedAt:freshTime(record.review.updatedAt)};
    write(record);
    return copy(record);
  }
  function envelope() {
    const record=read();
    return {format:'cost-offline-review',version:1,packageId:snapshot.packageId,studyId:snapshot.studyId,projectId:snapshot.project.id,productName:snapshot.project.productName,sourceSha256:snapshot.sourceSha256,exportedAt:new Date().toISOString(),reviewer:record.reviewer,review:{updatedAt:record.review.updatedAt,ranges:record.review.ranges}};
  }
  function url(value) {
    if(typeof value!=='string'||!value)return '';
    if(/^https?:\/\//i.test(value)||/^data:image\/(png|jpeg|webp|gif|svg\+xml);base64,/i.test(value))return value;
    if(value.startsWith('/#')||value.startsWith('#'))return './打开.html'+value.slice(value.indexOf('#'));
    if(value.startsWith('//')||/^[a-z][a-z\d+.-]*:/i.test(value))return '';
    let file=value.replace(/^\.\//,'').replace(/^\//,'');
    if(file.split('/').includes('..'))return '';
    return './'+encodeURI(snapshot.documentPages[file]||file);
  }
  function response(status,value){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});}
  window.fetch=async (input,options={}) => {
    const pathname=String(input), method=(options.method||'GET').toUpperCase();
    try {
      if(method==='GET'&&pathname==='/api/projects')return response(200,[snapshot.project]);
      if(method==='GET'&&pathname==='/api/projects/'+snapshot.project.id)return response(200,snapshot.project);
      if(method==='GET'&&pathname==='/api/assets')return response(200,snapshot.assets);
      if(method==='GET'&&pathname==='/api/project-costs/'+snapshot.project.id)return response(200,bundle());
      if(method==='PUT'&&pathname==='/api/project-costs/'+snapshot.project.id+'/ranges'){
        const payload=JSON.parse(options.body),record=read();
        if(payload.updatedAt!==record.review.updatedAt)return response(409,{error:'另一窗口已更新审核结果，请刷新页面后重试。'});
        const ranges=validateRanges(payload.ranges);
        record.review={...record.review,ranges,updatedAt:freshTime(record.review.updatedAt)};
        write(record);return response(200,bundle());
      }
      return response(400,{error:'离线包提供查看和成本审核；新增产品或修改拆分结构请在原Agent项目中处理。'});
    }catch(e){return response(400,{error:e.message});}
  };
  function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
  function csv() {
    const record=read(), rows=[['审核人','编号','项目','类别','研究下限','研究上限','币种','单价单位','人工下限','人工上限','采用依据','参与主合计']];
    for(const item of snapshot.bundle.items){const node=snapshot.project.nodes.find(n=>n.id===item.nodeId),r=record.review.ranges[item.nodeId];rows.push([record.reviewer,item.nodeId,node?.name,item.domain==='component'?'部件':'工艺',item.estimate.low,item.estimate.high,item.estimate.currency,item.estimate.unit,r.low,r.high,r.note,node?.active&&node.costBoundary==='independent'?'是':'否']);}
    return '\ufeff'+rows.map(row=>row.map(csvCell).join(',')).join('\r\n');
  }
  function download(contents,type,filename){const a=document.createElement('a'),u=URL.createObjectURL(new Blob([contents],{type}));a.href=u;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);}
  function requireSaved(){if(window.CostDetail?.hasUnsavedChanges())throw Error('还有未保存的单项修改。请在成本弹窗中点击“保存本项”，再导出或导入。');}
  function setup(){
    const reviewer=document.getElementById('offline-reviewer');reviewer.value=read().reviewer;
    reviewer.addEventListener('change',()=>{const r=read();r.reviewer=reviewer.value.trim().slice(0,100);write(r);});
    document.getElementById('offline-export').onclick=()=>{try{requireSaved();reviewer.dispatchEvent(new Event('change'));download(JSON.stringify(envelope(),null,2),'application/json',filename+'-审核结果-'+new Date().toISOString().slice(0,10)+'.json');}catch(e){message(e.message);}};
    document.getElementById('offline-csv').onclick=()=>{try{requireSaved();reviewer.dispatchEvent(new Event('change'));download(csv(),'text/csv;charset=utf-8',filename+'-审核表.csv');}catch(e){message(e.message);}};
    document.getElementById('offline-import').onclick=()=>{try{requireSaved();document.getElementById('offline-file').click();}catch(e){message(e.message);}};
    document.getElementById('offline-file').onchange=async event=>{try{const file=event.target.files[0];if(!file)return;if(file.size>2_000_000)throw Error('审核文件超过大小限制。');const value=JSON.parse(await file.text());validateImport(value);const existing=Object.values(read().review.ranges).some(r=>r.low!==null||r.note);if(existing&&!confirm('导入会替换此浏览器当前审核结果。已有结果请先导出保存。是否导入？'))return;importReview(value);location.reload();}catch(e){message('导入失败：'+e.message);}finally{event.target.value='';}};
    document.getElementById('nav-home').textContent='使用说明';
    const enforce=()=>{
      document.querySelectorAll('#detail input,#detail textarea,#detail select').forEach(el=>{el.disabled=true;});
      document.querySelectorAll('a[href^="/"]').forEach(a=>{a.href=url(a.getAttribute('href'));});
    };
    new MutationObserver(enforce).observe(document.body,{subtree:true,childList:true});enforce();
    window.addEventListener('beforeunload',event=>{if(window.CostDetail?.hasUnsavedChanges()){event.preventDefault();event.returnValue='';}});
    if(storageOK)message('先保存本项，再导出审核文件发回。浏览器保存只在当前电脑生效，不会自动同步给其他人。');
  }
  read();
  if(!location.hash)location.hash='#project/'+snapshot.project.id;
  document.addEventListener('DOMContentLoaded',setup,{once:true});
  return {url,envelope,validateImport,importReview,csv,validateRanges,storageAvailable:()=>storageOK};
})();
