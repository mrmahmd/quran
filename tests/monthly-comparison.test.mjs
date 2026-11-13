import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMonthlyComparison, summarizeMonthlyComparison } from '../dist/assets/monthly-comparison-model.mjs';
import { monthlyRangeText } from '../dist/assets/monthly-model.mjs';

const range = (from_surah, from_ayah, to_surah, to_ayah) => {
  const range = { from_surah, from_ayah, to_surah, to_ayah };
  return { none: false, text: monthlyRangeText(range), range };
};
const none = { none: true, text: '' };
const entry = (memorization, revision) => ({ student_id: '1', memorization, revision, note: '' });
const roster = [{ id: '1', full_name: 'طالب', active: true }];
const compare = (first, second) => buildMonthlyComparison(roster, [first], [second])[0];

test('counts inclusive ayat in each kind and compares against the first month', () => {
  const row = compare(entry(range(2, 1, 2, 40), range(2, 5, 2, 8)),
    entry(range(2, 1, 2, 50), range(2, 5, 2, 7)));
  assert.deepEqual([row.memorization.first.count, row.memorization.second.count, row.memorization.percent], [40, 50, 25]);
  assert.deepEqual([row.revision.change, row.revision.percent, row.revision.state], [-1, -25, 'down']);
});

test('counts cross-surah ranges in either order and includes both endpoints', () => {
  const row = compare(entry(range(112, 4, 114, 2), none), entry(range(114, 6, 112, 2), none));
  assert.equal(row.memorization.first.count, 8);
  assert.equal(row.memorization.second.count, 8);
  assert.equal(row.memorization.percent, 0);
});

test('counts descending monthly ranges across adjacent surahs and across a complete middle surah', () => {
  const row = compare(entry(range(39, 1, 38, 42), range(39, 70, 37, 10)),
    entry(range(38, 43, 37, 37), range(39, 70, 37, 11)));
  assert.deepEqual([row.memorization.first.count, row.memorization.second.count, row.memorization.change], [117, 83, -34]);
  assert.deepEqual([row.revision.first.count, row.revision.second.count, row.revision.change], [104, 105, 1]);
});

test('separates zero, new records, absent students and legacy text', () => {
  const row = compare(entry(none, none), entry(range(1, 1, 1, 7), none));
  assert.deepEqual([row.memorization.state, row.memorization.change, row.memorization.percent], ['new', 7, null]);
  const absent = { ...none, absent: true };
  const attended = compare(entry(absent, absent), entry(range(1, 1, 1, 7), none));
  assert.deepEqual([attended.revision.first.label, attended.revision.second.count, attended.revision.state], ['غائب', 0, 'unavailable']);
  const legacy = compare(entry(none, { none: false, text: 'سورة الملك' }), entry(none, range(67, 1, 67, 30)));
  assert.equal(legacy.memorization.percent, 0);
  assert.deepEqual(legacy.revision.first, { label: 'سورة الملك', count: null, legacy: true });
  const mismatch = compare(entry({ ...range(1, 1, 1, 7), text: 'مقدار قديم' }, none), entry(none, none));
  assert.deepEqual(mismatch.memorization.first, { label: 'مقدار قديم', count: null, legacy: true });
});

test('shows historical students with entries and leaves incomplete or missing amounts unscored', () => {
  const students = [...roster, { id: '2', full_name: 'اسم منقول' }, { id: '3', full_name: 'طالب مؤرشف بلا تقرير' }];
  const rows = buildMonthlyComparison(students, [
    entry(range(1, 1, 1, 8), none),
    { ...entry(range(1, 1, 1, 7), none), student_id: '2' },
  ], [entry(none, none)]);
  const current = rows.find(row => row.id === '1');
  assert.equal(rows.length, 2);
  assert.equal(rows.find(row => row.id === '2').name, 'اسم منقول');
  assert.equal(current.memorization.first.label, 'مقدار غير مكتمل');
  assert.equal(rows.find(row => row.id === '2').memorization.second.label, 'غير مسجّل');
  assert.equal(current.memorization.percent, null);
});

