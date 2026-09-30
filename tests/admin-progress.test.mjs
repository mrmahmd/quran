import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeTeacherProgress } from '../dist/assets/admin-progress-model.mjs';

test('weekly completion requires both submitted evaluation and a manually selected champion', () => {
  const teachers = [{username:'a'}, {username:'b'}, {username:'c'}];
  const result = summarizeTeacherProgress(teachers,
    [{teacher_username:'a',week_start:'2026-09-27',status:'submitted'}, {teacher_username:'b',week_start:'2026-09-27',status:'submitted'}, {teacher_username:'c',week_start:'2026-09-20',status:'submitted'}],
    [{teacher_username:'a',student_name:'طالب أول'}, {teacher_username:'b',student_name:null}],
    [{teacher_username:'b'}], '2026-09-27');
  assert.deepEqual(result.completed, {evaluation:2,champion:1,khairkom:1,weekly:1});
  assert.equal(result.percent.weekly,33);
  assert.equal(result.rows[1].weeklyDone,1);
});

test('zero nominations still count as reviewed when a saved set exists', () => {
  const result = summarizeTeacherProgress([{username:'a'}], [], [], [{teacher_username:'a'}], '2026-09-27');
  assert.equal(result.completed.khairkom,1);
  assert.equal(result.percent.khairkom,100);
  assert.equal(result.completed.weekly,0);
});
