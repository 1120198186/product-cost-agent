const $ = id => document.getElementById(id);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {component:'物料', process:'成品工艺', overhead:'利管销研发', confirmed:'资料明确', inferred:'推断', unverified:'待核', aggregate:'不计价分组', independent:'独立一级成本', included:'已包含', pending:'待定'};
const tierLabels = {specification:'原件规格', exact_model_supplier:'实装型号与供应商', exact_model:'实装型号', similar_part:'同类单品', benchmark_product:'对标产品', performance_benchmark:'性能对标'};
const blankIdentification = () => ({confirmedModel:'',confirmedMaker:'',confirmedSupplier:'',referenceTier:'performance_benchmark',referenceModel:'',referenceMaker:'',match:'',path:[],sourceIds:[]});
let project = null, selected = null, dirty = false, scale = .7, panX = 0, panY = 0, worldWidth = 1000;
let costBundle = null;
let graphGroup = '', graphQuery = '';
const coords = new Map();

async function api(path, options = {}) {
  const r = await fetch(path, {...options, headers: {'Content-Type':'application/json', ...(options.headers || {})}});
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || `请求失败 ${r.status}`);
  return data;
}
function toast(message) { const t=$('toast'); t.textContent=message; t.style.display='block'; clearTimeout(toast.timer); toast.timer=setTimeout(()=>t.style.display='none',3000); }
function route(section, id='') { location.hash = section === 'project' ? `#project/${id}` : `#${section}`; }
function markDirty() { dirty=true; $('save-state').textContent='有未保存的修改'; }

