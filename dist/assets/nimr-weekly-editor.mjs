import { termWeeks, weekEnd, weekNumber } from './evaluation-model.mjs?v=rosters2';
import { formatSelection, narrativeBlock, narrativeDate, parseNarrative } from './nimr-weekly-model.mjs?v=1';

export function createNimrWeeklyEditor({repo,author,showPdf,confirmReload}) {
  const drafts = new Map();
  const panel = document.createElement('section');
  panel.className='narrative-editor';
  panel.innerHTML=`
    <div class="section-heading"><div><h2>التقرير الأسبوعي</h2></div></div>
    <div class="narrative-week">
      <label>الأسبوع <select data-narrative-week></select></label>
      <span data-narrative-dates></span>
    </div>
    <div class="narrative-editor-grid">
      <section class="narrative-editor-card">
        <label for="narrative-text">نص التقرير</label>
        <div class="narrative-tools" role="group" aria-label="تنسيق التقرير">
          <button type="button" data-narrative-format="paragraph">فقرة</button>
          <button type="button" data-narrative-format="heading">عنوان</button>
          <button type="button" data-narrative-format="bold"><strong>عريض</strong></button>
          <button type="button" data-narrative-format="bullet">• نقاط</button>
          <button type="button" data-narrative-format="numbered">١. ترقيم</button>
        </div>
        <textarea id="narrative-text" rows="13" maxlength="30000" placeholder="اكتب التقرير هنا…"></textarea>
      </section>
      <section class="narrative-editor-card">
        <h3>معاينة النص</h3>
        <div class="narrative-text-preview" aria-live="off"></div>
      </section>
    </div>
    <div class="narrative-actions">
      <span data-narrative-state role="status"></span>
      <button type="button" class="light-button" data-narrative-reload hidden>جلب المسودة المحفوظة</button>
      <button type="button" class="light-button" data-narrative-pdf>معاينة وتحميل PDF</button>
      <button type="button" class="solid-button" data-narrative-save>حفظ المسودة</button>
    </div>`;
  const select = panel.querySelector('select');
  const field = panel.querySelector('textarea');
  const textPreview=panel.querySelector('.narrative-text-preview');
  const state=panel.querySelector('[data-narrative-state]');
  const save=panel.querySelector('[data-narrative-save]');
  const exportPdf=panel.querySelector('[data-narrative-pdf]');
  const reload=panel.querySelector('[data-narrative-reload]');
  const tools=[...panel.querySelectorAll('[data-narrative-format]')];
  let term, weeks=[], draft, revisionRequest=0, working=false;
  const dirty = item => item && item.body!==item.savedBody;
  const key = () => term.id+'/'+select.value;

  function notice(message,error=false) {
    state.textContent=message;
    state.dataset.error=String(error);
  }
  function updateControls() {
    const disabled=working||!draft;
    const hasText=field.value.trim().length>0;
    select.disabled=working||!weeks.length;
    field.disabled=disabled;
    tools.forEach(button=>button.disabled=disabled);
    save.disabled=disabled||!hasText||!dirty(draft);
    exportPdf.disabled=disabled||!hasText;
    reload.disabled=working;
  }
  function showText() {
    textPreview.innerHTML=parseNarrative(field.value).map(block=>narrativeBlock(block)).join('')
      || '<p class="narrative-placeholder">هيظهر النص المنسق هنا.</p>';
  }
  async function load(force=false) {
    const token=++revisionRequest;
    draft=undefined;
    field.value='';
    reload.hidden=true;
    showText();
    updateControls();
    const week=select.value;
    panel.querySelector('[data-narrative-dates]').textContent=week?narrativeDate(week)+' – '+narrativeDate(weekEnd(week)):'';
    if (!week) { notice('لا توجد أسابيع في الفصل المحدد.'); return; }
    const id=key();
    notice('جارٍ تحميل التقرير…');
    try {
      const row = !force && drafts.get(id) || await repo.nimrWeeklyReport(term.id,week);
      if (token!==revisionRequest) return;
      draft=row && 'savedBody' in row ? row : {body:row?.body||'',savedBody:row?.body||'',revision:row?.revision||0};
      drafts.set(id,draft);
      field.value=draft.body;
      notice(dirty(draft)?'تعديلات لم تُحفظ':draft.revision?'المسودة محفوظة':'');
    } catch {
      if (token!==revisionRequest) return;
      reload.hidden=false;
      notice('تعذر تحميل التقرير. جرّب جلب المسودة مرة أخرى.',true);
    } finally {
      if (token===revisionRequest) { showText(); updateControls(); }
    }
  }
  function recordInput() {
    if (!draft) return;
    draft.body=field.value;
    showText();
    notice(dirty(draft)?'تعديلات لم تُحفظ':draft.revision?'المسودة محفوظة':'');
    updateControls();
  }

  select.addEventListener('change',()=>{ void load(); });
  field.addEventListener('input',recordInput);
  panel.querySelector('.narrative-tools').addEventListener('click',event=>{
    const button=event.target.closest('[data-narrative-format]');
    if (!button||!draft||working) return;
    const edit=formatSelection(field.value,field.selectionStart,field.selectionEnd,button.dataset.narrativeFormat);
    if (field.value.length-edit.to+edit.from+edit.text.length>field.maxLength) {
      notice('بلغت المسودة الحد الأقصى للنص.',true);
      return;
    }
    field.setRangeText(edit.text,edit.from,edit.to,'end');
    field.focus();
    field.setSelectionRange(edit.selectFrom,edit.selectTo);
    recordInput();
  });
  reload.addEventListener('click',async()=>{
    if (!dirty(draft)||await confirmReload()) await load(true);
  });
  save.addEventListener('click',async()=>{
    if (save.disabled) return;
    const saving=draft;
    working=true;
    updateControls();
    notice('جارٍ حفظ المسودة…');
    try {
      const saved=await repo.saveNimrWeeklyReport(term.id,select.value,saving.body,saving.revision);
      if (!saved || saved.body!==saving.body || !Number.isInteger(saved.revision)) {
        throw new Error('changed');
      }
      saving.savedBody=saved.body;
      saving.revision=saved.revision;
      if (draft!==saving) return;
      reload.hidden=true;
      notice('تم حفظ المسودة.');
    } catch(error) {
      if (draft!==saving) return;
      if (error?.code==='23505' || error?.message==='changed') {
        reload.hidden=false;
        notice('تغيّرت المسودة من نافذة أخرى. انسخ نصك قبل جلب المسودة المحفوظة.',true);
      } else notice('تعذر حفظ المسودة. النص ما زال في المحرر.',true);
    } finally { working=false; updateControls(); }
  });
  exportPdf.addEventListener('click',async()=>{
    if(exportPdf.disabled) return;
    const week=select.value;
    const exporting=draft;
    const details={term,week,end:weekEnd(week),weekNumber:weekNumber(term,weeks.indexOf(week)),author};
    working=true;
    updateControls();
    notice('جارٍ تجهيز ملف PDF…');
    try {
      const {prepareNarrativePdf}=await import('./nimr-weekly-pdf.mjs?v=1');
      const output=await prepareNarrativePdf(details,exporting.body);
      if (draft!==exporting) return;
      if(panel.isConnected) showPdf(output,'التقرير-الأسبوعي-'+details.weekNumber+'-'+week+'.pdf');
      notice(dirty(draft)?'تعديلات لم تُحفظ':'');
    } catch(error) {
      if (draft!==exporting) return;
      notice(/[\u0600-\u06ff]/u.test(error.message||'')?error.message:'تعذر تجهيز ملف PDF. حاول مرة أخرى.',true);
    } finally { working=false; updateControls(); }
  });

  return {
    show(host,selectedTerm,preferredWeek) {
      if (panel.parentElement!==host) host.replaceChildren(panel);
      if (term?.id===selectedTerm.id) return;
      term=selectedTerm;
      weeks=termWeeks(term);
      select.replaceChildren(...weeks.map((date,index)=>
        new Option('الأسبوع '+new Intl.NumberFormat('ar-EG').format(weekNumber(term,index)),date)));
      if(weeks.includes(preferredWeek)) select.value=preferredWeek;
      void load();
    },
    hasUnsaved:()=>[...drafts.values()].some(dirty),
  };
}
