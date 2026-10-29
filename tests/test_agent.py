import copy
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools'))
from prepare_round import prepare
from record_round import record
from validate_artifacts import check
from render_review import render,bundle

def read(p):return json.loads(Path(p).read_text(encoding='utf-8'))
def write(p,d):p.write_text(json.dumps(d,ensure_ascii=False)+'\n',encoding='utf-8')

class AgentContractTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)
        self.project=read(ROOT/'examples/demo/project.json')
        self.study=read(ROOT/'examples/demo/study.json')
        self.project_path=self.root/'project.json';self.project_path.write_bytes((ROOT/'examples/demo/project.json').read_bytes())
        self.study_path=self.root/'study.json';write(self.study_path,self.study)

    def test_all_stages_have_resolvable_sufficient_prompts(self):
        workflow=read(ROOT/'agent/workflow.json')
        for stage in workflow['stages']:
            folder=self.root/stage
            prepare(stage,{'product':{'name':'测试'},'nodeSnapshot':{'id':'C-X'},'priorResult':{'route':'mass'}},folder)
            prompt=(folder/'prompt.md').read_text()
            self.assertIn('自动',prompt);self.assertIn('模型',prompt);self.assertIn('C-X',prompt)
            self.assertNotIn('shw5g',prompt.lower());self.assertNotIn('/Users/',prompt)
            self.assertEqual(read(folder/'round.json')['status'],'prepared')

    def test_route_rules_are_relevant_not_all_models_in_every_round(self):
        prepare('component-pricing',{},self.root/'mass','mass')
        prepare('component-pricing',{},self.root/'pcba','pcba')
        prepare('component-plan',{},self.root/'plan')
        self.assertIn('# 外壳、质量',(self.root/'mass/prompt.md').read_text())
        self.assertNotIn('# 剩余板卡模型',(self.root/'mass/prompt.md').read_text())
        self.assertIn('# 剩余板卡模型',(self.root/'pcba/prompt.md').read_text())
        self.assertNotIn('# 外壳、质量',(self.root/'plan/prompt.md').read_text())
        with self.assertRaises(ValueError):prepare('component-pricing',{},self.root/'missing')

    def test_prompts_and_completed_rounds_are_not_overwritten(self):
        folder=self.root/'round';prepare('component-plan',{},folder)
        with self.assertRaises(ValueError):prepare('component-plan',{},folder)
        result=self.root/'result.json';write(result,{'nodeId':'C1'})
        report=self.root/'result.md';report.write_text('测试结果，不是真实研究')
        execution={'executionId':'test-only','mode':'test','configurationInheritance':True,'modelProfile':{'model':None,'reasoningEffort':None},'configurationNote':'模拟记录，没有模型调用'}
        record(folder,result,report,execution)
        self.assertEqual(read(folder/'round.json')['status'],'recorded')
        with self.assertRaises(ValueError):record(folder,result,report,execution)

    def test_changed_prompt_rejects_recording(self):
        folder=self.root/'round';prepare('component-plan',{},folder)
        (folder/'prompt.md').write_text('changed')
        with self.assertRaises(ValueError):record(folder,self.study_path,self.study_path,{'executionId':'test','mode':'test','configurationInheritance':True,'modelProfile':{},'configurationNote':'test'})

    def test_freeze_unknown_candidate_and_no_mutation(self):
        result=check(self.project_path,self.study_path)
        self.assertEqual(result['items'],4)
        b=bundle(self.project,self.study)
        self.assertEqual(b['productTotal']['subtotal']['low'],4)
        self.assertIsNone(b['productTotal']['low'])
        self.assertIn('C-REVIEW',b['productTotal']['missingNodeIds'])
        self.assertNotIn('P-OPTION',b['productTotal']['includedNodeIds'])
        self.assertTrue(all(r['low'] is None for r in b['review']['ranges'].values()))
        self.assertNotIn('basisKey',self.study['items'][0])

    def test_changed_scope_and_wrong_arithmetic_are_rejected(self):
        self.study['items'][0]['nodeSnapshot']['quantity']='100件';write(self.study_path,self.study)
        with self.assertRaises(ValueError):check(self.project_path,self.study_path)
        self.study=read(ROOT/'examples/demo/study.json');self.study['items'][0]['perProductEstimate']['high']=999;write(self.study_path,self.study)
        with self.assertRaises(ValueError):check(self.project_path,self.study_path)

    def test_weak_gate_cannot_self_approve_or_relabel_pass(self):
        item=self.study['items'][1]
        item['estimate'].update(low=2,high=3,kind='conditional_model',evidenceRefs=['S1'])
        item['perProductEstimate'].update(low=2,high=3)
        item['raw']['comparisonGate']['status']='pass';write(self.study_path,self.study)
        with self.assertRaises(ValueError):check(self.project_path,self.study_path)
        approval={'approved':True,'approvedBy':'测试批准人','approvedAt':'2026-10-29T00:00:00Z','reason':'仅测试，不是真实批准'}
        item['raw']['comparisonGate']['humanApproval']=approval;write(self.study_path,self.study)
        with self.assertRaises(ValueError):check(self.project_path,self.study_path)
        check(self.project_path,self.study_path,{'C-REVIEW':approval})

    def test_price_without_real_numeric_tiers_is_rejected(self):
        self.study['items'][0]['raw']['prices']=[{'id':'Q','url':'https://example.invalid/rfq','quoteKind':'reference_quote','sourceIds':['S1'],'tiers':[],'seller':'测试','sourceKey':'test','regionGroup':'china','usage':'reference_only'}]
        write(self.study_path,self.study)
        with self.assertRaises(ValueError):check(self.project_path,self.study_path)

    def test_render_embeds_assets_and_preserves_original_data(self):
        original=self.project_path.read_bytes();out=self.root/'report'
        render(self.project_path,self.study_path,out,media_root=ROOT/'examples/demo')
        text=(out/'打开.html').read_text()
        self.assertIn('data:image/svg+xml;base64,',text)
        self.assertNotIn('src="/static/',text);self.assertNotIn('href="/static/',text)
        self.assertNotIn('森云',text);self.assertNotIn('localhost',text)
        self.assertEqual(self.project_path.read_bytes(),original)
        for row in read(out/'package-manifest.json')['files']:
            self.assertEqual(hashlib.sha256((out/row['path']).read_bytes()).hexdigest(),row['sha256'])

    def test_stage_archive_required_and_relative(self):
        self.study['items'][0]['raw']['researchRounds']=[{'phase':'analysis','label':'分析','promptPath':'research-runs/demo/items/C-DEMO/analysis/prompt.md','resultPath':'research-runs/demo/items/C-DEMO/analysis/result.json'}]
        write(self.study_path,self.study)
        with self.assertRaises(ValueError):render(self.project_path,self.study_path,self.root/'missing')
        for f in ['prompt.md','result.json']:
            p=self.root/'archive/research-runs/demo/items/C-DEMO/analysis'/f;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('{}')
        result=render(self.project_path,self.study_path,self.root/'with-archive',self.root/'archive')
        self.assertEqual(result['archiveLinks'],2)
        self.assertTrue((self.root/'with-archive/research-runs/demo/items/C-DEMO/analysis/result.json.html').exists())

if __name__=='__main__':unittest.main()
