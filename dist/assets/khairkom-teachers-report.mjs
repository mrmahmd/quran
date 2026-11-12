import { brandLockup, platformName, schoolName } from './brand.mjs';
import { nominationRoundLabels } from './khairkom-model.mjs?v=round3';
import { preparePdfExport } from './champions-pdf.mjs?v=grouped-khairkom1';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[character]);
const arabicNumber = value => new Intl.NumberFormat('ar-EG').format(value);

export function khairkomAchievement(snapshot) {
  // A saved review counts as done even when the teacher confirmed no nominees.
  // This is the same criterion used by the dashboard's achievement summary.
  const reviewed = new Set((snapshot.sets || []).map(row => row.teacher_username));
  const nominees = new Map();
  for (const row of snapshot.rows || []) {
    if (row.nominated === false) continue;
    if (!nominees.has(row.teacher_username)) nominees.set(row.teacher_username,new Set());
    nominees.get(row.teacher_username).add(row.student_id);
  }
  const collator = new Intl.Collator('ar');
  const teachers = [...new Map((snapshot.teachers || []).map(teacher => [teacher.username,teacher])).values()]
    .map(teacher => ({username:teacher.username,name:teacher.full_name || teacher.username,
      className:teacher.ring_name || teacher.class_name || '—',done:reviewed.has(teacher.username),
      count:nominees.get(teacher.username)?.size || 0}))
    .sort((a,b) => collator.compare(a.name,b.name));
  const done = teachers.filter(teacher=>teacher.done), pending = teachers.filter(teacher=>!teacher.done);
  return {done,pending,total:teachers.length,percent:teachers.length?Math.round(done.length*100/teachers.length):0};
}

export function khairkomTeacherPage({rows,summary,section,termName,issuedAt,roundLabel = nominationRoundLabels[2]}) {
  const complete = section === 'done';
  return `<article class="khairkom-teacher-sheet ${complete?'achievement-done':'achievement-pending'}" dir="rtl">
    <header class="nominee-report-header"><div class="nominee-school">${brandLockup()}</div><div class="nominee-report-title"><span>جمعية خيركم · ${escapeHtml(roundLabel)}</span><h1>تقرير إنجاز المعلمين</h1><p>${escapeHtml(termName || 'الفصل الدراسي')}</p></div></header>
    <section class="nominee-report-stats"><div><b>${arabicNumber(summary.done.length)}</b><span>معلمون أنجزوا</span></div><div><b>${arabicNumber(summary.pending.length)}</b><span>معلمون لم ينجزوا</span></div><div><b>${arabicNumber(summary.percent)}٪</b><span>نسبة الإنجاز</span></div></section>
    <section class="achievement-section"><h2>${complete?'المعلمون الذين أنجزوا':'المعلمون الذين لم ينجزوا'}</h2><span>${arabicNumber(complete?summary.done.length:summary.pending.length)} معلمًا</span></section>
    <table class="nominee-report-table"><colgroup><col style="width:7%"><col style="width:35%"><col style="width:20%"><col style="width:26%"><col style="width:12%"></colgroup><thead><tr><th>م</th><th>اسم المعلم</th><th>الفصل / الحلقة</th><th>حالة الإنجاز</th><th>المرشحون</th></tr></thead><tbody>${rows.map(row=>`<tr><td class="achievement-index">${arabicNumber(row.index)}</td><th scope="row">${escapeHtml(row.name)}</th><td class="nominee-class"><bdi dir="auto">${escapeHtml(row.className)}</bdi></td><td><strong class="achievement-state">${row.done?'أنجز':'لم ينجز'}</strong><small>${row.done?(row.count?'حفظ الترشيحات':'راجع بلا مرشحين'):'لم يحفظ المراجعة بعد'}</small></td><td class="achievement-count">${arabicNumber(row.count)}</td></tr>`).join('') || `<tr><td colspan="5" class="achievement-empty">${complete?'لم يُنجز أي معلم المراجعة حتى الآن.':'أنجز جميع المعلمين مراجعة الترشيحات.'}</td></tr>`}</tbody></table>
    <p class="achievement-note">يُحتسب الإنجاز عند حفظ الترشيحات أو تأكيد المراجعة بلا مرشحين. إجمالي المعلمين: ${arabicNumber(summary.total)}. الدورة: ${escapeHtml(roundLabel)}.</p>
    <footer class="nominee-report-footer"><span>${platformName} · ${schoolName} · جمعية خيركم</span><span>${escapeHtml(issuedAt)}</span><b class="nominee-page-number"></b></footer>
  </article>`;
}

export async function prepareKhairkomTeachersReport({term,snapshot,roundLabel}) {
  const summary = khairkomAchievement(snapshot);
  const details = {summary,roundLabel,termName:term?.name,issuedAt:new Intl.DateTimeFormat('ar-EG',{dateStyle:'medium',timeZone:'Asia/Riyadh'}).format(new Date())};
  await Promise.all([document.fonts.load('500 22px AlexandriaReport'),document.fonts.load('800 26px AlexandriaReport')]);
  const host = document.createElement('div');
  host.className = 'nominee-export-host';
  const pages = document.createElement('div');
  pages.className = 'khairkom-teachers-pages';
  host.append(pages); document.body.append(host);
  try {
    for (const section of ['done','pending']) {
      const rows = summary[section].map((row,index)=>({...row,index:index+1}));
      let offset = 0;
      do {
        let count = Math.min(16,rows.length-offset);
        const holder = document.createElement('div'); pages.append(holder);
        const render = () => { holder.innerHTML = khairkomTeacherPage({...details,section,rows:rows.slice(offset,offset+count)}); };
        render();
        const fits = () => holder.querySelector('.achievement-note').getBoundingClientRect().bottom <= holder.querySelector('footer').getBoundingClientRect().top-18;
        while (count>1 && !fits()) { count--; render(); }
        if (!fits()) throw new Error('تعذر تنسيق أحد الأسماء في الصفحة. راجع طول البيانات.');
        holder.replaceWith(holder.firstElementChild); offset += count;
      } while(offset<rows.length);
    }
    [...pages.children].forEach((page,index)=>{page.querySelector('.nominee-page-number').textContent=`صفحة ${arabicNumber(index+1)} من ${arabicNumber(pages.children.length)}`;});
    await Promise.all([...pages.querySelectorAll('img')].map(image=>image.decode()));
    pages.remove(); return pages;
  } finally { host.remove(); }
}

export async function createKhairkomTeachersPdf(source) {
  return createA4ReportPdf(source, `تقرير إنجاز المعلمين · جمعية خيركم · ${platformName}`);
}

export async function createA4ReportPdf(source, title) {
  await preparePdfExport();
  const pdf = new window.jspdf.jsPDF({orientation:'portrait',unit:'mm',format:'a4',compress:true});
  const host = document.createElement('div'); host.className='nominee-export-host';
  const copy = source.cloneNode(true); host.append(copy); document.body.append(host);
  try {
    await Promise.all([...copy.querySelectorAll('img')].map(image=>image.decode()));
    for (const [index,page] of [...copy.children].entries()) {
      const canvas=await window.html2canvas(page,{width:1000,height:1414,scale:1.4,windowWidth:1280,windowHeight:1500,scrollX:0,scrollY:0,backgroundColor:'#ffffff',logging:false});
      if(index) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg',0.97),'JPEG',0,0,210,297); canvas.width=canvas.height=0;
    }
    pdf.setProperties({title,author:schoolName});
    return pdf.output('blob');
  } finally {host.remove();}
}