test('teacher achievement counts completed text entries and averages the monthly rates equally', () => {
  const students = [...roster, { id: '2', active: false }];
  const text = { none: false, text: 'البروج حتى النازعات' };
  const first = [entry(range(2, 1, 2, 20), none), { ...entry(none, none), student_id: '2', is_complete: false }];
  const second = [entry(text, none)];
  const rows = buildMonthlyComparison(students, first, second);
  const result = summarizeMonthlyComparison(students, first, second, rows);
  assert.deepEqual(result.months, [{ total: 2, completed: 1, absent: 0, rate: 0.5 }, { total: 1, completed: 1, absent: 0, rate: 1 }]);
  assert.equal(result.average, 0.75);
  assert.deepEqual(result.changes.memorization, { compared: 0, total: 1, first: 0, second: 0, difference: 0, rate: null });
});

test('quantity comparison sums ayat for the same students and handles a zero baseline', () => {
  const students = [...roster, { id: '2', active: true }, { id: '3', active: true }];
  const first = [entry(range(2, 1, 2, 10), none), { ...entry(range(2, 1, 2, 30), none), student_id: '2' }];
  const second = [entry(range(2, 1, 2, 20), range(2, 1, 2, 10)), { ...entry(range(2, 1, 2, 20), none), student_id: '2' },
    { ...entry(range(2, 1, 2, 40), none), student_id: '3' }];
  const rows = buildMonthlyComparison(students, first, second);
  const result = summarizeMonthlyComparison(students, first, second, rows);
  assert.deepEqual(result.changes.memorization, { compared: 2, total: 2, first: 40, second: 40, difference: 0, rate: 0 });
  assert.deepEqual(result.changes.revision, { compared: 2, total: 2, first: 0, second: 10, difference: 10, rate: null });
  const missing = summarizeMonthlyComparison(students, first, [], buildMonthlyComparison(students, first, []));
  assert.equal(missing.months[1].rate, 0);
  assert.equal(summarizeMonthlyComparison([], [], [], []).average, null);
});

test('saved amounts contribute independently to monthly totals and matching pairs', () => {
  const students = ['1', 'draft', 'absent', 'never-saved', 'revision-only'].map(id => ({ id, active: true }));
  const absent = { ...none, absent: true };
  const incomplete = { none: false, text: '', range: { from_surah: 2, from_ayah: 1 } };
  const first = [entry(range(2, 1, 2, 10), none),
    { ...entry(range(2, 1, 2, 90), incomplete), student_id: 'draft', is_complete: false },
    { ...entry(incomplete, range(2, 1, 2, 8)), student_id: 'revision-only', is_complete: false },
    { ...entry(absent, absent), student_id: 'absent' }];
  const second = [entry(range(2, 1, 2, 20), none),
    { ...entry(range(2, 1, 2, 30), none), student_id: 'draft' },
    { ...entry(incomplete, range(2, 1, 2, 12)), student_id: 'revision-only', is_complete: false },
    { ...entry(incomplete, incomplete), student_id: 'never-saved', is_complete: false },
    { ...entry(absent, absent), student_id: 'absent' }];
  const rows = buildMonthlyComparison(students, first, second);
  const { changes, monthlyTotals, months } = summarizeMonthlyComparison(students, first, second, rows);
  assert.deepEqual(months, [
    { total: 4, completed: 1, absent: 1, rate: 0.25 },
    { total: 4, completed: 2, absent: 1, rate: 0.5 },
  ]);
  assert.deepEqual(rows.map(row => row.id), ['1', 'draft', 'revision-only']);
  assert.equal(rows[1].revision.first.count, null);
  assert.deepEqual(monthlyTotals.memorization, [{ ayat: 100, students: 2 }, { ayat: 50, students: 2 }]);
  assert.deepEqual(changes.memorization, { compared: 2, total: 2, first: 100, second: 50, difference: -50, rate: -0.5 });
  assert.deepEqual(monthlyTotals.revision, [{ ayat: 8, students: 2 }, { ayat: 12, students: 3 }]);
  assert.deepEqual(changes.revision, { compared: 2, total: 2, first: 8, second: 12, difference: 4, rate: 0.5 });
});
