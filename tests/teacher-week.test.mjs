import test from 'node:test';
import assert from 'node:assert/strict';
import {teacherWeeks} from '../dist/assets/teacher-week-model.mjs';
import {emptyScores} from '../dist/assets/evaluation-model.mjs';
const term={starts_on:'2026-09-27',ends_on:'2026-10-22',first_week_number:4};
const students=[{id:'a',full_name:'أحمد',active:true},{id:'b',full_name:'عمر',active:true}];
const zero=id=>({...emptyScores(id),memorization:0,revision:0,improvement:0,commitment:0,review_id:'r'});
const review={id:'r',teacher_username:'teacher',week_start:'2026-10-04',status:'submitted',knight_student_id:'b'};
const summary=(r=review,rows=[zero('a'),zero('b')],ss=students,nominations=[])=>teacherWeeks(term,{students:ss,reviews:[r],evaluations:rows},nominations,'teacher','2026-10-17');
test('weekly completion requires saved submitted valid evaluations and a manually saved champion',()=>{
  const fifth=summary()[1];assert.equal(fifth.complete,true);assert.equal(fifth.rated,2);assert.equal(fifth.championName,'عمر');assert.equal(fifth.percent,100);
  assert.equal(summary({...review,knight_student_id:null})[1].percent,50);
  assert.equal(summary({...review,status:'draft'})[1].complete,false);
  assert.equal(summary(review,[zero('a'),{...zero('b'),revision:null}])[1].evaluation,false);
  assert.equal(summary(review,[])[1].evaluation,false);
});
test('saved counts exclude unrelated reviews; draft points do not imply submission',()=>{
  const fifth=summary({...review,status:'draft'},[zero('a'),{...zero('b'),review_id:'other'}])[1];
  assert.equal(fifth.rated,1);assert.equal(fifth.remaining,1);assert.equal(fifth.evaluation,false);
});
test('week four alone requires at least one saved nomination',()=>{
  const fourth={...review,week_start:'2026-09-27'};
  assert.equal(summary(fourth)[0].percent,67);
  assert.equal(summary(fourth,undefined,undefined,[{teacher_username:'other',nominated:true}])[0].complete,false);
  assert.equal(summary(fourth,undefined,undefined,[{teacher_username:'teacher',nominated:false}])[0].complete,false);
  assert.equal(summary(fourth,undefined,undefined,[{teacher_username:'teacher',nominated:true}])[0].complete,true);
  assert.equal(summary()[1].khairkomRequired,false);
});
test('submitted history retains archived students and excludes later additions; reopened week uses active roster',()=>{
  const roster=[...students.map(s=>({...s,active:false})),{id:'new',active:true}];
  assert.equal(summary(review,undefined,roster)[1].complete,true);
  assert.equal(summary({...review,status:'draft'},undefined,roster)[1].total,1);
  assert.equal(summary({...review,status:'draft'},undefined,roster)[1].remaining,1);
});
test('week numbers and future state use supplied Riyadh date without moving saved dates',()=>{
  const weeks=summary();assert.deepEqual(weeks.map(w=>w.number),[4,5,6,7]);
  assert.equal(weeks[2].future,false);assert.equal(weeks[3].future,true);
});
test('legacy saved weeks remain available without assigning them a new week number',()=>{
  const legacy=summary({...review,week_start:'2026-09-13'})[0];
  assert.equal(legacy.start,'2026-09-13');assert.equal(legacy.number,null);assert.equal(legacy.label,'سجل سابق');assert.equal(legacy.complete,true);
});
