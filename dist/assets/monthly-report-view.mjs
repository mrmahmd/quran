import {SURAHS, monthlyAbsent, monthlyProblem, monthlyRangeText, validMonthlyRange} from './monthly-model.mjs';

const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const arabicNumber=value=>new Intl.NumberFormat('ar-EG',{useGrouping:false}).format(value);

// Presentation only. Free text is never parsed or replaced with inferred quantities.
export function monthlyAmountMarkup(value,kind) {
  const label=kind==='memorization'?'الحفظ':'المراجعة';
  const text=typeof value?.text==='string'?value.text:'';
  const title=`<span class="monthly-amount-title">${label}</span>`;
  let body,state='recorded';
  if(value?.absent===true){state='absent';body='<p class="monthly-amount-message">غائب — لم يحضر</p>';}
  else if(value?.none===true){state='none';body=`<p class="monthly-amount-message">${kind==='memorization'?'لا يوجد حفظ خلال الشهر':'لا توجد مراجعة خلال الشهر'}</p>`;}
  else if(validMonthlyRange(value?.range)&&text.trim()===monthlyRangeText(value.range)){
    const endpoint=(side,word)=>`<div class="monthly-amount-endpoint"><span class="monthly-range-word">${word}</span><strong>سورة ${esc(SURAHS[value.range[side+'_surah']-1].name)}</strong><span class="monthly-ayah-pill">الآية <bdi>${arabicNumber(value.range[side+'_ayah'])}</bdi></span></div>`;
    body=endpoint('from','من')+endpoint('to','إلى');
  }else if(text.trim())body=`<p class="monthly-legacy-text">${esc(text)}</p>`;
  else{state='missing';body=`<p class="monthly-amount-message">${kind==='memorization'?'لم يُسجّل الحفظ بعد':'لم تُسجّل المراجعة بعد'}</p>`;}
  return `<div class="monthly-amount-display amount-${kind} amount-${state}">${title}${body}</div>`;
}

export function monthlyStudentStatus(row){
  const absent=monthlyAbsent(row),missing=!!monthlyProblem(row);
  return `<span class="monthly-reading-status status-${absent?'absent':missing?'missing':'complete'}">${absent?'— غائب':missing?'◷ بيانات ناقصة':'✓ مكتمل'}</span>`;
}

export function buildMonthlyReadingTable({students,rows,className=''}){
  return `<div class="monthly-table-wrap monthly-reading-wrap"><table class="monthly-report-table monthly-reading-table"><colgroup><col class="reading-index"><col class="reading-student"><col class="reading-amount"><col class="reading-amount"><col class="reading-note"></colgroup><thead><tr><th scope="col">م</th><th scope="col">الطالب</th><th scope="col">الحفظ</th><th scope="col">المراجعة</th><th scope="col">الملاحظة</th></tr></thead><tbody>${students.filter(s=>rows.has(s.id)).map((student,index)=>{
    const row=rows.get(student.id);
    return `<tr><td class="monthly-reading-index"><span>${arabicNumber(index+1)}</span></td><th scope="row" class="monthly-reading-student"><strong>${esc(student.full_name)}</strong><span class="monthly-reading-class">الحلقة <bdi dir="auto">${esc(student.source_class||className||'—')}</bdi></span>${monthlyStudentStatus(row)}${student.active===false?'<small class="monthly-reading-archived">مؤرشف · تقرير محفوظ</small>':''}</th><td class="monthly-reading-amount">${monthlyAmountMarkup(row.memorization,'memorization')}</td><td class="monthly-reading-amount">${monthlyAmountMarkup(row.revision,'revision')}</td><td class="monthly-reading-note"><span class="monthly-note-title">ملاحظة المعلم</span><p>${esc(row.note||'—')}</p></td></tr>`;
  }).join('')}</tbody></table></div>`;
}

export function monthlyReadingHeading({teacher,label}){
  return `<header class="monthly-reading-heading"><div><span class="monthly-reading-eyebrow">سجل الحفظ والمراجعة</span><h2 class="monthly-detail-title">${esc(teacher.full_name)}</h2><p>الحلقة <bdi dir="auto">${esc(teacher.ring_name||teacher.class_name||'—')}</bdi></p></div><span class="monthly-reading-month">${esc(label)}</span></header>`;
}