async function showRoute() {
  const [section, id] = (location.hash || '#home').slice(1).split('/');
  for (const name of ['home','projects-page','assets-page','project-page']) $(name).classList.add('hidden');
  for (const name of ['nav-home','nav-projects','nav-assets']) $(name).classList.remove('active');
  if (section === 'project' && id) {
    $('project-page').classList.remove('hidden'); $('nav-projects').classList.add('active');
    $('breadcrumb').textContent='工作台 / 项目 / 成本拆解'; await openProject(id);
  } else if (section === 'projects') {
    $('projects-page').classList.remove('hidden'); $('nav-projects').classList.add('active');
    $('breadcrumb').textContent='工作台 / 项目'; await listProjects();
  } else if (section === 'assets') {
    $('assets-page').classList.remove('hidden'); $('nav-assets').classList.add('active');
    $('breadcrumb').textContent='工作台 / 资产库'; await listAssets();
  } else {
    $('home').classList.remove('hidden'); $('nav-home').classList.add('active');
    $('breadcrumb').textContent='工作台 / 新建分析';
  }
}
async function listProjects() {
  const list=await api('/api/projects');
  $('project-list').innerHTML=list.length ? list.map(p=>`<button data-project="${esc(p.id)}"><strong>${esc(p.productName)} <small>${esc(p.model||'正在识别型号')}</small></strong><small>${esc(p.status)} · ${esc(p.updatedAt||'')}</small></button>`).join('') : '<p>还没有项目。</p>';
  $('project-list').querySelectorAll('[data-project]').forEach(b=>b.onclick=()=>route('project',b.dataset.project));
}
async function listAssets() {
  const data=await api('/api/assets');
  $('asset-list').innerHTML=data.items.map(a=>`<article class="asset-item"><small>${esc(a.kind)}</small><strong>${esc(a.title)}</strong><p>${esc(a.content)}</p>${a.url?`<a href="${esc(a.url)}" target="_blank" rel="noopener noreferrer">查看来源 ↗</a>`:''}</article>`).join('');
}
async function openProject(id) {
  window.CostDetail?.close();
  graphGroup='';graphQuery='';
  if($('graph-search'))$('graph-search').value='';
  try { project=await api(`/api/projects/${encodeURIComponent(id)}`); }
  catch(e){$('project-failed').textContent=e.message;$('project-failed').classList.remove('hidden');return;}
  $('project-loading').classList.toggle('hidden',project.status!=='researching');
  $('project-failed').classList.toggle('hidden',project.status!=='failed');
  $('project-content').classList.toggle('hidden',project.status!=='ready');
  if(project.status==='researching'){setTimeout(()=>{if(location.hash===`#project/${id}`)openProject(id)},2500);return;}
  if(project.status==='failed'){$('project-failed').textContent=`研究没有完成：${project.error}`;return;}
  dirty=false;costBundle=null;$('save-state').textContent='结构已保存';
  $('cost-load-error').classList.add('hidden');
  renderProject();
  await loadProjectCosts(id);
}
async function loadProjectCosts(id){
  try {
    const loaded=await window.CostDetail.load(project,{onEdit:nodeId=>openDetail(nodeId),onUpdate:()=>{costBundle=window.CostDetail.getData();renderCostWorkspace()}});
    if(project.id!==id)return;
    costBundle=loaded||window.CostDetail.getData();renderCostWorkspace();
  }catch(e){$('cost-load-error').textContent=`成本资料未能加载：${e.message}。刷新页面可重试；拆解结构仍可查看。`;$('cost-load-error').classList.remove('hidden')}
}
function costScope(n){return JSON.stringify(['id','costDomain','quantity','costBoundary','includedIn','name','description','identification',...(costBundle?.currentStudy?['active','parentId','kind']:[])].map(k=>n[k]??null))}
function currentStudyTotal(domain=null){
  const previous=domain==='component'?costBundle.componentTotal:domain==='process'?costBundle.manufacturingTotal:costBundle.productTotal;
  const unit=previous?.unit||costBundle.productTotal?.unit||'套';
  const scopeGaps=(costBundle.currentStudy?.scopeGaps||[]).map(g=>g.nodeId).filter(id=>project.nodes.some(n=>n.id===id&&(domain?n.costDomain===domain:['component','process'].includes(n.costDomain))));
  const expected=[...new Set([...project.nodes.filter(n=>n.kind==='item'&&n.active&&n.costBoundary==='independent'&&(domain?n.costDomain===domain:['component','process'].includes(n.costDomain))).map(n=>n.id),...scopeGaps])].sort();
  const included=costBundle.items.filter(i=>expected.includes(i.nodeId)&&Number.isFinite(i.perProductEstimate?.low)&&Number.isFinite(i.perProductEstimate?.high)&&i.perProductEstimate.unit===unit);
  const ids=included.map(i=>i.nodeId).sort();
  const partial=costBundle.items.filter(i=>expected.includes(i.nodeId)&&i.coverage?.status==='partial').map(i=>i.nodeId).sort();
  const missing=expected.filter(id=>!ids.includes(id)||partial.includes(id)||scopeGaps.includes(id));
  const currencies=[...new Set(included.map(i=>i.perProductEstimate.currency))];
  const subtotal={low:included.length&&currencies.length===1?included.reduce((sum,i)=>sum+i.perProductEstimate.low,0):null,high:included.length&&currencies.length===1?included.reduce((sum,i)=>sum+i.perProductEstimate.high,0):null};
  const complete=expected.length>0&&!missing.length&&currencies.length===1;
  return {...previous,low:complete?subtotal.low:null,high:complete?subtotal.high:null,currency:currencies.length===1?currencies[0]:'CNY',unit,status:complete?'complete':included.length?'partial':'unavailable',complete,subtotal,includedNodeIds:ids,missingNodeIds:missing,partialNodeIds:partial,expectedNodeIds:expected,mixedCurrencies:currencies.length>1};
}
function invalidateCost(id){
  if(!costBundle)return;
  costBundle.items=costBundle.items.filter(i=>i.nodeId!==id);
  if(costBundle.currentStudy){
    costBundle.componentTotal=currentStudyTotal('component');costBundle.manufacturingTotal=currentStudyTotal('process');costBundle.productTotal=currentStudyTotal();
  }else{
    const p=costBundle.items.filter(i=>i.domain==='process'&&i.estimate?.low!=null);
    costBundle.manufacturingTotal={...costBundle.manufacturingTotal,low:p.length?p.reduce((sum,i)=>sum+i.estimate.low,0):null,high:p.length?p.reduce((sum,i)=>sum+i.estimate.high,0):null,includedNodeIds:p.map(i=>i.nodeId)};
  }
  costBundle.warnings=[...(costBundle.warnings||[]),`${id} 的拆解信息已修改，历史成本暂不套用；保存结构后重新校验。`];
}
function source(id){return project.sources.find(s=>s.id===id);}
function byId(id){return project.nodes.find(n=>n.id===id);}
function children(id){return project.nodes.filter(n=>n.parentId===id);}

