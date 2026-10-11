import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMonthly, monthlyProblem, termMonths, monthlyLabel, SURAHS, validMonthlyRange, monthlyRangeText, monthlyProgress } from '../dist/assets/monthly-model.mjs';
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
