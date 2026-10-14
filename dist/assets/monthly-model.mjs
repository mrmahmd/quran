import {SURAHS} from './quran-surahs.mjs';
export {SURAHS};
export const emptyMonthly = student_id => ({ student_id, memorization: { none: false, text: '', range: {from_surah:null,from_ayah:null,to_surah:null,to_ayah:null} }, revision: { none: false, text: '', range: {from_surah:null,from_ayah:null,to_surah:null,to_ayah:null} }, note: '' });
export function monthlyProblem(row) {
  for (const [key, label] of [['memorization', 'الحفظ'], ['revision', 'المراجعة']]) {
    const value = row?.[key];
    if (typeof value?.none !== 'boolean' || typeof value.text !== 'string' || value.text.length > 1000) return label;
    if (value.none ? value.text !== '' : !value.text.trim()) return label;
    if (!value.none && value.range && !validMonthlyRange(value.range)) return label;
  }
  return typeof row.note !== 'string' || row.note.length > 500 ? 'الملاحظة' : '';
}
export function termMonths(term) {
  if (!term) return [];
  const months=[];let date=new Date(`${term.starts_on.slice(0,7)}-01T00:00:00Z`);
  for(let i=0;i<4;i++){months.push(date.toISOString().slice(0,10));date.setUTCMonth(date.getUTCMonth()+1);}
  return months;
}
export const monthlyLabel = (term, month) => ['الشهر الأول','الشهر الثاني','الشهر الثالث','الشهر الرابع'][termMonths(term).indexOf(month)] || 'تقرير شهري';
export function validMonthlyRange(r) {
 const from=SURAHS.find(s=>s.number===r?.from_surah),to=SURAHS.find(s=>s.number===r?.to_surah);
 return !!from && !!to && Number.isInteger(r.from_ayah)&&r.from_ayah>=1&&r.from_ayah<=from.verses&&Number.isInteger(r.to_ayah)&&r.to_ayah>=1&&r.to_ayah<=to.verses&&(r.from_surah!==r.to_surah||r.from_ayah<=r.to_ayah);
}
export function monthlyRangeText(r) {
 if(!validMonthlyRange(r))return '';
 return `من سورة ${SURAHS[r.from_surah-1].name} آية ${r.from_ayah} إلى سورة ${SURAHS[r.to_surah-1].name} آية ${r.to_ayah}`;
}

export function monthlyProgress(rows) {
 const list=[...rows], total=list.length, completed=list.filter(row=>!monthlyProblem(row)).length;
 return {total,completed,remaining:total-completed,percent:total?Math.floor(completed*100/total):0,complete:total>0&&completed===total};
}

export function applyMonthlyAmounts(rows, studentIds, amounts) {
 const ids=new Set(studentIds), kinds=Object.keys(amounts);
 if(!ids.size || !kinds.length || kinds.some(k=>!['memorization','revision'].includes(k))) throw new Error('اختر الطلاب والمقدار المطلوب تطبيقه.');
 const source=new Map(rows.map(r=>[r.student_id,r]));
 if([...ids].some(id=>!source.has(id))) throw new Error('أحد الطلاب ليس ضمن تقرير الحلقة.');
 for(const kind of kinds){const probe=emptyMonthly('check');probe.memorization={none:true,text:''};probe.revision={none:true,text:''};probe[kind]=amounts[kind];if(monthlyProblem(probe))throw new Error('أكمل السور والآيات الصحيحة للمقدار المحدد.');}
 if(rows.some(row=>ids.has(row.student_id)&&monthlyAbsent(row))) throw new Error('ألغِ الغياب قبل تطبيق مقدار لهذا الطالب.');
 return rows.map(row=>ids.has(row.student_id)?{...row,...structuredClone(amounts)}:row);
}

export function copyMonthlyAmounts(rows, sourceId, studentIds) {
 const source=rows.find(row=>row.student_id===sourceId);
 if(!source || monthlyAbsent(source) || monthlyProblem(source)) throw new Error('أكمل مقدار الحفظ والمراجعة للطالب أولًا، أو اختر «لا يوجد».');
 if(studentIds.includes(sourceId)) throw new Error('اختر طلابًا آخرين غير الطالب المصدر.');
 return applyMonthlyAmounts(rows,studentIds,{memorization:source.memorization,revision:source.revision});
}

export function copyMemorizationToRevision(row) {
 if (monthlyAbsent(row)) throw new Error('الطالب مسجل غائبًا.');
 if (!row) throw new Error('لم يتم العثور على بيانات الطالب.');
 return applyMonthlyAmounts([row],[row.student_id],{revision:row.memorization})[0];
}

// Attendance is stored inside the existing JSON amounts, through the same versioned save.
export const monthlyAbsent = row => row?.memorization?.absent === true && row?.revision?.absent === true;
export function setMonthlyAbsent(row, absent) {
 if (absent === monthlyAbsent(row)) return row;
 const next={...row};
 for(const kind of ['memorization','revision']) next[kind]=absent
  ? {none:true,text:'',absent:true,before_absence:structuredClone(row[kind])}
  : structuredClone(row[kind].before_absence || emptyMonthly(row.student_id)[kind]);
 return next;
}

export function mergeMonthlyRoster(students, entries, pending=[]) {
 const saved=new Map(entries.map(row=>[row.student_id,row])),drafts=new Map(pending.map(row=>[row.student_id,row]));
 return new Map(students.filter(s=>s.active||saved.has(s.id)).map(s=>[s.id,structuredClone(drafts.get(s.id)||saved.get(s.id)||emptyMonthly(s.id))]));
}

const monthlyContent = row => JSON.stringify([row.memorization,row.revision,row.note]);
export const monthlySavedComplete = (row,saved) => !!saved && !monthlyProblem(row) && monthlyContent(row)===monthlyContent(saved);
export const monthlyHasChanges = (rows,entries) => {
 const saved=new Map(entries.map(r=>[r.student_id,r]));
 return [...rows].some(row=>monthlyContent(row)!==monthlyContent(saved.get(row.student_id)||emptyMonthly(row.student_id)));
};
// The existing versioned RPC requires the whole roster. Only the chosen student's
// draft is submitted; other students retain their last saved amounts.
export function monthlyStudentPayload(rows,entries,studentId) {
 const list=[...rows],selected=list.find(r=>r.student_id===studentId);
 if(!selected || monthlyProblem(selected))throw new Error('أكمل مقدار الحفظ والمراجعة للطالب أولًا، أو حدده غائبًا.');
 const saved=new Map(entries.map(r=>[r.student_id,r]));
 return list.map(row=>structuredClone(row.student_id===studentId?row:saved.get(row.student_id)||emptyMonthly(row.student_id)));
}
