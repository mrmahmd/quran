import test from 'node:test';
import assert from 'node:assert/strict';
import { validTestParts, formatTestParts, normalizeIdentityNumber, validIdentityNumber } from '../dist/assets/khairkom-model.mjs';

test('identity number keeps leading zeroes and accepts Arabic digits with varying lengths', () => {
  assert.equal(normalizeIdentityNumber('٠١٢٣٤٥٦٧٨٩'), '0123456789');
  assert.equal(normalizeIdentityNumber('۱۲۳۴۵۶-۷۸۹۰'), '1234567890');
  assert.equal(validIdentityNumber('٠١٢٣٤٥٦٧٨٩'), true);
  assert.equal(validIdentityNumber('12345678901234'), true);
  for (const invalid of ['', '12345', '123456789012345678901', '1234A56789']) {
    assert.equal(validIdentityNumber(invalid), false);
  }
});

test('nomination parts are unique integers between 1 and 30', () => {
  assert.equal(validTestParts([1, 3, 30]), true);
  for (const invalid of [[], [0], [31], [1, 1], [1.5], ['1'], null]) {
    assert.equal(validTestParts(invalid), false);
  }
});

test('report compresses only consecutive parts and preserves gaps', () => {
  assert.equal(formatTestParts([5, 2, 3, 1]), 'من الجزء ١ إلى ٣، الجزء ٥');
  assert.equal(formatTestParts([30]), 'الجزء ٣٠');
  assert.equal(formatTestParts([]), 'لم تُحدَّد أجزاء الاختبار بعد');
});
