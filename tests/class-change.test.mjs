import test from 'node:test';
import assert from 'node:assert/strict';
import { classChangeFor, weekBeforeChange, monthBeforeChange, monthsBeforeChange, classChangeBanner, classChangeSchoolNote } from '../dist/assets/class-change.mjs';

const saeed = { teacher_username: 'quran03', changed_on: '2026-11-20', class_before: '7B', class_after: '6B',
  students_now_with: 'quran09', students_now_with_name: 'جمال عبد الرحيم', history_of_class_after: 'quran09', history_of_class_after_name: 'جمال عبد الرحيم' };
const jamal = { ...saeed, teacher_username: 'quran09', class_before: '6B', class_after: '7B', students_now_with: 'quran03', students_now_with_name: 'محمد سعيد', history_of_class_after: 'quran03', history_of_class_after_name: 'محمد سعيد' };

test('finds the change of a teacher', () => {
  assert.equal(classChangeFor([saeed, jamal], 'quran09'), jamal);
  assert.equal(classChangeFor([saeed, jamal], 'quran01'), null);
  assert.equal(classChangeFor(null, 'quran03'), null);
});

test('weeks before the change day, whole months before the change month', () => {
  assert.equal(weekBeforeChange(saeed, '2026-11-15'), true);   // Sunday 15 Nov: the week before the swap on Friday 20 Nov
  assert.equal(weekBeforeChange(saeed, '2026-11-29'), false);
  assert.equal(weekBeforeChange(null, '2026-11-15'), false);
  assert.equal(monthBeforeChange(saeed, '2026-10-01'), true);
  assert.equal(monthBeforeChange(saeed, '2026-11-01'), false);  // November's report is written for the new class
  assert.deepEqual(monthsBeforeChange(saeed, ['2026-10-01', '2026-11-01']), ['2026-10-01']);
});

test('administration banner names both teachers and offers the other history', () => {
  const html = classChangeBanner({ change: saeed, teacherName: 'محمد سعيد', admin: true, period: 'month' });
  assert.match(html, /الأستاذ محمد سعيد يدرّس الفصل <bdi>7B<\/bdi>/);
  assert.match(html, /انتقلوا إلى الأستاذ جمال عبد الرحيم/);
  assert.match(html, /data-switch-teacher="quran09"/);
  assert.match(html, /عرض السجل السابق لفصل <bdi>6B<\/bdi>/);
});

test('teacher banner speaks to the teacher, without a switch button', () => {
  const html = classChangeBanner({ change: jamal, teacherName: 'جمال عبد الرحيم', period: 'week' });
  assert.match(html, /لطلاب فصلك السابق <bdi>6B<\/bdi>/);
  assert.match(html, /الأستاذ محمد سعيد/);
  assert.doesNotMatch(html, /data-switch-teacher/);
  assert.equal(classChangeBanner({ change: null }), '');
});

test('comparison uses its own switch attribute; print is a plain box', () => {
  assert.match(classChangeBanner({ change: saeed, admin: true, switchAttr: 'data-mc-switch-teacher', period: 'months' }), /data-mc-switch-teacher="quran09"/);
  const print = classChangeBanner({ change: saeed, admin: true, period: 'months', print: true });
  assert.match(print, /class="cc-print" style=/);
  assert.doesNotMatch(print, /button/);
});

test('names are escaped', () => {
  const html = classChangeBanner({ change: { ...saeed, students_now_with_name: '<script>' }, teacherName: 'a&b', admin: true });
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /a&amp;b/);
});

test('school note lists rings changed after the first shown month', () => {
  const names = new Map([['quran03', { full_name: 'محمد سعيد' }], ['quran09', { full_name: 'جمال عبد الرحيم' }]]);
  const note = classChangeSchoolNote([saeed, jamal], names, ['2026-09-01', '2026-10-01']);
  assert.match(note, /محمد سعيد<\/b>: أرقامه في هذه الفترة لطلاب <bdi>7B<\/bdi>/);
  assert.match(note, /جمال عبد الرحيم/);
  assert.equal(classChangeSchoolNote([saeed], names, ['2026-12-01']), '');
});
