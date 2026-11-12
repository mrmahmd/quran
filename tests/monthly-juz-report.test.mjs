import assert from 'node:assert/strict';
import test from 'node:test';
import { buildJuzReport } from '../dist/assets/monthly-juz-report.mjs';
import { completedJuz, recordedAyahRanges } from '../dist/assets/quran-juz.mjs';
import { monthlyRangeText } from '../dist/assets/monthly-model.mjs';

const amount = (from_surah, from_ayah, to_surah, to_ayah) => {
  const range = { from_surah, from_ayah, to_surah, to_ayah };
  return { none: false, range, text: monthlyRangeText(range) };
};
const entry = (student_id, memorization, teacher_username) => ({
  student_id, memorization, teacher_username, note: '', revision: { none: true, text: '', ...(memorization.absent ? { absent: true } : {}) },
});

test('only complete numbered juz are counted, including coverage combined across records', () => {
  const first = recordedAyahRanges(amount(67, 1, 77, 50));
  const second = recordedAyahRanges(amount(78, 1, 114, 6));
  assert.deepEqual(completedJuz(first), [29]);
  assert.deepEqual(completedJuz([...first, ...second, ...first]), [29, 30]);
  assert.deepEqual(completedJuz(recordedAyahRanges(amount(78, 2, 114, 6))), []);
  assert.deepEqual(completedJuz(recordedAyahRanges(amount(114, 1, 78, 40))), [30]);
  assert.deepEqual(completedJuz(recordedAyahRanges(amount(114, 2, 78, 40))), []);
  assert.deepEqual(completedJuz(recordedAyahRanges(amount(2, 142, 2, 252))), [2]);
  assert.deepEqual(completedJuz(recordedAyahRanges(amount(1, 1, 114, 6))), Array.from({ length: 30 }, (_, i) => i + 1));
});

test('the school counts a transferred student once and combines contiguous memorization across months', () => {
  const original = '00000000-0000-4000-8000-000000000001';
  const transfer = '00000000-0000-4000-8000-000000000002';
  const students = [
    { id: original, full_name: 'طالب منقول', teacher_username: 'old', active: false },
    { id: transfer, full_name: 'طالب منقول', teacher_username: 'new', student_code: `TRANSFER-${original}`, active: true },
    { id: 'same-name', full_name: 'طالب منقول', teacher_username: 'old', active: true },
  ];
  const [first, second, combined] = buildJuzReport(students,
    [entry(original, amount(78, 1, 90, 20), 'old')], [entry(transfer, amount(91, 1, 114, 6), 'new')]);
  assert.equal(first.total, 2);
  assert.equal(second.total, 2);
  assert.equal(combined.total, 2);
  assert.equal(first.buckets.zero.length, 1);
  assert.equal(second.buckets.zero.length, 1);
  assert.equal(combined.measurable, 1);
  assert.deepEqual(combined.buckets.one[0].juz, [30]);
  assert.deepEqual(combined.buckets.one[0].teachers, ['old', 'new']);
  assert.equal(combined.buckets.missing.length, 1);
});

test('text, no amount, and absence contribute different evidence to the report', () => {
  const students = ['text', 'absent', 'none', 'missing'].map(id => ({ id, full_name: id, active: true }));
  const none = { none: true, text: '' };
  const first = [entry('text', amount(78, 1, 114, 6)), entry('absent', { ...none, absent: true }), entry('none', none)];
  const second = [entry('text', { none: false, text: 'الملك - المرسلات' }), entry('absent', none)];
  const [, month, combined] = buildJuzReport(students, first, second);
  assert.equal(month.measurable, 1);
  assert.equal(month.buckets.missing.length, 2);
  assert.equal(combined.measurable, 1);
  assert.equal(combined.buckets.one.length, 0);
  assert.deepEqual(combined.buckets.unresolved.find(row => row.name === 'text').juz, [30]);
  assert.equal(combined.buckets.zero[0].name, 'absent');
});

test('the school counts a saved memorization range even when review is incomplete', () => {
  const students = [{ id: '1', full_name: 'طالب', active: true }];
  const saved = entry('1', amount(78, 1, 114, 6));
  const [first, second, combined] = buildJuzReport(students,
    [{ ...saved, revision: { none: false, text: '' }, is_complete: false }], [saved]);
  assert.equal(first.measurable, 1);
  assert.deepEqual(first.buckets.one[0].juz, [30]);
  assert.deepEqual(second.buckets.one[0].juz, [30]);
  assert.equal(combined.measurable, 1);
  assert.deepEqual(combined.buckets.one[0].juz, [30]);
});
