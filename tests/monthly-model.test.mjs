import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMonthly, monthlyProblem, termMonths, monthlyLabel, SURAHS, validMonthlyRange, monthlyRangeText, monthlyProgress, applyMonthlyAmounts, copyMonthlyAmounts, copyMemorizationToRevision, monthlyAbsent, setMonthlyAbsent, mergeMonthlyRoster } from '../dist/assets/monthly-model.mjs';
test('monthly periods include the partial first and last months', () => {
  assert.deepEqual(termMonths({starts_on:'2026-09-27',ends_on:'2026-12-17'}), ['2026-09-01','2026-10-01','2026-11-01','2026-12-01']);
});
test('empty amounts fail; explicit no memorization and no revision is valid', () => {
  const row=emptyMonthly('student'); assert.equal(monthlyProblem(row),'الحفظ');
  row.memorization={none:true,text:''}; assert.equal(monthlyProblem(row),'المراجعة');
  row.revision={none:true,text:''}; assert.equal(monthlyProblem(row),'');
});
test('teacher-written amounts cannot be empty or hidden behind none', () => {
  const row=emptyMonthly('student');
  row.memorization={none:false,text:'من سورة البقرة آية ١ إلى سورة البقرة آية ٢٠'};
  row.revision={none:true,text:''}; assert.equal(monthlyProblem(row),'');
  row.memorization.text=' '; assert.equal(monthlyProblem(row),'الحفظ');
  row.memorization.none=true; assert.equal(monthlyProblem(row),'الحفظ');
});

test('four ordinal periods are independent of term length',()=>{
 const term={starts_on:'2026-12-27',ends_on:'2027-01-01'};
 assert.deepEqual(termMonths(term),['2026-12-01','2027-01-01','2027-02-01','2027-03-01']);
 assert.deepEqual(termMonths(term).map(m=>monthlyLabel(term,m)),['الشهر الأول','الشهر الثاني','الشهر الثالث','الشهر الرابع']);
});
test('all 114 surahs enforce ayah boundaries',()=>{
 assert.equal(SURAHS.length,114);
 for(const s of SURAHS){const r={from_surah:s.number,to_surah:s.number,from_ayah:1,to_ayah:s.verses};assert.ok(validMonthlyRange(r));assert.ok(!validMonthlyRange({...r,to_ayah:s.verses+1}));}
 assert.ok(!validMonthlyRange({from_surah:2,to_surah:2,from_ayah:20,to_ayah:10}));assert.ok(!validMonthlyRange({}));
 assert.equal(monthlyRangeText({from_surah:114,from_ayah:1,to_surah:113,to_ayah:5}),'من سورة الناس آية 1 إلى سورة الفلق آية 5');
});

test('monthly progress counts students only when both amounts are complete',()=>{
 const a=emptyMonthly('a'), b=emptyMonthly('b');a.memorization={none:true,text:''};a.revision={none:true,text:''};
 assert.deepEqual(monthlyProgress([a,b]),{total:2,completed:1,remaining:1,percent:50,complete:false});
 b.memorization={none:false,text:'partial',range:{from_surah:2,from_ayah:1}};assert.equal(monthlyProgress([a,b]).percent,50);
 b.memorization={none:false,text:'old report'};b.revision={none:true,text:''};assert.equal(monthlyProgress([a,b]).complete,true);
 assert.equal(monthlyProgress([]).complete,false);
});

test('bulk amounts change selected fields only, preserve notes and isolate student copies',()=>{
 const rows=['a','b','c'].map(emptyMonthly);rows[0].note='keep note';rows[0].revision={none:false,text:'old revision'};
 const range={from_surah:2,to_surah:2,from_ayah:1,to_ayah:20},amount={none:false,text:monthlyRangeText(range),range};
 const next=applyMonthlyAmounts(rows,['a','b'],{memorization:amount});
 assert.equal(next[0].note,'keep note');assert.equal(next[0].revision.text,'old revision');assert.deepEqual(next[2],rows[2]);assert.equal(rows[0].memorization.text,'');
 next[0].memorization.range.to_ayah=10;assert.equal(next[1].memorization.range.to_ayah,20);assert.equal(amount.range.to_ayah,20);
 const both=applyMonthlyAmounts(rows,['a','b'],{memorization:amount,revision:amount});assert.equal(monthlyProgress(both).completed,2);
 assert.throws(()=>applyMonthlyAmounts(rows,[],{memorization:amount}));assert.throws(()=>applyMonthlyAmounts(rows,['outside'],{memorization:amount}));assert.throws(()=>applyMonthlyAmounts(rows,['a'],{memorization:{...amount,range:{...range,to_ayah:287}}}));
});

