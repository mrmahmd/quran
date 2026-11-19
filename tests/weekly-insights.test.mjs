import test from 'node:test';
import assert from 'node:assert/strict';
import { weeklyInsights, evaluationSignature, FOLLOW_UP_DROP } from '../dist/assets/weekly-insights-model.mjs';

const weeks = ['2026-11-01', '2026-11-08', '2026-11-15', '2026-11-29'];
const students = ['a', 'b', 'c', 'd'].map(id => ({ id, full_name: id, active: true }));
const row = (review_id, student_id, m, r, i, c, bonus = 0) => ({ review_id, student_id, memorization: m, revision: r, improvement: i, commitment: c,
  bonus_memorization: bonus, bonus_revision: 0, total: m + r + i + c + bonus });
const reviews = [
  { id: 'w1', week_start: '2026-11-01', status: 'submitted' },
  { id: 'w2', week_start: '2026-11-08', status: 'draft' },      // not approved: left out of averages
  { id: 'w3', week_start: '2026-11-15', status: 'submitted' },
  { id: 'w4', week_start: '2026-11-29', status: 'draft' },      // selected week, still a draft
];
const evaluations = [
  row('w1', 'a', 4, 2, 2, 2), row('w1', 'b', 2, 1, 1, 2), row('w1', 'c', 4, 2, 2, 2), row('w1', 'd', 3, 1, 1, 1),
  row('w2', 'a', 0, 0, 0, 0), row('w2', 'b', 0, 0, 0, 0),
  row('w3', 'a', 4, 2, 2, 2, 1), row('w3', 'b', 2, 1, 1, 2), row('w3', 'c', 4, 2, 2, 2), row('w3', 'd', 3, 1, 1, 1),
  row('w4', 'a', 4, 2, 2, 2), row('w4', 'b', 4, 2, 2, 2), row('w4', 'c', 2, 1, 1, 1),
];

test('averages use approved weeks only, the selected week as saved, and compare each student with his past', () => {
  const result = weeklyInsights({ students, reviews, evaluations, weeks, week: '2026-11-29' });
  assert.equal(result.status, 'draft');
  assert.equal(result.approvedWeeks, 2);
  assert.equal(result.previousWeek, '2026-11-15');
  assert.equal(result.weekAverage, (10 + 10 + 5) / 3);
  assert.equal(result.previousAverage, (11 + 6 + 10 + 6) / 4);
  assert.equal(result.termAverage, (10 + 6 + 10 + 6 + 11 + 6 + 10 + 6) / 8);
  const by = Object.fromEntries(result.perStudent.map(item => [item.id, item]));
  assert.equal(by.a.pastAverage, 10.5); assert.equal(by.a.change, -0.5); assert.equal(by.a.state, 'down');
  assert.equal(by.b.pastAverage, 6); assert.equal(by.b.state, 'up');
  assert.equal(by.c.change, 5 - 10); assert.ok(by.c.change <= -FOLLOW_UP_DROP); assert.equal(by.c.state, 'drop');
  assert.equal(by.d.state, 'missing');
  assert.deepEqual([result.improved, result.dropped, result.missing, result.followUp], [1, 1, 1, 2]);
  // The draft week of 8 Nov never counts, even in a student's history.
  assert.deepEqual(by.a.history, [10, null, 11, 10]);
  const memorization = result.criteria.find(item => item.key === 'memorization');
  assert.equal(memorization.week, (4 + 4 + 2) / 3 / 4);
  assert.equal(memorization.term, (4 + 2 + 4 + 3 + 4 + 2 + 4 + 3) / 8 / 4);
  assert.deepEqual(result.trend.map(item => item.approved), [true, false, true, false]);
});

test('an earlier selected week ignores later weeks, and a first week has no comparison', () => {
  const result = weeklyInsights({ students, reviews, evaluations, weeks, week: '2026-11-01' });
  assert.equal(result.approvedWeeks, 1);
  assert.equal(result.previousWeek, null);
  assert.equal(result.weekChange, null);
  assert.ok(result.perStudent.every(item => item.state === 'first'));
  assert.equal(result.trend.length, 1);
});

test('the signature changes when a teacher saves new scores', () => {
  const before = evaluationSignature({ reviews, evaluations });
  assert.equal(before, evaluationSignature({ reviews: [...reviews].reverse(), evaluations: [...evaluations].reverse() }));
  assert.notEqual(before, evaluationSignature({ reviews, evaluations: [...evaluations, row('w4', 'd', 1, 1, 1, 1)] }));
});
