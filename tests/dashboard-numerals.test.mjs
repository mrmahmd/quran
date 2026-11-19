import test from 'node:test';
import assert from 'node:assert/strict';
import { toArabicDigits } from '../dist/assets/dashboard-numerals.mjs';

test('dashboard numbers become Arabic-Indic digits while identifiers keep theirs', () => {
  assert.equal(toArabicDigits('الأسبوع 11 · 4 من 6 طلاب'), 'الأسبوع ١١ · ٤ من ٦ طلاب');
  assert.equal(toArabicDigits('50%'), '٥٠٪');
  assert.equal(toArabicDigits('متوسط 8.5 من 12'), 'متوسط ٨٫٥ من ١٢');
  assert.equal(toArabicDigits('حلقتي 5/A'), 'حلقتي 5/A');
  assert.equal(toArabicDigits('اسم المستخدم quran09'), 'اسم المستخدم quran09');
  assert.equal(toArabicDigits('mr.mahmd@as.edu.sa'), 'mr.mahmd@as.edu.sa');
  assert.equal(toArabicDigits('2026-11-15'), '2026-11-15');
  assert.equal(toArabicDigits('(12)'), '(١٢)');
  assert.equal(toArabicDigits('١٢ آية'), '١٢ آية');
});
