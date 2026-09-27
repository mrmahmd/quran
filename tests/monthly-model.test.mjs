import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMonthly, monthlyProblem, termMonths } from '../dist/assets/monthly-model.mjs';
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
  row.memorization.text='من سورة البقرة آية ١ إلى سورة البقرة آية ٢٠';
  row.revision={none:true,text:''}; assert.equal(monthlyProblem(row),'');
  row.memorization.text=' '; assert.equal(monthlyProblem(row),'الحفظ');
  row.memorization.none=true; assert.equal(monthlyProblem(row),'الحفظ');
});
