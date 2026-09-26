import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyScores, scoreTotal, validateScores, termWeeks, rankWeekly, semesterSummary } from '../dist/assets/evaluation-model.mjs';
const full = id => ({ ...emptyScores(id), memorization: 4, revision: 2, improvement: 2, commitment: 2, bonus_memorization: 1, bonus_revision: 1 });
test('weekly score distinguishes missing scores from a real zero and caps at 12', () => {
  assert.equal(scoreTotal(emptyScores('a')), null);
  assert.equal(scoreTotal(full('a')), 12);
  assert.equal(validateScores(full('a'), true), true);
  assert.equal(validateScores({ ...full('a'), memorization: 5 }, true), false);
  assert.equal(validateScores({ ...full('a'), bonus_revision: 2 }, true), false);
  assert.equal(validateScores({ ...full('a'), improvement: 1.5 }, true), false);
  assert.equal(validateScores(emptyScores('a'), true), false);
  assert.equal(validateScores(emptyScores('a'), false), true);
  const zero = { ...full('a'), memorization: 0, revision: 0, improvement: 0, commitment: 0, bonus_memorization: 0, bonus_revision: 0 };
  assert.equal(scoreTotal(zero), 0);
  assert.equal(validateScores(zero, true), true);
});
test('weeks start on Sunday and include partial beginning/end weeks without local timezone drift', () => {
  assert.deepEqual(termWeeks({ starts_on: '2026-09-09', ends_on: '2026-09-20' }), ['2026-09-06','2026-09-13','2026-09-20']);
  assert.deepEqual(termWeeks({ starts_on: '2026-10-01', ends_on: '2026-09-01' }), []);
});
test('weekly rank uses total then self improvement, not memorized quantity', () => {
  const a = { ...full('a'), full_name: 'أ', improvement: 1, bonus_revision: 0 };
  const b = { ...full('b'), full_name: 'ب', memorization: 2 };
  assert.equal(scoreTotal(a), scoreTotal(b));
  assert.equal(rankWeekly([a,b])[0].student_id, 'b');
});
test('semester totals include bonuses and exclude drafts and incomplete weeks', () => {
  const summary = semesterSummary([{id:'a',full_name:'أ'}], [{id:'approved',status:'submitted'},{id:'draft',status:'draft'}], [
    {...full('a'),review_id:'approved'}, {...full('a'),review_id:'draft'}, {...emptyScores('a'),review_id:'approved'},
  ]);
  assert.equal(summary[0].total, 12);
  assert.equal(summary[0].weeks, 1);
  assert.equal(summary[0].improvement, 2);
});