test('copy both amounts preserves source, target notes, other students and independent ranges',()=>{
 const rows=['source','target','other'].map(emptyMonthly),r={from_surah:2,to_surah:2,from_ayah:1,to_ayah:20};
 rows[0].memorization={none:false,text:monthlyRangeText(r),range:r};rows[0].revision={none:true,text:''};rows[1].note='personal note';
 const before=structuredClone(rows),next=copyMonthlyAmounts(rows,'source',['target']);
 assert.deepEqual(rows,before);assert.deepEqual(next[0],before[0]);assert.deepEqual(next[2],before[2]);assert.equal(next[1].note,'personal note');assert.equal(monthlyProblem(next[1]),'');
 next[1].memorization.range.to_ayah=10;assert.equal(rows[0].memorization.range.to_ayah,20);
 assert.throws(()=>copyMonthlyAmounts(rows,'source',['source']));assert.throws(()=>copyMonthlyAmounts(rows,'other',['target']));assert.throws(()=>copyMonthlyAmounts(rows,'source',[]));
 rows[0].memorization={none:false,text:'legacy saved amount'};assert.equal(copyMonthlyAmounts(rows,'source',['target'])[1].memorization.text,'legacy saved amount');
});

test('memorization to revision preserves source and notes and rejects partial memorization',()=>{
 const row=emptyMonthly('a'),range={from_surah:2,to_surah:2,from_ayah:1,to_ayah:20};
 row.note='keep';row.memorization={none:false,text:monthlyRangeText(range),range};
 const before=structuredClone(row),next=copyMemorizationToRevision(row);
 assert.deepEqual(row,before);assert.deepEqual(next.revision,row.memorization);assert.equal(next.note,'keep');
 next.revision.range.to_ayah=10;assert.equal(row.memorization.range.to_ayah,20);assert.equal(next.memorization.range.to_ayah,20);
 row.memorization={none:true,text:''};assert.equal(copyMemorizationToRevision(row).revision.none,true);
 row.memorization={none:false,text:'legacy amount'};assert.equal(copyMemorizationToRevision(row).revision.text,'legacy amount');
 assert.throws(()=>copyMemorizationToRevision(emptyMonthly('a')));
 row.memorization={none:false,text:'partial',range:{from_surah:2,from_ayah:1}};assert.throws(()=>copyMemorizationToRevision(row));
});

test('absent student completes monthly report, round trips JSON and restores previous amounts',()=>{
 const row=emptyMonthly('absent');row.note='keep';row.memorization.range.from_surah=2;
 const original=structuredClone(row),absent=setMonthlyAbsent(row,true);
 assert.deepEqual(row,original);assert.ok(monthlyAbsent(absent));assert.equal(monthlyProblem(absent),'');assert.equal(monthlyProgress([absent]).percent,100);
 const saved=JSON.parse(JSON.stringify(absent));assert.ok(monthlyAbsent(saved));assert.deepEqual(setMonthlyAbsent(saved,false),original);
 assert.throws(()=>copyMemorizationToRevision(absent));assert.throws(()=>copyMonthlyAmounts([absent,emptyMonthly('target')],'absent',['target']));
 assert.throws(()=>applyMonthlyAmounts([absent],['absent'],{memorization:{none:true,text:''}}));
});

test('roster refresh adds new students and preserves unsaved amounts, absence and saved version data',()=>{
 const saved=emptyMonthly('old'),draft=setMonthlyAbsent(saved,true);draft.note='unsaved note';
 const students=[{id:'old',active:true},{id:'new1',active:true},{id:'new2',active:true},{id:'archived',active:false}];
 const rows=mergeMonthlyRoster(students,[saved],[draft]);
 assert.equal(rows.size,3);assert.deepEqual(rows.get('old'),draft);assert.equal(monthlyProblem(rows.get('new1')),'الحفظ');assert.equal(rows.get('new2').student_id,'new2');
 rows.get('old').note='changed';assert.equal(draft.note,'unsaved note');assert.equal(saved.note,'');
 assert.ok(mergeMonthlyRoster(students,[emptyMonthly('archived')]).has('archived'));
 assert.ok(!mergeMonthlyRoster(students,[emptyMonthly('transferred')]).has('transferred'));
});
