/* DOM-light integration of the exact scripts embedded in the exported HTML. */
const fs=require('node:fs'), path=require('node:path'), vm=require('node:vm'), assert=require('node:assert/strict');
const entry=path.resolve(process.argv[2]), html=fs.readFileSync(entry,'utf8');
const scripts=[...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)];
assert.equal(scripts.length,2,'Only embedded data and embedded application scripts');
const data=JSON.parse(scripts[0][2]), elements=new Map(), ready=[], downloads=[], saved=new Map();
class Element {
  constructor(){this.innerHTML='';this.textContent='';this.value='';this.style={};this.dataset={};this.events={};this.open=false;this.clientWidth=1200;this.clientHeight=780;this.classList={add(){},remove(){},toggle(){}};this.fields=[];this.queries=new Map();}
  addEventListener(name,fn){this.events[name]=fn;}
  dispatchEvent(e){this.events[e.type]?.(e);}
  setAttribute(){} focus(){} appendChild(){} append(){} remove(){} scrollIntoView(){}
  showModal(){this.open=true;}close(){this.open=false;}
  querySelectorAll(s){return s==='[data-cd-field]'?this.fields:[];}
  querySelector(s){if(!this.queries.has(s))this.queries.set(s,new Element());return this.queries.get(s);}
  click(){this.onclick?.();}
  getBoundingClientRect(){return {left:0,right:1200,top:0,bottom:780,width:1200,height:780};}
}
for(const match of html.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element());
elements.get('offline-data').textContent=scripts[0][2];
let dialog, reloaded=false;
const context={console,Response,Blob,Event,URLSearchParams,requestAnimationFrame:fn=>fn(),setTimeout:()=>0,clearTimeout(){},confirm:()=>true,
  URL:{createObjectURL(blob){downloads.push(blob);return 'blob:test';},revokeObjectURL(){}},
  location:{hash:'',search:'',reload(){reloaded=true;}},MutationObserver:class{observe(){}},addEventListener(){},
  localStorage:{getItem:k=>saved.get(k)||null,setItem:(k,v)=>saved.set(k,v)},
  document:{readyState:'loading',body:new Element(),activeElement:null,
    getElementById(id){assert.ok(elements.has(id),'Known document element: '+id);return elements.get(id);},
    addEventListener(name,fn){if(name==='DOMContentLoaded')ready.push(fn);},querySelectorAll(){return [];},
    createElement(tag){const el=new Element();if(tag==='dialog')dialog=el;return el;}}};
context.window=context;vm.createContext(context);vm.runInContext(scripts[1][2],context);
const settle=()=>new Promise(resolve=>setImmediate(resolve));
(async()=>{
  for(const fn of ready)fn();await settle();
  assert.equal(elements.get('project-title').textContent,data.project.productName);
  assert.ok(!elements.get('cost-load-error').textContent.includes('未能加载'));
  assert.ok(elements.get('cost-load-error').textContent.includes('缺项不按零计价'));
  assert.ok(elements.get('cards').innerHTML.includes('data-node="C-DEMO"'));
  assert.ok(elements.get('cost-overview').innerHTML.includes('已估'));
  let links=0;
  for(const item of data.bundle.items){
    assert.equal(context.CostDetail.open(item.nodeId),true);
    assert.ok(!dialog.innerHTML.includes('[object Object]'));
    assert.ok(!dialog.innerHTML.includes('>NaN'));
    if(item.raw.comparisonGate?.status==='needs_review')assert.ok(dialog.innerHTML.includes('目标金额暂不采用'));
    if(item.nodeId==='P-OPTION')assert.ok(dialog.innerHTML.includes('不独立计入主合计'));
    for(const round of item.raw.researchRounds){for(const key of ['promptPath','resultPath']){
      const local=context.CostOffline.url('/'+round[key]);
      assert.ok(dialog.innerHTML.includes('href="'+local+'"'));
      assert.ok(fs.existsSync(path.resolve(path.dirname(entry),decodeURI(local))));links++;
    }}
    assert.ok(dialog.innerHTML.includes('data:image/'),'Image available offline');
  }
  context.CostDetail.open('C-DEMO');
  const basis=data.bundle.review.ranges['C-DEMO'];
  dialog.fields=Object.entries({low:'31',high:'35',currency:basis.currency,note:'离线集成验证'}).map(([field,value])=>({value,dataset:{cdField:field},checkValidity:()=>true,matches:()=>true}));
  dialog.events.input({target:dialog.fields[0]});assert.equal(context.CostDetail.hasUnsavedChanges(),true);
  elements.get('offline-export').onclick();assert.equal(downloads.length,0,'Cannot silently export unsaved edits');
  dialog.events.click({target:{closest:()=>({dataset:{cdAction:'save'}})}});await settle();
  assert.equal(context.CostDetail.hasUnsavedChanges(),false);assert.equal(context.CostDetail.getData().review.ranges['C-DEMO'].low,31);
  elements.get('offline-reviewer').value='模板测试';elements.get('offline-export').onclick();
  const exported=JSON.parse(await downloads.at(-1).text());assert.equal(exported.review.ranges['C-DEMO'].high,35);assert.equal(exported.reviewer,'模板测试');
  elements.get('offline-csv').onclick();assert.match(await downloads.at(-1).text(),/离线集成验证/);
  await elements.get('offline-file').onchange({target:{files:[{size:1000,text:async()=>JSON.stringify(exported)}],value:'test.json'}});
  assert.equal(reloaded,true);assert.equal(context.CostOffline.envelope().review.ranges['C-DEMO'].note,'离线集成验证');
  assert.equal(data.bundle.review.ranges['C-DEMO'].low,null,'Source study and original review remain unchanged');
  console.log(JSON.stringify({status:'passed',verification:'DOM-light, not a real file browser',itemsRendered:data.bundle.items.length,phaseLinks:links,completeEmbeddedBoot:true,saveExportImportFlow:true,unsavedExportBlocked:true}));
})().catch(e=>{console.error(e);process.exitCode=1;});
