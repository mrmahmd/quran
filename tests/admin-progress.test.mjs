import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTeacherProgress } from '../dist/assets/admin-progress-model.mjs';

test('week five completion requires evaluation, manual champion, and at least one nomination', () => {
  const teachers = [{username:'a'}, {username:'b'}, {username:'c'}];
  const result = summarizeTeacherProgress(teachers,
    [{teacher_username:'a',week_start:'2026-09-27',status:'submitted'}, {teacher_username:'b',week_start:'2026-09-27',status:'submitted'}, {teacher_username:'c',week_start:'2026-09-20',status:'submitted'}],
    [{teacher_username:'a',student_name:'طالب أول'}, {teacher_username:'b',student_name:null}],
    [{teacher_username:'a',student_id:'s1',nominated:true}, {teacher_username:'b',student_id:'s2',nominated:true}], '2026-09-27', 5);
  assert.deepEqual(result.completed, {evaluation:2,champion:1,khairkom:2,weekly:1});
  assert.equal(result.percent.weekly,33);
  assert.equal(result.rows[0].completionPercent,100);
  assert.equal(result.rows[1].weeklyDone,2);
});

test('reviewed nominations without a student do not count, and later weeks require only two tasks', () => {
  const teachers = [{username:'a'}], reviews = [{teacher_username:'a',week_start:'2026-10-04',status:'submitted'}];
  const champions = [{teacher_username:'a',student_name:'طالب أول'}];
  const fifth = summarizeTeacherProgress(teachers, [{...reviews[0],week_start:'2026-09-27'}], champions, [], '2026-09-27', 5);
  assert.equal(fifth.rows[0].completionPercent,67);
  assert.equal(fifth.completed.weekly,0);
  const sixth = summarizeTeacherProgress(teachers, reviews, champions, [], '2026-10-04', 6);
  assert.equal(sixth.rows[0].completionPercent,100);
  assert.equal(sixth.completed.weekly,1);
  assert.equal(sixth.khairkomRequired,false);
});
