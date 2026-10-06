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

import { filterNominations, nominationFilterLabel } from '../dist/assets/khairkom-model.mjs';
test('nomination filters intersect teacher and class and match all or any selected parts',()=>{
 const data={students:[{id:'a',full_name:'أ',source_class:'1/A'},{id:'b',full_name:'ب',source_class:'2/A'}],rows:[{student_id:'a',teacher_username:'t1',test_parts:[1,2,3]},{student_id:'b',teacher_username:'t2',test_parts:[2,5]}]};
 const owners=[{username:'t1',full_name:'معلم أول'},{username:'t2',full_name:'معلم ثان'}];
 assert.equal(filterNominations(data,owners,{parts:[1,2],mode:'all'}).length,1);
 assert.equal(filterNominations(data,owners,{parts:[1,5],mode:'any'}).length,2);
 assert.equal(filterNominations(data,owners,{parts:[1,5],mode:'all'}).length,0);
 assert.equal(filterNominations(data,owners,{teacher:'t1',className:'2/A'}).length,0);
 assert.equal(filterNominations(data,owners,{}).length,2);
 assert.match(nominationFilterLabel({teacher:'t1',parts:[1,2],mode:'all'},owners),/معلم أول.*جميع الأجزاء معًا/);
});