function renderProject() {
  $('project-title').textContent=project.productName;
  $('project-summary').textContent='在关系图中点击部件或工艺缩略图，查看成本估算、对标依据和价格来源。';
  $('original-project-summary').textContent=project.summary;
  const decompositionRecord=$('decomposition-record');
  if(decompositionRecord){
    const archive=project.decompositionPromptIndex;
    const available=typeof archive==='string'&&/^research-runs\/stage1-[a-z0-9-]+\/index\.html$/.test(archive);
    decompositionRecord.classList.toggle('hidden',!available);
    decompositionRecord.innerHTML=available?`<a href="/${esc(archive)}" target="_blank" rel="noopener noreferrer">拆分各轮提示词与结果 ↗</a>`:'';
  }
  $('issues-list').innerHTML=project.issues.map(i=>`<li>${esc(i)}</li>`).join('');
  $('issue-count').textContent=`${project.issues.length} 项`;
  $('sources-list').innerHTML=project.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a>`).join('');
  $('source-count').textContent=`${project.sources.length} 条`;
  const material=project.nodes.filter(n=>n.kind==='item'&&n.costDomain==='component'&&n.active&&n.costBoundary==='independent').length;
  const process=project.nodes.filter(n=>n.kind==='item'&&n.costDomain==='process'&&n.active&&n.costBoundary==='independent').length;
  $('pricing-scope').textContent=`待累计口径：${material} 项物料一级成本 + ${process} 项成品工艺成本 + 利润／管理／销售／研发四项。一级组成只用于归类，不另计价。`;
  renderGraph();
  renderCostWorkspace();
}
function costItem(id){return costBundle?.items?.find(i=>i.nodeId===id);}
function graphReference(n){
  if(!n||n.kind!=='item')return null;
  const identity=costBundle?.currentStudy&&costItem(n.id)?.raw?.identity;
  if(identity?.pricingObject)return {text:`本次取价 · ${identity.pricingObject}`,title:[identity.pricingObject,identity.explanation].filter(Boolean).join(' · ')};
  const info=n.costDomain==='component'?n.identification:null;
  return info?{text:`${tierLabels[info.referenceTier]||'参考待核'} · ${info.referenceModel||'待补参考'}`,title:info.match}:null;
}
function costNumber(n, upper=false){
  const digits=n!==0&&Math.abs(n)<1?Math.max(4,1-Math.floor(Math.log10(Math.abs(n)))):2;
  const fractionDigits=digits>100?4:digits;
  return new Intl.NumberFormat('zh-CN',{minimumFractionDigits:fractionDigits,maximumFractionDigits:fractionDigits,notation:digits>100?'scientific':'standard',roundingMode:upper?'ceil':'floor'}).format(n===0?0:n);
}
function costAmount(e){
  if(!e || e.low==null || e.high==null)return '待审核';
  const currency={CNY:'¥',USD:'US$',EUR:'€',SGD:'S$'}[e.currency] || `${e.currency} `;
  return `${currency}${costNumber(e.low)}–${costNumber(e.high,true)}`;
}
function displayEstimate(item){
  const manual=costBundle?.review?.ranges?.[item?.nodeId];
  return manual?.low!=null && manual?.high!=null && manual.basisKey===item?.basisKey ? {...manual,label:'人工确认',unit:item.estimate?.unit}:item?.estimate;
}
function openNode(id){
  const n=byId(id);
  if(n?.kind==='item' && ['component','process'].includes(n.costDomain) && costItem(id)) window.CostDetail.open(id);
  else openDetail(id);
}
function renderCostWorkspace(){
  const items=costBundle?.items||[];
  const pending=items.filter(i=>i.estimate?.low==null).length;
  const total=costBundle?.manufacturingTotal;
  if(costBundle?.currentStudy){
    const componentNodes=project.nodes.filter(n=>n.kind==='item'&&n.costDomain==='component');
    const adopted=componentNodes.filter(n=>n.active&&n.costBoundary==='independent');
    const full=costBundle.productTotal, parts=costBundle.componentTotal;
    const excluded=componentNodes.filter(n=>!n.active).length;
    const detail=costBundle.currentStudy.scopeSummary||costBundle.currentStudy.summary||'按各项数量策略估价，单价乘每成品用量后汇总。';
    const displayTotal=value=>value?.status==='complete'?`${costAmount(value)} <em>/${esc(value.unit)}</em>`:value?.subtotal?.low!=null?`${costAmount({...value,...value.subtotal})} <em>/${esc(value.unit)} · 已估小计</em>`:'尚未形成金额';
    $('cost-overview').innerHTML=`<div><span>框架与本轮范围</span><strong>${componentNodes.length} 个物料成本节点 · ${adopted.length} 个参与累计</strong><small>${esc(detail)}${excluded?` ${excluded} 个物料节点未参与累计，含包内项、条件项或暂缓项；范围缺口另计。`:''}</small></div><div><span>${full?.status==='complete'?'本轮物料与工艺合计':'已估部分 · 完整总价待补'}</span><strong>${displayTotal(full)}</strong><small>${full?.includedNodeIds?.length||0} 项已折合每成品 · ${full?.missingNodeIds?.length||0} 项缺口；不含利管销研${full?.mixedCurrencies?'，币种尚未统一':''}</small></div><div><span>覆盖与数量口径</span><strong>物料已估 ${parts?.includedNodeIds?.length||0}/${parts?.expectedNodeIds?.length||adopted.length} · 工艺已估 ${total?.includedNodeIds?.length||0}/${total?.expectedNodeIds?.length||0}</strong><small>条件估算按用量累计；缺项不当零。${full?.partialNodeIds?.length?`其中 ${full.partialNodeIds.length} 项仅估部分范围。`:''}${parts?.missingNodeIds?.length?`物料缺口 ${parts.missingNodeIds.length} 项。`:''}${total?.missingNodeIds?.length?`工艺缺口 ${total.missingNodeIds.length} 项。`:''}</small></div>`;
  }else{
    $('cost-overview').innerHTML=`<div><span>制造成本口径</span><strong>成熟大批量 · 平均每台</strong><small>按当前工艺与产线假设，订单准备费充分摊薄</small></div><div><span>成品工艺 · ${total?.includedNodeIds?.length??0} 项合计</span><strong>${total?.low!=null?costAmount(total)+' <em>/台</em>':costBundle?'尚无估算':'正在读取估算…'}</strong><small>条件估算，含人工、设备、耗材；不含部件</small></div><div><span>部件采购口径</span><strong>真实批量报价参考</strong><small>${items.length?`${items.filter(i=>i.domain==='component').length} 项部件 · ${pending} 项对标待审核`:costBundle?'尚无成本研究':'加载各项成本资料'} · 来源保留原数量条件</small></div>`;
  }
  if(costBundle){$('cost-load-error').textContent=(costBundle.warnings||[]).join(' ');$('cost-load-error').classList.toggle('hidden',!costBundle.warnings?.length)}
  document.querySelectorAll('.node-card[data-node]').forEach(b=>{
    b.querySelector('.graph-cost')?.remove();const item=costItem(b.dataset.node);
    const reference=graphReference(byId(b.dataset.node)), previous=b.querySelector('.node-reference');
    if(reference){const row=previous||document.createElement('div');row.className='node-reference';row.textContent=reference.text;row.title=reference.title||'';if(!previous)b.insertBefore(row,b.querySelector('p'));}
    else previous?.remove();
    if(item){const badge=document.createElement('span');badge.className='graph-cost';badge.textContent=costAmount(displayEstimate(item))+(costBundle?.currentStudy?` /${item.estimate.unit}`:'')+(item.coverage?.status==='partial'&&item.estimate?.low!=null?' · 已估部分':'')+' · 查看估价';b.append(badge)}
  });
}
function nodeRole(n){
  if(n.kind==='root')return '标准成品';
  if(n.kind==='category')return '成本类别';
  if(n.kind==='group')return n.costDomain==='component'?'一级组成 · 不计价':'分组 · 不计价';
  if(n.costDomain==='component')return n.active&&n.costBoundary==='independent'?'一级成本':'一级成本候选';
  if(n.costDomain==='process')return n.active&&n.costBoundary==='independent'?'成品工艺成本':'工艺候选';
  return '固定费用';
}
function position(n,x,y,w,h){coords.set(n.id,{x,y,w,h});}
function visibleGraphGroups(){
  const query=graphQuery.trim().toLocaleLowerCase();
  const matches=n=>[n.id,n.name,n.description,n.identification?.confirmedModel,n.identification?.referenceModel,graphReference(n)?.text].filter(Boolean).join(' ').toLocaleLowerCase().includes(query);
  return project.nodes.filter(n=>n.kind==='group'&&(!graphGroup||n.id===graphGroup)&&(!query||matches(n)||children(n.id).some(matches)));
}
function renderGraphNavigation(){
  const groups=project.nodes.filter(n=>n.kind==='group'), select=$('graph-group');
  if(select){
    if(graphGroup&&!groups.some(n=>n.id===graphGroup))graphGroup='';
    select.innerHTML='<option value="">全部分组</option>'+groups.map(n=>`<option value="${esc(n.id)}">${esc(labels[n.costDomain])} · ${esc(n.name)}</option>`).join('');
    select.value=graphGroup;
  }
  const visible=visibleGraphGroups(), count=visible.reduce((sum,n)=>sum+children(n.id).length,0);
  if($('graph-scope-note'))$('graph-scope-note').textContent=`当前显示 ${visible.length}/${groups.length} 个分组 · ${count} 项。${count>80?'可选择分组或搜索以便逐项审阅。':'筛选不改变整套成本汇总。'}`;
}
function buildLayout() {
  coords.clear(); let x=65;
  const root=project.nodes.find(n=>n.kind==='root');
  const visibleGroups=visibleGraphGroups();
  const categories=children(root.id).filter(n=>n.kind==='category'&&visibleGroups.some(g=>g.parentId===n.id));
  for(const cat of categories){
    const groups=visibleGroups.filter(n=>n.parentId===cat.id);
    const groupCenters=[];
    for(const group of groups){
      const items=children(group.id).filter(n=>n.kind==='item');
      const start=x;
      for(const item of items){position(item,x,760,220,194);x+=255;}
      if(!items.length)x+=255;
      const span=x-start-35;
      const center=start+span/2;
      position(group,center-115,510,230,175);
      groupCenters.push(center);
      x+=68;
    }
    if(!groups.length){groupCenters.push(x+125);x+=250;}
    const center=(groupCenters[0]+groupCenters[groupCenters.length-1])/2;
    position(cat,center-125,270,250,185);x+=95;
  }
  worldWidth=Math.max(1000,x+50);
  position(root,worldWidth/2-140,25,280,205);
  $('world').style.width=`${worldWidth}px`;$('world').style.height='990px';
  $('links').setAttribute('width',worldWidth);$('links').setAttribute('height',990);
}
function path(from,to){const a=coords.get(from),b=coords.get(to);if(!a||!b)return '';
  const x1=a.x+a.w/2,y1=a.y+a.h,x2=b.x+b.w/2,y2=b.y,mid=(y1+y2)/2;
  return `<path d="M${x1} ${y1} V${mid} H${x2} V${y2}"/>`;
}
function renderGraph() {
  renderGraphNavigation();
  buildLayout();
  $('links').innerHTML=project.nodes.filter(n=>n.parentId).map(n=>path(n.parentId,n.id)).join('');
  $('cards').innerHTML=project.nodes.map(n=>{const c=coords.get(n.id);if(!c)return '';
    const src=n.imageUrl||'';const image=src?`<img src="${esc(src)}" alt="${esc(n.imageLabel)}" loading="lazy">`:'<div class="missing-image">图片待核</div>';
    const status=n.kind==='item'?labels[n.status]:labels[n.costDomain];
    const text=n.costDomain==='overhead'?'':n.description;
    const qualifier=n.kind==='item'||n.kind==='root'?` · ${esc(n.quantity)}`:'';
    const reference=graphReference(n);
    const ref=reference?`<div class="node-reference" title="${esc(reference.title)}">${esc(reference.text)}</div>`:'';
    return `<button class="node-card ${esc(n.kind)} ${esc(n.costDomain)} ${n.active?'':'inactive'}" data-node="${esc(n.id)}" style="left:${c.x}px;top:${c.y}px">${image}<span class="kicker"><span>${esc(nodeRole(n))}${qualifier}</span><span>${esc(status)}</span></span><h3>${esc(n.name)}</h3>${ref}<p>${esc(text)}</p></button>`;
  }).join('');
  $('cards').querySelectorAll('[data-node]').forEach(b=>b.onclick=()=>{if(Date.now()-(window.lastCanvasDrag||0)<180)return;openNode(b.dataset.node)});
  fitView();
}
function applyView(){ $('world').style.transform=`translate(${panX}px,${panY}px) scale(${scale})`; $('zoom-label').textContent=`${Math.round(scale*100)}%`; }
function centerView(){const root=coords.get(project.nodes.find(n=>n.kind==='root').id);scale=.7;panX=$('viewport').clientWidth/2-(root.x+root.w/2)*scale;panY=18;applyView();}
function fitView(){scale=Math.max(.12,Math.min(.9,($('viewport').clientWidth-55)/worldWidth,($('viewport').clientHeight-45)/990));panX=($('viewport').clientWidth-worldWidth*scale)/2;panY=($('viewport').clientHeight-990*scale)/2;applyView();}
function zoomAt(next,x=$('viewport').clientWidth/2,y=$('viewport').clientHeight/2){next=Math.max(.12,Math.min(1.6,next));panX=x-(x-panX)*next/scale;panY=y-(y-panY)*next/scale;scale=next;applyView();}

function openDetail(id) {
  selected=id;const n=byId(id);if(!n)return;
  $('detail-kicker').textContent=`${labels[n.costDomain]} / ${n.id} / ${labels[n.status]}`;
  $('detail-title').textContent=n.name;
  $('detail-image').src=n.imageUrl||'';$('detail-image').alt=n.imageLabel||n.name;
  $('detail-image-label').textContent=n.imageLabel||'配图待核';
  $('detail-meta').textContent=`${nodeRole(n)} · ${labels[n.costBoundary]} · ${n.active?'参与后续估算':'暂不参与后续估算'}`;
  $('edit-name').value=n.name;$('edit-quantity').value=n.quantity;$('edit-description').value=n.description;
  $('edit-status').value=n.status;$('edit-boundary').value=n.costBoundary;$('edit-active').checked=n.active;
  $('edit-included').innerHTML='<option value="">无</option>'+project.nodes.filter(x=>x.id!==id&&x.kind==='item').map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  $('edit-included').value=n.includedIn||'';
  $('edit-parent').innerHTML=project.nodes.filter(x=>x.kind==='group'&&x.costDomain===n.costDomain).map(x=>`<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('');
  $('edit-parent').value=n.parentId;
  $('edit-parent').disabled=n.kind!=='item';
  $('edit-image-url').value=n.imageUrl||'';$('edit-image-label').value=n.imageLabel||'';
  $('edit-image-source').innerHTML='<option value="">待补来源</option>'+project.sources.map(s=>`<option value="${esc(s.id)}">${esc(s.title)}</option>`).join('');
  $('edit-image-source').value=n.imageSourceId||'';
  const isComponent=n.kind==='item'&&n.costDomain==='component';
  $('identification-fields').classList.toggle('hidden',!isComponent);
  if(isComponent){
    const info=n.identification||blankIdentification();
    $('id-confirmed-model').value=info.confirmedModel||'';$('id-confirmed-maker').value=info.confirmedMaker||'';$('id-confirmed-supplier').value=info.confirmedSupplier||'';
    $('id-tier').value=info.referenceTier||'performance_benchmark';$('id-reference-model').value=info.referenceModel||'';$('id-reference-maker').value=info.referenceMaker||'';
    $('id-match').value=info.match||'';$('id-path').value=(info.path||[]).join('\n');
    $('id-sources').innerHTML='<strong>型号与对标依据</strong>'+project.sources.map(s=>`<label class="source-check"><input type="checkbox" value="${esc(s.id)}" ${(info.sourceIds||[]).includes(s.id)?'checked':''}><span>${esc(s.title)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">↗</a></span></label>`).join('');
  }
  $('detail-evidence').innerHTML='<strong>依据与来源</strong>'+ (project.sources.length?project.sources.map(s=>`<label class="source-check"><input type="checkbox" value="${esc(s.id)}" ${n.evidence.includes(s.id)?'checked':''}><span>${esc(s.title)} <a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">↗</a></span></label>`).join(''):'<p>暂无来源，请先在页面下方添加。</p>');
  $('add-child').style.display=n.kind==='group'?'':'none';
  $('delete-node').style.display=n.kind==='item'?'':'none';
  $('edit-boundary').disabled=n.kind!=='item';
  $('detail').showModal();
}
function applyDetail() {
  const existing=byId(selected);if(!existing)return;
  const n=JSON.parse(JSON.stringify(existing));
  const previousScope=costScope(n);
  n.name=$('edit-name').value.trim();n.quantity=$('edit-quantity').value.trim();n.description=$('edit-description').value.trim();
  n.status=$('edit-status').value;n.active=$('edit-active').checked;
  n.imageUrl=$('edit-image-url').value.trim();n.imageLabel=$('edit-image-label').value.trim();n.imageSourceId=$('edit-image-source').value;
  n.evidence=[...$('detail-evidence').querySelectorAll('input:checked')].map(input=>input.value);
  if(n.kind==='item'&&n.costDomain==='component'){
    const info={confirmedModel:$('id-confirmed-model').value.trim(),confirmedMaker:$('id-confirmed-maker').value.trim(),confirmedSupplier:$('id-confirmed-supplier').value.trim(),referenceTier:$('id-tier').value,referenceModel:$('id-reference-model').value.trim(),referenceMaker:$('id-reference-maker').value.trim(),match:$('id-match').value.trim(),path:$('id-path').value.split('\n').map(x=>x.trim()).filter(Boolean),sourceIds:[...$('id-sources').querySelectorAll('input:checked')].map(input=>input.value)};
    if(!info.referenceModel||!info.match||!info.path.length||!info.sourceIds.length){toast('物料需要参考对象、可比说明、查找路径和来源');return;}
    if(info.referenceTier==='exact_model_supplier'&&(!info.confirmedModel||!info.confirmedSupplier)){toast('选择实装型号与供应商时，请填写已确认的信息');return;}
    if(info.referenceTier==='exact_model'&&!info.confirmedModel){toast('选择实装型号时，请填写已确认型号');return;}
    if(['exact_model_supplier','exact_model'].includes(info.referenceTier)&&info.referenceModel!==info.confirmedModel){toast('实装型号层级的参考型号应与已确认型号一致');return;}
    n.identification=info;
  }
  if(n.kind==='item'){n.parentId=$('edit-parent').value;n.costBoundary=$('edit-boundary').value;n.includedIn=n.costBoundary==='included' ? $('edit-included').value : '';}
  if(!n.name||(!n.description&&n.kind==='item'&&n.costDomain!=='overhead')){toast('名称及部件/工艺介绍不能为空');return;}
  if(n.kind==='item'&&(!n.imageUrl||!n.imageLabel||!n.imageSourceId)){toast('每个项目需要配图、图注和图片来源');return;}
  if(n.costBoundary==='included'&&!n.includedIn){toast('请选择已包含在哪个节点');return;}
  if(n.kind==='item'&&n.costDomain!=='overhead'&&n.active&&n.costBoundary!=='independent'){toast('参与累计的物料或工艺必须标为独立一级成本');return;}
  Object.assign(existing,n);
  if(costScope(n)!==previousScope)invalidateCost(n.id);
  markDirty();$('detail').close();renderGraph();renderCostWorkspace();
}
function addChild(){const parent=byId(selected);if(!parent||parent.kind!=='group')return;
  const root=project.nodes.find(n=>n.kind==='root');
  const node={id:'N-'+Date.now().toString(36),parentId:parent.id,kind:'item',costDomain:parent.costDomain,name:'新项目',quantity:'待核',description:parent.costDomain==='overhead'?'':'请填写此项在产品中的作用',status:'unverified',evidence:[],imageUrl:root.imageUrl,imageLabel:'整机外观定位；该项图片待补',imageSourceId:root.imageSourceId,active:false,costBoundary:'pending',includedIn:'',identification:null};
  if(parent.costDomain==='component')node.identification=blankIdentification();
  project.nodes.push(node);
  const n=project.nodes[project.nodes.length-1];markDirty();$('detail').close();renderGraph();openDetail(n.id);
}
function deleteNode(){const n=byId(selected);if(!n||n.kind!=='item')return;if(!confirm(`删除“${n.name}”？`))return;
  project.nodes=project.nodes.filter(x=>x.id!==selected);for(const other of project.nodes)if(other.includedIn===selected){other.includedIn='';other.costBoundary='pending';}
  invalidateCost(selected);markDirty();$('detail').close();renderGraph();renderCostWorkspace();
}
async function saveProject(){try{if(!project||project.status!=='ready')return;project=await api(`/api/projects/${project.id}`,{method:'PUT',body:JSON.stringify(project)});dirty=false;$('save-state').textContent='结构已保存';await loadProjectCosts(project.id);toast('结构已保存，成本口径已重新校验');}catch(e){toast(e.message);}}

