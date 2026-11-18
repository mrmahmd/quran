import {mergeMonthlyRoster,monthlyProgress} from './monthly-model.mjs?v=monthly-range1';
export function summarizeMonthlyTeachers(teachers, data) {
 const rows=teachers.filter(t=>t.active!==false).map(teacher=>{
  const report=data.reports.find(r=>r.teacher_username===teacher.username);
  const entries=data.entries.filter(e=>e.report_id===report?.id&&e.teacher_username===teacher.username);
  const students=data.students.filter(s=>s.teacher_username===teacher.username);
  const requireRange=(data.rangeRules||[]).some(rule=>rule.teacher_username===teacher.username); // rules for the month shown
  const progress=monthlyProgress(mergeMonthlyRoster(students,entries).values(),{requireRange});
  const status=!progress.total?'empty':!report?'missing':progress.complete?'complete':'draft';
  return {...teacher,...progress,status,updated_at:report?.updated_at||null};
 });
 const assigned=rows.filter(r=>r.status!=='empty'),completed=assigned.filter(r=>r.status==='complete').length;
 return {rows,total:assigned.length,completed,remaining:assigned.length-completed,
  partial:assigned.filter(r=>r.status==='draft').length,
  pending:assigned.filter(r=>r.status==='missing').length,empty:rows.length-assigned.length,
  percent:assigned.length?Math.floor(completed*100/assigned.length):0};
}
