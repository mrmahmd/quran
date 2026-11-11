import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardRepository} from '../dist/assets/dashboard-repository.mjs';
import {buildKhairkomReport} from '../dist/assets/report-layout.mjs';
function fixture(){
 const data={khairkom_nomination_sets:[{id:'one',term_id:'t',period_no:1},{id:'two',term_id:'t',period_no:2}],khairkom_nominations:[{set_id:'one',student_id:'same',nominated:true,test_parts:[1]},{set_id:'two',student_id:'same',nominated:true,test_parts:[2]}],students:[{id:'same',full_name:'Test student'}]};
 const calls=[];
 const client={rpc:(name,args)=>{calls.push({name,args});return Promise.resolve({data:{},error:null});},from:name=>{
  let rows=[...data[name]]; const query={select:()=>query,order:()=>query,range:()=>query,eq:(key,value)=>(rows=rows.filter(r=>r[key]===value),query),in:(key,values)=>(rows=rows.filter(r=>values.includes(r[key])),query),then:resolve=>Promise.resolve({data:rows,error:null}).then(resolve)};return query;
 }};return {repo:createDashboardRepository(client),calls};
}
test('same student has independent sets and parts in each month; legacy reads default to month one',async()=>{
 const {repo}=fixture();const first=await repo.khairkom('t'),second=await repo.khairkom('t',2);
 assert.equal(first.sets[0].id,'one');assert.deepEqual(first.rows[0].test_parts,[1]);
 assert.equal(second.sets[0].id,'two');assert.deepEqual(second.rows[0].test_parts,[2]);assert.equal(second.students.length,1);
});
test('report, candidates, teacher save and supervised additions explicitly send the month',async()=>{
 const {repo,calls}=fixture();await repo.khairkomReport('t',2);await repo.khairkomCandidates('t',2);await repo.saveKhairkom({p_period:2,p_term:'t'});await repo.addKhairkomNomination({p_period:2,p_term:'t'});
 assert.deepEqual(calls.map(c=>c.name),['khairkom_report_snapshot_period','khairkom_nomination_candidates_period','save_khairkom_nominations_period','add_khairkom_nomination_period']);
 assert.ok(calls.every(c=>c.args.p_period===2));
});
test('printed report identifies the selected month',()=>{
 const html=buildKhairkomReport({term:{name:'Term'},teachers:[],data:{students:[],rows:[]},filterLabel:'الشهر الثاني · جميع المرشحين'});
 assert.ok(html.includes('الشهر الثاني'));assert.ok(!html.includes('الشهر الأول'));
});
test('third-round report separates recitation from memorization and prints parts only for memorization',()=>{
 const teachers=[{username:'teacher',full_name:'معلم تجريبي'}];
 const students=[{id:'m',full_name:'طالب الحفظ'},{id:'r',full_name:'طالب التلاوة'}];
 const rows=[{student_id:'m',teacher_username:'teacher',test_parts:[10],identity_number:'000001'},
   {student_id:'r',teacher_username:'teacher',test_parts:[],identity_number:'000002'}];
 const html=buildKhairkomReport({period:3,teachers,data:{students,rows},filterLabel:'الترشيح الثالث'});
 const [memorization,recitation]=html.split('<h2>تحسين التلاوة</h2>');
 assert.match(memorization, /<h2>الحفظ<\/h2>.*طالب الحفظ.*الجزء ١٠/s);
 assert.match(recitation, /طالب التلاوة.*000002/s);
 assert.doesNotMatch(recitation, /أجزاء الاختبار|لم تُحدَّد أجزاء/);
 const legacy=buildKhairkomReport({period:1,teachers,data:{students,rows:[rows[1]]}});
 assert.doesNotMatch(legacy, /تحسين التلاوة/);
 assert.match(legacy, /لم تُحدَّد أجزاء الاختبار بعد/);
});