function boot(){
  $('graph-group').onchange=e=>{graphGroup=e.target.value;renderGraph();renderCostWorkspace()};
  $('graph-search').oninput=e=>{graphQuery=e.target.value;renderGraph();renderCostWorkspace()};
  $('graph-reset').onclick=()=>{graphGroup='';graphQuery='';$('graph-search').value='';renderGraph();renderCostWorkspace()};
  $('nav-home').onclick=()=>route('home');$('nav-projects').onclick=()=>route('projects');$('nav-assets').onclick=()=>route('assets');
  document.querySelectorAll('[data-open-project]').forEach(b=>b.onclick=()=>route('project',b.dataset.openProject));
  $('start-form').onsubmit=async e=>{e.preventDefault();const b=$('start-form').querySelector('button[type=submit]');b.disabled=true;try{const p=await api('/api/projects',{method:'POST',body:JSON.stringify({product:$('product').value,prior:$('prior').value})});route('project',p.id);}catch(err){toast(err.message)}finally{b.disabled=false}};
  $('asset-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());try{await api('/api/assets',{method:'POST',body:JSON.stringify(data)});e.target.reset();await listAssets();toast('资产已保存')}catch(err){toast(err.message)}};
  $('source-form').onsubmit=e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target).entries());const url=data.url.trim();if(!/^https?:\/\//i.test(url)){toast('请填写 http(s) 来源链接');return}project.sources.push({id:'S-'+Date.now().toString(36),title:data.title.trim(),url});e.target.reset();markDirty();renderProject();toast('来源已添加；请在节点详情中关联')};
  $('save-project').onclick=saveProject;
  $('zoom-in').onclick=()=>zoomAt(scale*1.18);$('zoom-out').onclick=()=>zoomAt(scale/1.18);$('fit').onclick=fitView;
  $('detail-close').onclick=()=>$('detail').close();$('apply-detail').onclick=applyDetail;$('add-child').onclick=addChild;$('delete-node').onclick=deleteNode;
  $('edit-issues').onclick=()=>{$('issues-input').value=project.issues.join('\n');$('issues-dialog').showModal()};
  $('issues-close').onclick=()=>$('issues-dialog').close();$('issues-apply').onclick=()=>{project.issues=$('issues-input').value.split('\n').map(s=>s.trim()).filter(Boolean);markDirty();$('issues-dialog').close();renderProject()};
  let gesture=null;const v=$('viewport');v.onpointerdown=e=>{if(e.button!==0)return;gesture={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY,moved:false}};
  v.onpointermove=e=>{if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;if(Math.abs(dx)+Math.abs(dy)>5&&!gesture.moved){gesture.moved=true;v.setPointerCapture(e.pointerId)}if(gesture.moved){v.classList.add('dragging');panX=gesture.px+dx;panY=gesture.py+dy;applyView()}};
  v.onpointerup=e=>{if(gesture?.id===e.pointerId){if(gesture.moved)window.lastCanvasDrag=Date.now();gesture=null;v.classList.remove('dragging');if(v.hasPointerCapture(e.pointerId))v.releasePointerCapture(e.pointerId)}};
  v.addEventListener('wheel',e=>{e.preventDefault();if(e.ctrlKey||e.metaKey){const box=v.getBoundingClientRect();zoomAt(scale*(e.deltaY<0?1.1:.9),e.clientX-box.left,e.clientY-box.top)}else{panX-=e.deltaX;panY-=e.deltaY;applyView()}},{passive:false});
  window.addEventListener('hashchange',()=>showRoute().catch(e=>toast(e.message)));
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
  window.addEventListener('resize',()=>{if(project?.status==='ready')centerView()});
  showRoute().catch(e=>toast(e.message));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, {once:true}); else boot();
