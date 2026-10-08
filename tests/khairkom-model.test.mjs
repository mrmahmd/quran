import test from 'node:test';
import assert from 'node:assert/strict';
import { applyEditedNominee, applySavedNominations, validTestParts, formatTestParts, normalizeIdentityNumber, validIdentityNumber } from '../dist/assets/khairkom-model.mjs';

test('acknowledged save replaces only the teacher batch, preserves external nominees, and advances version',()=>{
  const data={sets:[{id:'old',teacher_username:'a',version:1},{id:'external',teacher_username:'a',version:1},{id:'other',teacher_username:'b',version:1}],rows:[{set_id:'old',student_id:'old',teacher_username:'a'},{set_id:'external',student_id:'manual',teacher_username:'a',external:true},{set_id:'other',student_id:'other',teacher_username:'b'}],students:[]};
  const chosen=[{student_id:'new',test_parts:[1,3],identity_number:'0000123456'}];
  const saved={id:'old',teacher_username:'a',term_id:'term',version:2};
  const next=applySavedNominations(data,saved,'a','term',chosen);
  assert.deepEqual(next.rows.map(r=>r.student_id),['manual','other','new']);
  assert.equal(next.sets.find(s=>s.id==='old').version,2);
  assert.equal(next.sets.find(s=>s.id==='external').version,1);
  assert.equal(next.rows.at(-1).identity_number,'0000123456');
  next.rows.at(-1).test_parts.push(4);assert.deepEqual(chosen[0].test_parts,[1,3]);
  assert.equal(data.sets[0].version,1);
});

test('missing or mismatched save acknowledgment cannot produce a success state',()=>{
  const data={sets:[],rows:[],students:[]};
  for(const saved of [null,{id:'s',teacher_username:'other',term_id:'term',version:1},{id:'s',teacher_username:'a',term_id:'wrong',version:1}])assert.throws(()=>applySavedNominations(data,saved,'a','term',[]),/تأكيد/);
  assert.deepEqual(data,{sets:[],rows:[],students:[]});
});

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

test('confirmed nominee correction updates its report row only, even without a network refresh',()=>{
 const data={sets:[{id:'set',version:3},{id:'other',version:8}],rows:[{set_id:'set',student_id:'one',identity_number:'001234',test_parts:[1]},{set_id:'other',student_id:'two',test_parts:[30]}],students:[{id:'one',full_name:'Original'},{id:'two',full_name:'Other'}]};
 const args={p_set:'set',p_student:'one',p_version:3,p_name:'Corrected',p_identity:'0000001',p_parts:[2,30]};
 const next=applyEditedNominee(data,{saved:true,version:4},args);
 assert.equal(next.students[0].full_name,'Corrected');assert.equal(next.rows[0].identity_number,'0000001');assert.deepEqual(next.rows[0].test_parts,[2,30]);assert.equal(next.sets[0].version,4);
 assert.equal(next.rows[1],data.rows[1]);assert.equal(next.students[1],data.students[1]);assert.equal(next.sets[1],data.sets[1]);assert.equal(data.students[0].full_name,'Original');
 assert.throws(()=>applyEditedNominee(data,{saved:true,version:3},args),/تأكيد/);
 assert.throws(()=>applyEditedNominee(data,null,args),/تأكيد/);
});
