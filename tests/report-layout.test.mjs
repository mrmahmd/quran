import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyReport, buildKhairkomReport, buildChampionsReport, buildTeacherProgressReport } from '../dist/assets/report-layout.mjs';
import { summarizeTeacherProgress } from '../dist/assets/admin-progress-model.mjs';

const term = {name:'الفصل الأول'};
const teachers = [{username:'a',full_name:'المعلم الأول',class_name:'1/A'}, {username:'b',full_name:'المعلم الثاني',class_name:'2/B'}];
const overview = {students:[{id:'s1',teacher_username:'a',full_name:'أحمد',source_class:'1/A',active:true},{id:'s2',teacher_username:'a',full_name:'علي',active:true},{id:'s3',teacher_username:'b',full_name:'يوسف',active:true}],reviews:[{id:'r1',teacher_username:'a',week_start:'2026-09-27',status:'submitted'},{id:'r2',teacher_username:'b',week_start:'2026-09-27',status:'draft'}],evaluations:[{review_id:'r1',student_id:'s1',total:0,memorization:0,revision:0,improvement:0,commitment:0},{review_id:'r1',student_id:'s2',total:9,memorization:3,revision:2,improvement:2,commitment:2}]};
const time = {term,week:'2026-09-27',weekEnd:'2026-10-01',weekNumber:5};

test('manually added nominee is displayed normally without an external-student label',()=>{
  const html=buildKhairkomReport({term,teachers,data:{students:[{id:'manual',full_name:'اسم جديد <مراجعة>',teacher_username:'a',source_class:'—',external:true}],rows:[{student_id:'manual',teacher_username:'a',identity_number:'000123456',test_parts:[5,6],external:true}]}});
  assert.match(html,/اسم جديد &lt;مراجعة&gt;/);
  assert.match(html,/000123456/);
  assert.match(html,/من الجزء ٥ إلى ٦/);
  assert.doesNotMatch(html,/من خارج الحلقات/);
});

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

test('landscape teacher report shows every teacher, three task cells, and week-five-only nominations', () => {
  const rows = [{...teachers[0],full_name:'<أحمد>'}, teachers[1]];
  const weekFive = summarizeTeacherProgress(rows,
    [{teacher_username:'a',week_start:time.week,status:'submitted'}],
    [{teacher_username:'a',student_name:'طالب'}],
    [{teacher_username:'a',student_id:'s1',nominated:true}], time.week, 5);
  const html = buildTeacherProgressReport({...time,progress:weekFive});
  assert.equal((html.match(/class="progress-report-teacher /g) || []).length,2);
  assert.equal((html.match(/class="progress-report-task /g) || []).length,6);
  assert.match(html,/&lt;أحمد&gt;/);
  assert.doesNotMatch(html,/<أحمد>/);
  assert.match(html,/100%/);
  assert.match(html,/لم ينجز/);
  const weekSix = summarizeTeacherProgress(rows,[],[],[],time.week,6);
  const later = buildTeacherProgressReport({...time,weekNumber:6,progress:weekSix});
  assert.equal((later.match(/غير مطلوب/g) || []).length,2);
});

test('champions register pairs each teacher with the manual choice and includes pending teachers', () => {
  const html = buildChampionsReport({...time,champions:[{teacher_name:'المعلم الأول',class_name:'1/A',student_name:'<أحمد>'},{teacher_name:'المعلم الثاني',class_name:'2/B',student_name:null}]});
  const rows = html.match(/<tr class="champion-[\s\S]*?<\/tr>/g);
  assert.equal(rows.length, 2);
  assert.match(rows[0], /المعلم الأول[\s\S]*&lt;أحمد&gt;[\s\S]*1\/A/);
  assert.match(rows[1], /المعلم الثاني[\s\S]*لم يُختر بعد[\s\S]*2\/B/);
  assert.doesNotMatch(html, /<أحمد>/);
  assert.match(html, /اختيار يدوي/);
});

test('filtered nomination PDF contains only supplied results and the filter summary',()=>{
 const html=buildKhairkomReport({term,teachers,filterLabel:'جميع الأجزاء معًا: الجزء ١',data:{students:[{id:'s1',full_name:'الطالب الظاهر'},{id:'s2',full_name:'طالب مستبعد'}],rows:[{teacher_username:'a',student_id:'s1',test_parts:[1],identity_number:'000000'}]}});
 assert.match(html,/الطالب الظاهر/);assert.doesNotMatch(html,/طالب مستبعد/);assert.match(html,/جميع الأجزاء معًا/);
});
