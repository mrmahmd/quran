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
 return rows.map(row=>ids.has(row.student_id)?{...row,...structuredClone(amounts)}:row);
}

export function copyMonthlyAmounts(rows, sourceId, studentIds) {
 const source=rows.find(row=>row.student_id===sourceId);
 if(!source || monthlyProblem(source)) throw new Error('أكمل مقدار الحفظ والمراجعة للطالب أولًا، أو اختر «لا يوجد».');
 if(studentIds.includes(sourceId)) throw new Error('اختر طلابًا آخرين غير الطالب المصدر.');
 return applyMonthlyAmounts(rows,studentIds,{memorization:source.memorization,revision:source.revision});
}
