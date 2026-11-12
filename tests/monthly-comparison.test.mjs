import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyComparison } from '../dist/assets/monthly-comparison-model.mjs';
import { monthlyRangeText } from '../dist/assets/monthly-model.mjs';

const range = (from_surah, from_ayah, to_surah, to_ayah) => {
  const range = { from_surah, from_ayah, to_surah, to_ayah };
  return { none: false, text: monthlyRangeText(range), range };
};
const none = { none: true, text: '' };
const entry = (memorization, revision) => ({ student_id: '1', memorization, revision });
const roster = [{ id: '1', full_name: 'طالب', active: true }];
const compare = (first, second) => buildMonthlyComparison(roster, [first], [second])[0];

test('counts inclusive ayat in each kind and compares against the first month', () => {
  const row = compare(entry(range(2, 1, 2, 40), range(2, 5, 2, 8)),
    entry(range(2, 1, 2, 50), range(2, 5, 2, 7)));
  assert.deepEqual([row.memorization.first.count, row.memorization.second.count, row.memorization.percent], [40, 50, 25]);
  assert.deepEqual([row.revision.change, row.revision.percent, row.revision.state], [-1, -25, 'down']);
});

test('counts cross-surah ranges in either order and includes both endpoints', () => {
  const row = compare(entry(range(112, 4, 114, 2)), entry(range(114, 6, 112, 2)));
  assert.equal(row.memorization.first.count, 8);
  assert.equal(row.memorization.second.count, 8);
  assert.equal(row.memorization.percent, 0);
});

test('separates zero, new records, absent students and legacy text', () => {
  const row = compare(entry(none, { ...none, absent: true }), entry(range(1, 1, 1, 7), none));
  assert.deepEqual([row.memorization.state, row.memorization.change, row.memorization.percent], ['new', 7, null]);
  assert.deepEqual([row.revision.first.label, row.revision.second.count, row.revision.state], ['غائب', 0, 'unavailable']);
  const legacy = compare(entry(none, { none: false, text: 'سورة الملك' }), entry(none, range(67, 1, 67, 30)));
  assert.equal(legacy.memorization.percent, 0);
  assert.deepEqual(legacy.revision.first, { label: 'سورة الملك', count: null, legacy: true });
  const mismatch = compare(entry({ ...range(1, 1, 1, 7), text: 'مقدار قديم' }), entry(none));
  assert.deepEqual(mismatch.memorization.first, { label: 'مقدار قديم', count: null, legacy: true });
});

test('shows historical students with entries and leaves incomplete or missing amounts unscored', () => {
  const students = [...roster, { id: '2', full_name: 'اسم منقول' }, { id: '3', full_name: 'طالب مؤرشف بلا تقرير' }];
  const rows = buildMonthlyComparison(students, [
    entry(range(1, 1, 1, 8)),
    { student_id: '2', memorization: range(1, 1, 1, 7) },
  ], []);
  const current = rows.find(row => row.id === '1');
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id === '2').name, 'اسم منقول');
  assert.equal(current.memorization.first.label, 'مقدار غير مكتمل');
  assert.equal(current.memorization.second.label, 'غير مسجّل');
  assert.equal(current.memorization.percent, null);
});
