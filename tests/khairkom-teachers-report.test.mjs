import test from 'node:test';
import assert from 'node:assert/strict';
import {khairkomAchievement,khairkomTeacherPage} from '../dist/assets/khairkom-teachers-report.mjs';

test('achievement uses saved reviews, includes zero-nominee reviews and separates pending teachers',()=>{
  const report=khairkomAchievement({teachers:[{username:'a',full_name:'أحمد',class_name:'4/B'},{username:'b',full_name:'بدر'},{username:'c',full_name:'خالد'},{username:'d',full_name:'داني'}],
    sets:[{teacher_username:'a'},{teacher_username:'a'},{teacher_username:'b'}],rows:[{teacher_username:'a',student_id:'s1'},{teacher_username:'a',student_id:'s1'},{teacher_username:'a',student_id:'s2'},{teacher_username:'c',student_id:'s3',nominated:false}]});
  assert.equal(report.total,4);assert.equal(report.percent,50);
  assert.deepEqual(report.done.map(row=>[row.username,row.count]),[['a',2],['b',0]]);
  assert.deepEqual(report.pending.map(row=>row.username),['c','d']);
  assert.equal(report.done[0].className,'4/B');
  assert.equal(khairkomAchievement({}).percent,0);
});

test('achievement pages escape teacher names and distinguish completed-without-nominees and pending',()=>{
  const summary=khairkomAchievement({teachers:[{username:'a',full_name:'معلم <أ>'},{username:'b',full_name:'الثاني'}],sets:[{teacher_username:'a'}]});
  const done=khairkomTeacherPage({rows:summary.done.map(row=>({...row,index:1})),summary,section:'done'});
  assert.match(done,/معلم &lt;أ&gt;/);assert.match(done,/راجع بلا مرشحين/);assert.match(done,/المعلمون الذين أنجزوا/);
  assert.match(khairkomTeacherPage({rows:summary.pending,summary,section:'pending'}),/لم يحفظ المراجعة بعد/);
  assert.doesNotMatch(done,/identity_number|رقم الهوية|الطلاب المرشحون/);
});
