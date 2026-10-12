import test from 'node:test';
import assert from 'node:assert/strict';
import {summarizeMonthlyTeachers} from '../dist/assets/monthly-progress-model.mjs';
import {buildMonthlyReport} from '../dist/assets/report-layout.mjs';
import {emptyMonthly,setMonthlyAbsent} from '../dist/assets/monthly-model.mjs';
test('monthly completion uses current roster, saved rows and absence rather than stale complete status',()=>{
 const teachers=['done','draft','missing','empty'].map(username=>({username,full_name:username,active:true}));
 const data={students:['done','draft','missing'].map(t=>({id:t,teacher_username:t,full_name:t,active:true})),reports:[{id:'r1',teacher_username:'done',status:'draft'},{id:'r2',teacher_username:'draft',status:'complete'}],entries:[{...setMonthlyAbsent(emptyMonthly('done'),true),teacher_username:'done',report_id:'r1'}]};
 let p=summarizeMonthlyTeachers(teachers,data);
 assert.equal(p.total,3);assert.equal(p.completed,1);assert.equal(p.percent,33);assert.equal(p.pending,1);assert.equal(p.empty,1);assert.equal(p.rows[1].status,'draft');
 data.students.push({id:'new',full_name:'new',teacher_username:'done',active:true});p=summarizeMonthlyTeachers(teachers,data);assert.equal(p.completed,0);assert.equal(p.rows[0].percent,50);
 const html=buildMonthlyReport({term:{name:'term'},label:'الشهر الأول',teachers,data});assert.match(html,/الشهر الأول/);assert.match(html,/التقارير الشهرية/);assert.match(html,/alandalus-logo/);
 const detail=buildMonthlyReport({term:{name:'term'},label:'الشهر الأول',teachers,data,teacherUsername:'done'});assert.match(detail,/غائب — لم يحضر/);assert.match(detail,/new/);assert.doesNotMatch(detail,/>missing</);
});

