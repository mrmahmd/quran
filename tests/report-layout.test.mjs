import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, buildKhairkomReport, buildChampionsReport } from '../dist/assets/report-layout.mjs';

const term = {name:'الفصل الأول'};
const teachers = [{username:'a',full_name:'المعلم الأول',class_name:'1/A'}, {username:'b',full_name:'المعلم الثاني',class_name:'2/B'}];
const overview = {students:[{id:'s1',teacher_username:'a',full_name:'أحمد',source_class:'1/A',active:true},{id:'s2',teacher_username:'a',full_name:'علي',active:true},{id:'s3',teacher_username:'b',full_name:'يوسف',active:true}],reviews:[{id:'r1',teacher_username:'a',week_start:'2026-09-27',status:'submitted'},{id:'r2',teacher_username:'b',week_start:'2026-09-27',status:'draft'}],evaluations:[{review_id:'r1',student_id:'s1',total:0,memorization:0,revision:0,improvement:0,commitment:0},{review_id:'r1',student_id:'s2',total:9,memorization:3,revision:2,improvement:2,commitment:2}]};
const time = {term,week:'2026-09-27',weekEnd:'2026-10-01',weekNumber:5};

test('combined weekly report groups teachers and keeps zero distinct from missing score', () => {
  const html = buildWeeklyReport({...time,teachers,overview});
  assert.match(html, /المعلم الأول/);
  assert.match(html, /المعلم الثاني/);
  assert.match(html, /0 \/ 12/);
  assert.match(html, /بانتظار التقييم/);
  assert.match(html, /طلاب تم تقييمهم/);
  assert.match(html, /<thead>/);
});

test('per-teacher weekly report includes only that teacher and escapes student data', () => {
  const html = buildWeeklyReport({...time,teachers,teacherUsername:'a',overview:{...overview,students:[...overview.students,{id:'x',teacher_username:'a',full_name:'<script>alert(1)</script>',active:true}]}});
  assert.match(html, /المعلم الأول/);
  assert.doesNotMatch(html, /المعلم الثاني/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('Khairkom report contains identity and selected parts while champions omits identities', () => {
  const data={students:[{id:'s1',full_name:'أحمد',source_class:'1/A'}],rows:[{student_id:'s1',teacher_username:'a',identity_number:'000123456',test_parts:[1,2,3]}]};
  const nominations=buildKhairkomReport({term,teachers,data});
  assert.match(nominations, /000123456/);
  assert.match(nominations, /من الجزء ١ إلى ٣/);
  const champions=buildChampionsReport({...time,champions:[{teacher_name:'المعلم الأول',class_name:'1/A',student_name:'أحمد',note:'اجتهاد'}]});
  assert.match(champions, /أحمد/);
  assert.doesNotMatch(champions, /000123456|رقم الهوية/);
});
