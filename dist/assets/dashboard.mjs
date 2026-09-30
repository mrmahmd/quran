import { emptyMonthly, monthlyProblem, termMonths } from './monthly-model.mjs?v=knight2';
import { SCORE_FIELDS, emptyScores, scoreTotal, validateScores, termWeeks, semesterSummary, weekNumber, weekEnd } from './evaluation-model.mjs?v=rosters2';
import { formatTestParts, normalizeIdentityNumber, validIdentityNumber, validTestParts } from './khairkom-model.mjs?v=identity1';
import { buildWeeklyReport, buildKhairkomReport, buildChampionsReport } from './report-layout.mjs?v=reports1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const dateLabel = date => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
function errorText(error) {
  if (error?.code === '23514') return 'تحقق من نطاق النقاط والبيانات المدخلة.';
  if (error?.code === '23505') return 'هذه البيانات موجودة بالفعل. راجع القائمة قبل الإضافة.';
  if (error?.code === '42501') return 'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
  if (error?.message && /[\u0600-\u06ff]/.test(error.message)) return error.message;
  return 'تعذر الاتصال بقاعدة البيانات. أعد المحاولة؛ لم نعتمد تغييراتك.';
}

export async function mountDashboard(root, { repository: repo, account, onLogout, preview = false }) {
  let terms = [], teachers = [], termId = '', teacherId = account.username || '', week = '', view = account.role === 'admin' ? 'reports' : 'evaluation';
  let context = { students: [], reviews: [], evaluations: [], honors: [] }, overview = null;
  let scores = new Map(), dirty = false, honorDirty = false, knightDirty = false, busy = false, generation = 0, monthlyDirty = false, month = '', monthlyData = { report: null, entries: [] }, monthlyRows = new Map(), champions = [], chosenKnight = '', selectedHonors = new Set(), khairkomData = { sets: [], rows: [], students: [] }, nominatedStudents = new Map(), identityNumbers = new Map(), nominationDirty = false;
  let messageTimer, editingStudent = '';
  const admin = account.role === 'admin';
  const manager = admin || account.roster_manager;
  const selectedTerm = () => terms.find(term => term.id === termId);
  const teacher = () => teachers.find(row => row.username === teacherId) || account;
  const review = () => context.reviews.find(row => row.week_start === week);
  const readonly = () => admin || !selectedTerm()?.active || review()?.status === 'submitted';
  const weekStudents = () => context.students.filter(student => (review()?.status !== 'submitted' && student.active) || context.evaluations.some(row => row.review_id === review()?.id && row.student_id === student.id));
  const completeCount = () => [...scores.values()].filter(row => validateScores(row, true)).length;

  root.innerHTML = `<div class="dashboard-shell">
    <header class="dashboard-topbar"><a class="brand" href="#"><img src="assets/alandalus-logo.png" alt="شعار مدارس الأندلس الأهلية"><span class="brand-copy"><strong>المدرسة القرآنية</strong><small>المسار المصري - فرع الحمدانية</small></span></a><div class="dashboard-user"><span>${esc(account.role === 'admin' ? 'حساب الإدارة' : account.full_name)}</span><button class="light-button" id="dashboard-logout">تسجيل الخروج</button></div></header>
    ${preview ? '<div class="preview-banner">معاينة تصميم محلية - جميع الأسماء والدرجات هنا تجريبية</div>' : ''}
    <main class="dashboard-main"><section class="welcome-banner"><div><p class="eyebrow">${admin ? 'إشراف واضح.. ودعم لكل حلقة' : 'خطوة صغيرة.. وأثر كبير'}</p><h1>${admin ? 'لوحة إدارة المدرسة القرآنية' : `أهلًا بك، ${esc(account.full_name)}`}</h1><p>${admin ? 'تابع التقييمات المعتمدة وفرسان الأسبوع والتكريم الفصلي.' : `حلقة ${esc(account.ring_name || "")} <bdi dir="ltr">${esc(account.class_name)}</bdi> · قيّم اجتهاد كل طالب وتقدمه مقارنة بنفسه.`}</p></div><div class="welcome-symbol" aria-hidden="true">✦</div></section>
    <section class="dashboard-toolbar" aria-label="الفصل الدراسي والأسبوع"><label>الفصل الدراسي<select id="term-select"></select></label>${manager ? '<label>الحلقة<select id="teacher-select"></select></label>' : '<div class="class-tag">حلقتي <strong>'+esc(account.class_name)+'</strong></div>'}<label>الأسبوع<select id="week-select"></select></label><button class="light-button" id="refresh-dashboard">تحديث البيانات</button></section>
    ${admin ? `<div class="admin-workspace"><aside class="admin-sidebar"><div class="admin-sidebar-title"><span>✦</span><div><strong>مركز الإدارة</strong><small>متابعة الحلقات والتقارير</small></div></div><nav aria-label="أقسام الإدارة"><button data-view="reports"><span>▦</span> نظرة عامة</button><button data-view="evaluation"><span>✓</span> تقييم الحلقة</button><button data-view="champions"><span>★</span> فرسان الأسبوع</button><button data-view="khairkom"><span>◆</span> ترشيحات خيركم</button><button data-view="monthly"><span>▤</span> التقارير الشهرية</button><button data-view="honors"><span>✦</span> التكريم الفصلي</button><button data-view="setup"><span>♧</span> قوائم الطلاب</button></nav><div class="admin-sidebar-note">اختر الحلقة والأسبوع من المرشحات أعلى اللوحة، ثم افتح التقرير المطلوب.</div></aside><div class="admin-workspace-content">` : `<nav class="dashboard-actions" aria-label="أقسام لوحة التحكم"><button class="action-card blue-card" data-view="evaluation"><span class="action-symbol">✓</span><span><strong>التقييم الأسبوعي</strong><small>نقاط واضحة من ١٢</small></span><span class="action-arrow">←</span></button><button class="action-card gold-card" data-view="knight"><span class="action-symbol">★</span><span><strong>فارس الأسبوع</strong><small>احتفِ بالاجتهاد والتحسن</small></span><span class="action-arrow">←</span></button><button class="action-card purple-card" data-view="honors"><span class="action-symbol">✦</span><span><strong>التكريم الفصلي</strong><small>ثمرة رحلة الفصل الدراسي</small></span><span class="action-arrow">←</span></button><button class="action-card teal-card" data-view="monthly"><span class="action-symbol">▤</span><span><strong>التقرير الشهري</strong><small>مقدار الحفظ والمراجعة</small></span><span class="action-arrow">←</span></button><button class="action-card khairkom-card" data-view="khairkom"><span class="action-symbol">◆</span><span><strong>ترشيحات جمعية خيركم</strong><small>رشّح طلاب حلقتك</small></span><span class="action-arrow">←</span></button></nav>${manager ? '<div class="admin-tabs"><span>مشرف الطلاب · تقييمات الحلقات الأخرى تخص معلميها</span><button class="gold-button" data-view="champions">★ فرسان الأسبوع</button><button class="light-button" data-view="setup">إدارة قوائم الطلاب</button></div>' : ''}`}
    <div id="dashboard-message" class="dashboard-message" role="status" hidden></div><section id="dashboard-content" aria-live="polite"></section>
    ${admin ? '</div></div>' : ''}</main><footer class="dashboard-footer">مدارس الأندلس الأهلية · نحتفي بالتقدم والتحسن والإتقان</footer>
    <dialog id="dashboard-confirm" class="confirm-dialog"><h2></h2><p></p><div><button class="light-button" data-answer="cancel">العودة</button><button class="solid-button" data-answer="confirm">تأكيد</button></div></dialog></div><section id="report-preview" class="report-preview" hidden aria-label="معاينة التقرير"><div class="report-preview-toolbar"><strong>معاينة التقرير</strong><span>اختر «حفظ PDF» من نافذة الطباعة للحصول على الملف.</span><div><button type="button" id="report-print">حفظ PDF / طباعة</button><button type="button" id="report-close">إغلاق المعاينة</button></div></div><div id="report-preview-body"></div></section>`;

  const content = root.querySelector('#dashboard-content');
  const termSelect = root.querySelector('#term-select');
  const weekSelect = root.querySelector('#week-select');
  const teacherSelect = root.querySelector('#teacher-select');
  const dialog = root.querySelector('#dashboard-confirm');
  const reportPreview = root.querySelector('#report-preview');
  function openReport(kind, oneTeacher = false) {
    if (kind === 'champions' && !manager || kind !== 'champions' && !admin) return;
    const common = { term: selectedTerm(), week, weekNumber: weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week)), weekEnd: weekEnd(week) };
    let markup;
    if (kind === 'weekly') markup = buildWeeklyReport({ ...common, teachers, overview, teacherUsername: oneTeacher ? teacherId : undefined });
    if (kind === 'khairkom') markup = buildKhairkomReport({ term: selectedTerm(), teachers, data: khairkomData });
    if (kind === 'champions') markup = buildChampionsReport({ ...common, champions });
    if (!markup) return;
    root.querySelector('#report-preview-body').innerHTML = markup;
    reportPreview.hidden = false;
    document.body.classList.add('report-is-open');
    reportPreview.scrollTop = 0;
    root.querySelector('#report-close').focus();
  }
  function closeReport() {
    reportPreview.hidden = true;
    root.querySelector('#report-preview-body').replaceChildren();
    document.body.classList.remove('report-is-open');
  }
  function notify(text, error = false) {
    const element = root.querySelector('#dashboard-message');
    clearTimeout(messageTimer);
    element.textContent = text; element.hidden = false; element.classList.toggle('is-error', error);
    if (!error) messageTimer = setTimeout(() => { element.hidden = true; }, 7000);
  }
  function confirm(title, text) {
    dialog.querySelector('h2').textContent = title; dialog.querySelector('p').textContent = text;
    return new Promise(resolve => {
      const finish = answer => { dialog.close(); dialog.removeEventListener('click', click); dialog.removeEventListener('cancel', cancel); resolve(answer); };
      const click = event => { const answer = event.target.closest('[data-answer]'); if (answer) finish(answer.dataset.answer === 'confirm'); };
      const cancel = event => { event.preventDefault(); finish(false); };
      dialog.addEventListener('click', click); dialog.addEventListener('cancel', cancel); dialog.showModal();
    });
  }
  async function mayLeave() { return (!dirty && !honorDirty && !knightDirty && !monthlyDirty && !nominationDirty) || await confirm('تغييرات لم تُحفظ', 'هل تريد الانتقال وترك التغييرات غير المحفوظة؟'); }
  function updateSelectors() {
    termSelect.innerHTML = terms.length ? terms.map(term => `<option value="${esc(term.id)}">${esc(term.name)}${term.active ? '' : ' (مؤرشف)'}</option>`).join('') : '<option value="">لم تُحدد الفصول الدراسية بعد</option>';
    termSelect.value = termId;
    if (teacherSelect) { teacherSelect.innerHTML = teachers.map(row => `<option value="${esc(row.username)}">${esc(row.ring_name ? row.ring_name + " (" + row.class_name + ")" : row.class_name)} · ${esc(row.full_name)}</option>`).join(''); teacherSelect.value = teacherId; }
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    weekSelect.innerHTML = weeks.length ? weeks.map((day, i) => `<option value="${day}">الأسبوع ${weekNumber(selectedTerm(), i)} · ${dateLabel(day)} – ${dateLabel(weekEnd(day))}${day > today() ? ' (قادم)' : ''}</option>`).join('') : '<option value="">بانتظار تواريخ الفصل الدراسي</option>';
    weekSelect.value = week; weekSelect.disabled = !weeks.length;
  }
  function loadScores() {
    scores = new Map(weekStudents().map(student => {
      const stored = context.evaluations.find(row => row.student_id === student.id && row.review_id === review()?.id);
      const row = stored ? Object.fromEntries(Object.keys(emptyScores(student.id)).map(key => [key, stored[key]])) : emptyScores(student.id);
      return [student.id, row];
    }));
    chosenKnight = review()?.knight_student_id || '';
    selectedHonors = new Set(context.honors.map(row => row.student_id)); dirty = false; honorDirty = false; knightDirty = false;
  }
  async function loadContext() {
    const ticket = ++generation;
    content.innerHTML = '<div class="empty-state"><span class="loading-ring"></span><h2>جارٍ تحميل بيانات الحلقة</h2></div>';
    try {
      const data = teacherId ? await repo.context(teacherId, termId) : { students: [], reviews: [], evaluations: [], honors: [] };
      const report = admin && termId ? await repo.overview(termId) : null;
      const months = termMonths(selectedTerm());
      if (!months.includes(month)) month = months.find(value => value.slice(0, 7) === today().slice(0, 7)) || months[0] || '';
      const monthly = teacherId && termId && month ? await repo.monthly(teacherId, termId, month) : { report: null, entries: [] };
      const gallery = manager && termId ? await repo.champions(termId, week) : [];
      const nominations = termId ? await repo.khairkom(termId) : { sets: [], rows: [], students: [] };
      if (ticket !== generation) return;
      context = data; overview = report; monthlyData = monthly; champions = gallery; khairkomData = nominations; nominatedStudents = new Map(nominations.rows.filter(row => row.teacher_username === teacherId).map(row => [row.student_id, [...(row.test_parts || [])]])); identityNumbers = new Map(nominations.rows.filter(row => row.teacher_username === teacherId).map(row => [row.student_id, row.identity_number || ''])); nominationDirty = false; loadScores(); loadMonthlyRows(); render();
    } catch (error) { if (ticket !== generation) return; content.innerHTML = '<div class="empty-state"><h2>تعذر تحميل البيانات</h2><p>اضغط تحديث البيانات للمحاولة مرة أخرى.</p></div>'; notify(errorText(error), true); }
  }
  function empty(title, text, symbol = '✦') { return `<div class="empty-state"><span class="empty-symbol">${symbol}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`; }
  function render() {
    if (!admin && account.roster_manager && teacherId !== account.username && !['champions','setup'].includes(view)) view = 'setup';
    root.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('selected', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); });
    if (view === 'setup') { renderSetup(); return; }
    if (!termId) { content.innerHTML = empty('جاهزون لبدء الرحلة', 'ستظهر التقييمات بعد إضافة تواريخ الفصل الدراسي وقوائم الطلاب التي سترسلها الإدارة.'); return; }
    if (view === 'champions') { renderChampions(); return; }
    if (view === 'khairkom') { renderKhairkom(); return; }
    if (view === 'monthly') { renderMonthly(); return; }
    if (admin && view === 'evaluation') { renderAdminStudents(); return; }
    if (admin && view === 'knight') { renderChampions(); return; }
    if (view === 'reports') { renderReports(); return; }
    if (!context.students.length) { content.innerHTML = empty('قائمة طلاب الحلقة قيد التجهيز', 'ستظهر أسماء طلاب هذه الحلقة فور إضافتها، لتقييمهم واختيار فارس الأسبوع والمكرَّمين.'); return; }
    if (view === 'evaluation') admin ? renderAdminStudents() : renderEvaluation();
    if (view === 'knight') renderKnight();
    if (view === 'honors') renderHonors();
  }
  function scoreCard(student) {
    const row = scores.get(student.id), total = scoreTotal(row);
    return `<article class="student-score-card" data-student="${esc(student.id)}"><header><span class="student-avatar" aria-hidden="true">${esc(student.full_name.trim().slice(0, 1))}</span><div><h3>${esc(student.full_name)}</h3><small>${student.source_class ? `الفصل الأصلي: <bdi dir="ltr">${esc(student.source_class)}</bdi>` : student.student_code && !/^(DOC17-|TRANSFER-)/.test(student.student_code) ? `رقم الطالب: ${esc(student.student_code)}` : student.active ? 'طالب الحلقة' : 'طالب مؤرشف · تقييم محفوظ'}</small></div><span class="total-badge">${total === null ? '—' : total}<small>/ ١٢</small></span></header><div class="score-groups">${SCORE_FIELDS.map(field => `<div class="score-group"><span id="label-${esc(student.id)}-${field.key}">${field.label}<small>${field.max} نقاط</small></span><div role="group" aria-labelledby="label-${esc(student.id)}-${field.key}">${Array.from({ length: field.max + 1 }, (_, n) => `<button type="button" class="point-chip" data-score="${field.key}" data-point="${n}" aria-pressed="${row[field.key] === n}" aria-label="${field.label}: ${n} نقاط" ${readonly() ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`).join('')}</div><div class="bonus-row"><label><input type="checkbox" data-bonus="bonus_memorization" ${row.bonus_memorization ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز الحفظ <b>+١</b></label><label><input type="checkbox" data-bonus="bonus_revision" ${row.bonus_revision ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز المراجعة <b>+١</b></label></div></article>`;
  }
  function renderEvaluation() {
    const students = weekStudents();
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">التقييم الأسبوعي</p><h2>طلاب الحلقة.. في شاشة واحدة</h2><p>ضع النقاط لجميع الطلاب ثم احفظ التقييم مرة واحدة. الصفر تقييم صحيح، والدرجة الفارغة لم تُسجّل بعد.</p></div><span class="status-pill ${review()?.status === 'submitted' ? 'approved' : ''}">${review()?.status === 'submitted' ? '✓ أسبوع معتمد' : 'بانتظار التقييم'}</span></div>
    <div class="evaluation-tools"><div id="rating-progress" class="progress-copy"></div><span class="help-pill">✓ الحفظ ٤ · المراجعة ٢ · التحسن ٢ · الالتزام ٢ · التميز ٢</span></div>
    <div class="students-grid" id="students-grid">${students.map(scoreCard).join('')}</div>
    <div class="save-bar"><span id="save-state"></span><div>${readonly() ? '<button class="gold-button" data-view="knight">اختيار فارس الأسبوع ★</button>' + (admin && review()?.status === 'submitted' ? '<button class="light-button" id="reopen-week">إعادة فتح التقييم</button>' : '') : '<button class="solid-button" id="submit-week" ' + (week > today() || !students.length ? 'disabled title="الحفظ متاح بعد بداية الأسبوع"' : '') + '>✓ حفظ تقييم جميع الطلاب</button>'}</div></div>`;
    updateProgress();
  }
  function updateProgress() {
    const count = completeCount(), all = scores.size;
    const element = root.querySelector('#rating-progress');
    if (element) element.innerHTML = `<strong>${count} <small>من ${all} طالبًا</small></strong><span>اكتمل تقييمهم</span><div class="progress-track"><i style="width:${all ? count / all * 100 : 0}%"></i></div>`;
    const status = root.querySelector('#save-state');
    if (status) status.textContent = readonly() ? 'تم حفظ واعتماد تقييم الحلقة.' : dirty ? 'تغييرات لم تُحفظ؛ احفظ تقييم الحلقة بعد اكتمال جميع الطلاب.' : 'زر واحد لحفظ واعتماد نقاط جميع الطلاب.';
  }
  function renderKnight() {
    const current = review();
    const ranked = context.students.filter(student => student.active || student.id === current?.knight_student_id).map(student => ({student_id: student.id, full_name: student.full_name}));
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker gold-text">فارس الأسبوع</p><h2>نحتفي بالاجتهاد والتحسن</h2><p>اختر فارس الأسبوع بنفسك من طلاب الحلقة. لا يوجد اختيار تلقائي أو ترتيب بالنقاط.</p></div><span class="status-pill gold-status">${current?.knight_student_id ? '★ تم اختيار الفارس' : 'بانتظار اختيارك'}</span></div>
    <div class="knight-grid">${ranked.map((row, i) => `<button class="knight-card ${chosenKnight === row.student_id ? 'chosen' : ''}" data-knight="${esc(row.student_id)}" aria-pressed="${chosenKnight === row.student_id}" ${!selectedTerm()?.active ? 'disabled' : ''}><span class="knight-star">★</span><h3>${esc(row.full_name)}</h3><span class="choice-label">${chosenKnight === row.student_id ? '✓ اختيارك لفارس الأسبوع' : 'اختيار هذا الطالب'}</span></button>`).join('')}</div>
    <div class="note-panel"><label for="knight-note">سبب اختيار فارس الأسبوع <small>(اختياري)</small></label><textarea id="knight-note" maxlength="500" placeholder="مثال: تحسن واضح في إتقان التسميع">${esc(current?.knight_note || '')}</textarea></div><div class="save-bar"><span>يحتفظ الطالب بميداليته تقديرًا لإنجازه.</span><button class="gold-button" id="save-knight" ${!chosenKnight || !selectedTerm()?.active || week > today() ? 'disabled' : ''}>حفظ فارس الأسبوع ★</button></div>`;
  }
  const monthlyStudents = () => context.students.filter(student => student.active || monthlyData.entries.some(row => row.student_id === student.id));
  const monthlyReadonly = () => admin || !selectedTerm()?.active || teacherId !== account.username;
  function loadMonthlyRows() {
    monthlyRows = new Map(monthlyStudents().map(student => [student.id, structuredClone(monthlyData.entries.find(row => row.student_id === student.id) || emptyMonthly(student.id))]));
    monthlyDirty = false;
  }
  const monthLabel = date => new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(date + 'T00:00:00Z'));
  function monthlySection(student, kind, label) {
    const row = monthlyRows.get(student.id)[kind], disabled = monthlyReadonly() ? 'disabled' : '';
    return `<section class="monthly-section ${kind}"><h4>مقدار ${label}</h4><label class="none-choice"><input type="checkbox" data-monthly-none="${kind}" ${row.none ? 'checked' : ''} ${disabled}>لا يوجد ${label} خلال الشهر</label>${row.none ? '<p class="zero-report">لا يوجد مقدار مسجّل لهذا الشهر.</p>' : `<label class="monthly-amount">اكتب مقدار ${label} خلال الشهر<textarea data-monthly-kind="${kind}" maxlength="1000" rows="3" placeholder="مثال: من سورة البقرة آية ١ إلى سورة آل عمران آية ٢٠" ${disabled}>${esc(row.text)}</textarea></label>`}</section>`;
  }
  function renderMonthly() {
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker teal-text">التقرير الشهري</p><h2>رحلة الحفظ والمراجعة</h2><p>اكتب مقدار الحفظ والمراجعة لكل طالب خلال الشهر بكلماتك، أو اختر «لا يوجد».</p></div><span class="status-pill teal-status">${monthlyData.report ? '✓ تقرير محفوظ' : 'تقرير جديد'}</span></div><div class="monthly-toolbar"><label>الشهر<select id="month-select">${termMonths(selectedTerm()).map(value => `<option value="${value}" ${month === value ? 'selected' : ''}>${monthLabel(value)}</option>`).join('')}</select></label><button class="light-button" id="print-monthly">▤ طباعة التقرير</button><span>${esc(teacher().full_name)} · ${esc(teacher().ring_name || teacher().class_name)}</span></div><div class="print-heading"><h2>التقرير الشهري — ${monthLabel(month)}</h2><p>${esc(teacher().full_name)} · ${esc(teacher().ring_name || teacher().class_name)}</p></div>${monthlyReadonly() ? monthlyData.report ? monthlyTable() : empty('لم يُرسل تقرير هذا الشهر بعد', 'سيظهر تقرير الحلقة هنا بعد حفظه بواسطة المعلم.') : `<div class="monthly-grid">${monthlyStudents().map(student => `<article class="monthly-card" data-monthly-student="${student.id}"><header><span class="student-avatar">${esc(student.full_name.slice(0, 1))}</span><h3>${esc(student.full_name)}</h3>${student.active ? '' : '<small>مؤرشف · تقرير محفوظ</small>'}</header>${monthlySection(student, 'memorization', 'حفظ')}${monthlySection(student, 'revision', 'مراجعة')}<label class="monthly-note">ملاحظة اختيارية<textarea data-monthly-note maxlength="500" rows="2" ${monthlyReadonly() ? 'disabled' : ''}>${esc(monthlyRows.get(student.id).note)}</textarea></label></article>`).join('') || empty('لا توجد أسماء في الحلقة', 'أضف الطلاب قبل إعداد التقرير الشهري.')}</div><div class="print-only">${monthlyTable()}</div>`}<div class="save-bar"><span id="monthly-save-state">${monthlyDirty ? 'تغييرات لم تُحفظ بعد' : 'حفظ واحد لجميع طلاب الحلقة'}</span>${!monthlyReadonly() ? `<button class="teal-button" id="save-monthly" ${!monthlyRows.size || month > today() ? 'disabled' : ''}>✓ حفظ التقرير الشهري لجميع الطلاب</button>` : '<span>عرض تقرير الحلقة المحفوظ</span>'}</div>`;
  }
  function monthlyTable() {
    const amount = value => value.none ? 'لا يوجد' : esc(value.text || 'لم يُسجّل');
    return `<div class="monthly-table-wrap"><table class="monthly-report-table"><thead><tr><th>م</th><th>اسم الطالب</th><th>مقدار الحفظ</th><th>مقدار المراجعة</th><th>ملاحظة</th></tr></thead><tbody>${monthlyStudents().map((student,index) => {const row=monthlyRows.get(student.id); return `<tr><td>${index+1}</td><th scope="row">${esc(student.full_name)}</th><td>${amount(row.memorization)}</td><td>${amount(row.revision)}</td><td>${esc(row.note || '—')}</td></tr>`;}).join('')}</tbody></table></div>`;
  }
  function renderKhairkom() {
    if (admin) {
      const rows = khairkomData.rows;
      const studentNames = new Map(khairkomData.students.map(student => [student.id, student]));
      const teacherNames = new Map(teachers.map(row => [row.username, row]));
      const nominatedTeachers = new Set(rows.map(row => row.teacher_username));
      content.innerHTML = `<div class="section-heading"><div><p class="section-kicker khairkom-text">جمعية خيركم</p><h2>تقرير المرشحين واختباراتهم</h2><p>ترشيحات جميع المعلمين للفصل الدراسي المحدد، مع رقم هوية الطالب والأجزاء التي سيُختبر فيها.</p></div><span class="status-pill khairkom-status">${rows.length} طالبًا · ${nominatedTeachers.size} معلمًا</span></div>
      <div class="admin-summary"><div><strong>${rows.length}</strong><span>طلاب مرشحون</span></div><div><strong>${nominatedTeachers.size}</strong><span>معلمون رشحوا طلابًا</span></div><div><strong>${teachers.filter(row => !nominatedTeachers.has(row.username)).length}</strong><span>لم يرشحوا بعد</span></div></div>
      ${rows.length ? `<div class="monthly-table-wrap"><table class="monthly-report-table khairkom-table"><thead><tr><th>م</th><th>الطالب المرشح</th><th>الفصل</th><th>رقم الهوية</th><th>المعلم</th><th>أجزاء الاختبار</th></tr></thead><tbody>${rows.map((row,index)=>{const owner=teacherNames.get(row.teacher_username), student=studentNames.get(row.student_id);return `<tr><td>${index+1}</td><th scope="row">${esc(student?.full_name || 'طالب مؤرشف')}</th><td><bdi dir="ltr">${esc(student?.source_class || owner?.class_name || '—')}</bdi></td><td><bdi dir="ltr" class="khairkom-report-identity">${esc(row.identity_number || 'لم يُسجّل')}</bdi></td><td>${esc(owner?.full_name || row.teacher_username)}</td><td><span class="khairkom-report-parts">${esc(formatTestParts(row.test_parts))}</span></td></tr>`;}).join('')}</tbody></table></div>` : empty('لا توجد ترشيحات بعد', 'ستظهر ترشيحات المعلمين هنا فور حفظها.', '◆')}
      <div class="save-bar khairkom-report-bar"><span>التقرير مجمّع تلقائيًا من لوحات المعلمين.</span><button class="solid-button" id="print-khairkom">معاينة وحفظ PDF</button></div>`;
      return;
    }
    const ownSet = khairkomData.sets.find(row => row.teacher_username === teacherId);
    const students = context.students.filter(student => student.active || nominatedStudents.has(student.id));
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker khairkom-text">جمعية خيركم</p><h2>اختر المرشح وأجزاء اختباره</h2><p>رشّح الطالب، واكتب رقم هويته، ثم أضف الأجزاء التي سيُختبر فيها من الجزء ١ إلى ٣٠. يمكن تعديل البيانات قبل الحفظ.</p></div><span class="status-pill khairkom-status">${nominatedStudents.size} مرشح</span></div>
    ${students.length ? `<div class="khairkom-list">${students.map(student=>{const chosen=nominatedStudents.has(student.id), parts=nominatedStudents.get(student.id) || [];return `<article class="khairkom-student ${chosen?'chosen':''}" data-khairkom-student="${esc(student.id)}"><label class="khairkom-choice"><input type="checkbox" data-khairkom-choice ${chosen?'checked':''} ${!selectedTerm()?.active?'disabled':''}><span><strong>${esc(student.full_name)}</strong><small>${esc(student.source_class || teacher().class_name)} · ${chosen?'✓ مرشح لجمعية خيركم':'اختر للترشيح'}</small></span></label><div class="khairkom-part-panel"><label class="khairkom-identity-label">رقم هوية الطالب<input type="text" data-khairkom-identity inputmode="numeric" dir="ltr" autocomplete="off" maxlength="25" placeholder="اكتب رقم الهوية" aria-label="رقم هوية الطالب ${esc(student.full_name)}" value="${esc(identityNumbers.get(student.id) || '')}" ${chosen&&selectedTerm()?.active?'':'disabled'}><small>٦ إلى ٢٠ رقمًا · يمكن الكتابة بالأرقام العربية أو الإنجليزية</small></label><label>أجزاء الاختبار<div class="khairkom-part-picker"><select data-khairkom-part-select aria-label="اختر جزءًا للطالب ${esc(student.full_name)}" ${chosen&&selectedTerm()?.active?'':'disabled'}><option value="">اختر الجزء</option>${Array.from({length:30},(_,i)=>`<option value="${i+1}">الجزء ${new Intl.NumberFormat('ar-EG').format(i+1)}</option>`).join('')}</select><button type="button" class="khairkom-add-part" data-khairkom-add-part ${chosen&&selectedTerm()?.active?'':'disabled'}>+ إضافة الجزء</button></div></label><div class="khairkom-parts" aria-label="الأجزاء المختارة">${parts.map(part=>`<span class="khairkom-part-chip">الجزء ${new Intl.NumberFormat('ar-EG').format(part)}<button type="button" data-khairkom-remove-part="${part}" aria-label="حذف الجزء ${part}" ${!selectedTerm()?.active?'disabled':''}>×</button></span>`).join('') || '<span class="khairkom-part-empty">لم تختر أجزاء بعد</span>'}</div></div></article>`;}).join('')}</div>` : empty('لا توجد أسماء طلاب في حلقتك', 'ستظهر أسماء الطلاب هنا بعد إضافة قائمة الحلقة.', '◆')}
    <div class="save-bar"><span id="khairkom-save-state">${ownSet?'يمكنك تعديل الترشيحات المحفوظة':'لم تُحفظ ترشيحات بعد'}</span><button class="solid-button" id="save-khairkom" ${!students.length||!selectedTerm()?.active?'disabled':''}>✓ حفظ ترشيحات جمعية خيركم</button></div>`;
  }
  function updateKhairkomParts(card) {
    const parts = [...(nominatedStudents.get(card.dataset.khairkomStudent) || [])].sort((a,b)=>a-b);
    card.querySelector('.khairkom-parts').innerHTML = parts.map(part => `<span class="khairkom-part-chip">الجزء ${new Intl.NumberFormat('ar-EG').format(part)}<button type="button" data-khairkom-remove-part="${part}" aria-label="حذف الجزء ${part}">×</button></span>`).join('') || '<span class="khairkom-part-empty">لم تختر أجزاء بعد</span>';
    card.classList.remove('needs-attention');
    nominationDirty = true;
    root.querySelector('#khairkom-save-state').textContent = 'تغييرات لم تُحفظ';
  }
  function renderChampions() {
    const selected = champions.filter(row => row.student_name);
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker gold-text">فرسان الأسبوع</p><h2>نجوم حلقاتنا.. مجتمعون</h2><p>اختيارات المعلمين اليدوية للأسبوع المحدد أعلى الصفحة.</p></div><span class="status-pill gold-status">★ ${selected.length} / ${champions.length} حلقة اختارت فارسًا</span></div><div class="report-intro"><div><strong>تقرير فرسان الأسبوع المجمّع</strong><span>الأسماء وأسباب الاختيار في ملف واحد أنيق.</span></div><button class="gold-button" id="preview-champions">معاينة وحفظ PDF ★</button></div><div class="champions-grid">${champions.map(row => `<article class="champion-card ${row.student_name ? '' : 'pending-champion'}"><span class="champion-symbol">${row.student_name ? '★' : '☆'}</span><span class="report-class">${esc(row.ring_name || row.class_name)}</span><h3>${esc(row.student_name || 'بانتظار اختيار الفارس')}</h3><p>${esc(row.teacher_name)}</p><small>${dateLabel(week)} – ${dateLabel(weekEnd(week))}</small>${row.note ? `<blockquote>${esc(row.note)}</blockquote>` : ''}<span class="status-pill gold-status">${row.student_name ? 'اختيار المعلم' : 'لم يُختر بعد'}</span></article>`).join('') || empty('لا توجد حلقات', 'تظهر الحلقات النشطة هنا.', '★')}</div>`;
  }
  function renderHonors() {
    if (admin) { const names = context.honors.map(h=>context.students.find(s=>s.id===h.student_id)?.full_name).filter(Boolean); content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">التكريم الفصلي</p><h2>مكرّمو ${esc(teacher().full_name)}</h2><p>اختيارات المعلم المحفوظة للفصل الدراسي.</p></div></div><div class="champions-grid">${names.map(name=>`<article class="champion-card"><span class="champion-symbol">✦</span><h3>${esc(name)}</h3></article>`).join('') || empty('لم تُحفظ قائمة التكريم بعد', 'تظهر هنا اختيارات المعلم عند حفظها.', '✦')}</div>`; return; }

    const summary = semesterSummary(context.students, context.reviews, context.evaluations).filter(student => student.weeks > 0);
    if (!summary.length) { content.innerHTML = empty('التكريم يبدأ برحلة التقييم', 'ستظهر النقاط التراكمية بعد اعتماد أول أسبوع. تُجمع نقاط التميز ضمن المجموع الفصلي.'); return; }
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker purple-text">التكريم الفصلي</p><h2>ثمرة رحلة من الاجتهاد</h2><p>اختر المكرَّمين بالنظر إلى النقاط والتحسن والاستمرارية والإتقان. عدد المكرَّمين يحدده قرار الإدارة.</p></div><span class="status-pill purple-status" id="honor-count">${selectedHonors.size} مختار للتكريم</span></div><div class="honors-list">${summary.map((student, i) => `<label class="honor-card ${selectedHonors.has(student.id) ? 'chosen' : ''}"><input type="checkbox" data-honor="${esc(student.id)}" ${selectedHonors.has(student.id) ? 'checked' : ''} ${!selectedTerm()?.active ? 'disabled' : ''}><span class="honor-order">${i + 1}</span><div class="honor-name"><h3>${esc(student.full_name)}</h3><small>${student.weeks} أسبوعًا معتمدًا</small></div><div class="honor-stats"><span>نقاط الفصل<strong>${student.total}</strong></span><span>نقاط التحسن<strong>${student.improvement}</strong></span><span>الحفظ والمراجعة<strong>${student.memorization_revision}</strong></span><span>الالتزام<strong>${student.commitment}</strong></span></div><span class="honor-icon">✦</span></label>`).join('')}</div><div class="note-panel"><label for="honor-note">ملاحظة التكريم <small>(اختياري)</small></label><textarea id="honor-note" maxlength="500" placeholder="ملاحظات عن التحسن والاستمرارية أو سبب الاختيار">${esc(context.honors[0]?.note || '')}</textarea></div><div class="save-bar"><span>النقاط من الأسابيع المعتمدة فقط، وتشمل نقاط التميز.</span><button class="purple-button" id="save-honors" ${!selectedTerm()?.active ? 'disabled' : ''}>حفظ قائمة التكريم ✦</button></div>`;
  }
  function renderAdminStudents() {
    const students = context.students.filter(student => student.active || context.evaluations.some(row => row.student_id === student.id && row.review_id === review()?.id));
    const evaluated = students.filter(student => context.evaluations.some(row => row.student_id === student.id && row.review_id === review()?.id && row.total !== null));
    const grades = new Map(context.evaluations.filter(row => row.review_id === review()?.id && row.total != null).map(row => [row.student_id, row]));
    const leaders = students.filter(student => grades.has(student.id)).sort((a,b) => grades.get(b.id).total - grades.get(a.id).total || a.full_name.localeCompare(b.full_name, 'ar')).slice(0, 3);
    const knight = context.students.find(student => student.id === review()?.knight_student_id);
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">تقرير الحلقة · الأسبوع ${weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week))}</p><h2>${esc(teacher().full_name)} · <bdi dir="auto">${esc(teacher().ring_name || teacher().class_name)}</bdi></h2><p>تقييمات محفوظة من لوحة المعلم مباشرة. الصفر درجة مسجلة، والشرطة تعني أن التقييم لم يُسجل.</p></div><button class="light-button" data-view="reports">← جميع المعلمين</button></div>
    <div class="admin-summary"><div><strong>${students.length}</strong><span>طلاب الحلقة</span></div><div><strong>${evaluated.length}</strong><span>تم تقييمهم</span></div><div><strong>${students.length-evaluated.length}</strong><span>لم يُقيّموا بعد</span></div><div class="gold-summary"><strong>${esc(knight?.full_name || 'لم يُختر بعد')}</strong><span>★ فارس الأسبوع · اختيار المعلم</span></div></div>
    <section class="admin-leaders"><div class="admin-block-heading"><div><span>✦ تميّز هذا الأسبوع</span><h3>الطلاب الأعلى نقاطًا</h3><p>ترتيب تلقائي لنقاط التقييم المسجلة في الحلقة، مستقل عن فارس الأسبوع.</p></div><span>${leaders.length ? `${leaders.length} طلاب` : 'بانتظار التقييم'}</span></div>${leaders.length ? `<div class="admin-leader-grid">${leaders.map((student,index)=>`<article class="admin-leader-card leader-${index+1}"><span class="admin-leader-rank">${['١','٢','٣'][index]}</span><span class="admin-leader-icon">${['★','✦','✧'][index]}</span><small>${esc(student.source_class || teacher().class_name)}</small><h4>${esc(student.full_name)}</h4><strong>${grades.get(student.id).total}<small> / ١٢ نقطة</small></strong></article>`).join('')}</div>` : '<div class="admin-leader-empty">ستظهر البطاقات بعد أن يسجل المعلم تقييمات الطلاب لهذا الأسبوع.</div>'}</section>
    <div class="admin-block-heading admin-students-heading"><div><span>▦ سجل الحلقة</span><h3>جميع الطلاب وتقييماتهم</h3><p>بطاقات واضحة لكل طالب، مع تفاصيل النقاط وحالة التقييم.</p></div><span>${students.length} طالبًا</span></div>
    ${students.length ? `<div class="admin-student-grid">${students.map(student=>{const row=grades.get(student.id), done=!!row;return `<article class="admin-student-card ${done?'rated':'pending'}"><div class="admin-student-top"><span class="admin-student-avatar">${esc(student.full_name.slice(0,1))}</span><div><h4>${esc(student.full_name)}</h4><small>${esc(student.source_class || teacher().class_name)}</small></div><strong>${done?`${row.total}<small>/ ١٢</small>`:'—'}</strong></div><div class="admin-student-scores">${[['الحفظ','memorization'],['المراجعة','revision'],['التحسن','improvement'],['الالتزام','commitment']].map(([label,field])=>`<span>${label}<strong>${done ? esc(row[field]) : '—'}</strong></span>`).join('')}<span>التميز<strong>${done ? (row.bonus_memorization || 0)+(row.bonus_revision || 0) : '—'}</strong></span></div><div class="admin-student-foot"><span class="status-pill ${done?'approved':''}">${done?'✓ تم التقييم':'بانتظار التقييم'}</span></div></article>`;}).join('')}</div>` : empty('لا توجد أسماء طلاب مرتبطة بهذه الحلقة', 'لم تُضف قائمة هذه الحلقة بعد. يمكن للإدارة إضافتها من إدارة قوائم الطلاب.', '✦')}
    <details class="admin-detail-table"><summary>عرض التقييمات في جدول</summary>
    ${students.length ? `<div class="monthly-table-wrap"><table class="monthly-report-table admin-score-table"><thead><tr><th>الطالب</th><th>الحفظ</th><th>المراجعة</th><th>التحسن</th><th>الالتزام</th><th>التميز</th><th>المجموع</th><th>الحالة</th></tr></thead><tbody>${students.map(student=>{const row=context.evaluations.find(e=>e.student_id===student.id&&e.review_id===review()?.id);const complete=row?.total!==null&&row?.total!==undefined;return `<tr><td><strong>${esc(student.full_name)}</strong><small>${esc(student.source_class || '')}</small></td>${['memorization','revision','improvement','commitment'].map(field=>`<td>${esc(row?.[field] ?? '—')}</td>`).join('')}<td>${row ? (row.bonus_memorization ?? 0)+(row.bonus_revision ?? 0) : '—'}</td><td><strong><bdi dir="ltr">${complete?row.total+' / 12':'—'}</bdi></strong></td><td><span class="status-pill ${complete?'approved':''}">${complete?'تم التقييم':'لم يُقيّم بعد'}</span></td></tr>`;}).join('')}</tbody></table></div>` : empty('لا توجد أسماء طلاب مرتبطة بهذه الحلقة', 'لم تُضف قائمة هذه الحلقة بعد. يمكن للإدارة إضافتها من إدارة قوائم الطلاب؛ لا تعني هذه الرسالة وجود تقييمات ناقصة.', '✦')}
    </details>
    <div class="save-bar"><span>${review()?.status==='submitted'?'✓ التقييم معتمد':'التقييم لم يُعتمد بعد'} · عرض للمتابعة فقط</span><div><button class="solid-button" id="print-admin-report">تقرير هذه الحلقة PDF</button>${review()?.status==='submitted'?'<button class="light-button" id="reopen-week">إعادة فتح التقييم</button>':''}<button class="teal-button" data-view="monthly">التقرير الشهري</button><button class="light-button" data-view="setup">إدارة الطلاب</button></div></div>`;
  }
  function renderReports() {
    const approved = overview.reviews.filter(row => row.week_start === week && row.status === 'submitted');
    const evaluated = overview.evaluations || [];
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">متابعة الإدارة</p><h2>المعلمون وحلقاتهم</h2><p>اضغط بطاقة المعلم لعرض أسماء طلابه وتقييم كل طالب للأسبوع المحدد.</p></div><span class="status-pill">${approved.length} / ${teachers.length} حلقة اعتمدت الأسبوع</span></div><div class="report-intro"><div><strong>التقرير الأسبوعي المجمّع</strong><span>ملف متعدد الصفحات، قسم مستقل لكل معلم، ورأس الجدول يتكرر في كل صفحة.</span></div><button class="solid-button" id="preview-weekly-all">معاينة وحفظ PDF</button></div><div class="report-grid">${teachers.map(row=>{const current=overview.reviews.find(r=>r.teacher_username===row.username&&r.week_start===week);const students=overview.students.filter(student=>student.teacher_username===row.username&&(student.active||evaluated.some(e=>e.review_id===current?.id&&e.student_id===student.id)));const rated=evaluated.filter(e=>e.review_id===current?.id&&e.total!==null&&students.some(student=>student.id===e.student_id)).length;const champion=champions.find(c=>c.teacher_username===row.username);return `<button class="report-card" data-teacher-report="${esc(row.username)}"><span class="report-class">${esc(row.ring_name || row.class_name)}</span><h3>${esc(row.full_name)}</h3><p>${students.length} طالبًا · ${rated} تم تقييمهم · ${Math.max(0,students.length-rated)} بانتظار التقييم</p><span class="status-pill ${current?.status==='submitted'?'approved':''}">${!students.length?'قائمة الطلاب غير مضافة':current?.status==='submitted'?'✓ مكتمل ومعتمد':rated?'جارٍ التقييم':'لم يبدأ التقييم'}</span><div><span>★ ${esc(champion?.student_name || 'لم يُختر الفارس')}</span><span>عرض تقرير الطلاب ←</span></div></button>`;}).join('')}</div>`;
  }
  function renderSetup() {
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">تجهيز البيانات</p><h2>الطلاب والفصول الدراسية</h2><p>يمكن إدخال القوائم التي ترسلها المدرسة هنا، ثم تظهر تلقائيًا للمعلم المسؤول.</p></div></div><div class="setup-grid">${admin ? `<form id="term-form" class="setup-card"><h3>إضافة فصل دراسي</h3><label>اسم الفصل الدراسي<input name="name" maxlength="100" required placeholder="مثال: الفصل الدراسي الأول"></label><div class="date-fields"><label>تاريخ البداية<input name="starts_on" type="date" required></label><label>تاريخ النهاية<input name="ends_on" type="date" required></label></div><button class="solid-button" type="submit">حفظ الفصل الدراسي</button></form>` : ''}<form id="students-form" class="setup-card"><h3>إضافة طلاب الحلقة ${esc(teacher().class_name || '')}</h3><p>أدخل اسمًا واحدًا في كل سطر. يمكن إضافة رقم الطالب بعد علامة |. راجع الأسماء قبل الحفظ.</p><label>أسماء الطلاب<textarea name="names" required rows="7" placeholder="اسم الطالب الأول&#10;اسم الطالب الثاني"></textarea></label><button class="solid-button" type="submit" ${!teacherId ? 'disabled' : ''}>حفظ الطلاب لهذه الحلقة</button></form></div><div class="roster-summary"><h3>طلاب الحلقة الحاليون (${context.students.length})</h3><div>${context.students.map(student => `<div class="roster-row"><span>${esc(student.full_name)}${student.active ? '' : ' (مؤرشف)'}<small>${esc(student.source_class || '')}</small></span><button class="light-button" data-edit-student="${esc(student.id)}">تعديل / نقل</button><button class="light-button" data-archive-student="${esc(student.id)}">${student.active ? 'حذف من القائمة' : 'استعادة'}</button></div>`).join('') || '<p>لم تُضف أسماء الطلاب بعد.</p>'}</div></div>${studentEditor()}`;
  }
  function studentEditor() {
    const student=context.students.find(row=>row.id===editingStudent);
    if (!student) return '';
    return `<form id="student-edit-form" class="setup-card"><h3>تعديل بيانات الطالب</h3><label>الاسم<input name="full_name" maxlength="150" required value="${esc(student.full_name)}"></label><label>المعلم / الحلقة<select name="teacher">${teachers.map(row=>`<option value="${esc(row.username)}" ${row.username===student.teacher_username?'selected':''}>${esc(row.ring_name ? row.ring_name + " (" + row.class_name + ")" : row.class_name)} · ${esc(row.full_name)}</option>`).join('')}</select></label><p>عند النقل تظل التقييمات السابقة محفوظة لدى الحلقة السابقة، وتبدأ المتابعة في الحلقة الجديدة.</p><button class="solid-button" type="submit">حفظ التعديل</button></form>`;
  }
  async function action(work, success) {
    if (busy) return;
    busy = true; root.classList.add('is-busy'); root.setAttribute('aria-busy', 'true');
    try { await work(); notify(success); } catch (error) { notify(errorText(error), true); }
    finally { busy = false; root.classList.remove('is-busy'); root.removeAttribute('aria-busy'); }
  }
  root.addEventListener('click', async event => {
    if (event.target.closest('#report-close')) { closeReport(); return; }
    if (event.target.closest('#report-print') && !reportPreview.hidden) { await document.fonts.ready; window.print(); return; }
    if (event.target.closest('#preview-weekly-all') && admin) { openReport('weekly'); return; }
    if (event.target.closest('#print-khairkom') && admin) { openReport('khairkom'); return; }
    if (event.target.closest('#preview-champions') && manager) { openReport('champions'); return; }
    const addPart = event.target.closest('[data-khairkom-add-part]');
    if (addPart && !admin && !busy && selectedTerm()?.active) {
      const card = addPart.closest('[data-khairkom-student]'), id = card.dataset.khairkomStudent;
      const selected = Number(card.querySelector('[data-khairkom-part-select]').value);
      if (!selected) { notify('اختر رقم الجزء أولًا.', true); return; }
      const parts = nominatedStudents.get(id);
      if (!parts) return;
      if (parts.includes(selected)) { notify('هذا الجزء مضاف بالفعل للطالب.', true); return; }
      parts.push(selected); updateKhairkomParts(card);
      card.querySelector('[data-khairkom-part-select]').value = '';
      return;
    }
    const removePart = event.target.closest('[data-khairkom-remove-part]');
    if (removePart && !admin && !busy && selectedTerm()?.active) {
      const card = removePart.closest('[data-khairkom-student]'), id = card.dataset.khairkomStudent;
      nominatedStudents.set(id, (nominatedStudents.get(id) || []).filter(part => part !== Number(removePart.dataset.khairkomRemovePart)));
      updateKhairkomParts(card); return;
    }
    if (event.target.closest('#save-khairkom') && !admin && !busy) {
      const chosen = [...nominatedStudents].map(([student_id, test_parts]) => ({ student_id, test_parts: [...test_parts].sort((a,b)=>a-b), identity_number: normalizeIdentityNumber(identityNumbers.get(student_id)) }));
      const missing = chosen.filter(row => !validTestParts(row.test_parts));
      const invalidIds = chosen.filter(row => !validIdentityNumber(row.identity_number));
      root.querySelectorAll('.khairkom-student').forEach(card => card.classList.remove('needs-attention'));
      if (missing.length) {
        missing.forEach(row => root.querySelector(`[data-khairkom-student="${row.student_id}"]`)?.classList.add('needs-attention'));
        root.querySelector(`[data-khairkom-student="${missing[0].student_id}"] select`)?.focus();
        notify('حدد جزء الاختبار للطالب: ' + missing.map(row => context.students.find(student => student.id === row.student_id)?.full_name).join('، '), true); return;
      }
      if (invalidIds.length) {
        invalidIds.forEach(row => root.querySelector(`[data-khairkom-student="${row.student_id}"]`)?.classList.add('needs-attention'));
        root.querySelector(`[data-khairkom-student="${invalidIds[0].student_id}"] [data-khairkom-identity]`)?.focus();
        notify('اكتب رقم هوية صحيحًا للطالب: ' + invalidIds.map(row => context.students.find(student => student.id === row.student_id)?.full_name).join('، '), true); return;
      }
      await action(async()=>{await repo.saveKhairkom({p_teacher:teacherId,p_term:termId,p_rows:chosen,p_version:khairkomData.sets.find(row=>row.teacher_username===teacherId)?.version||0});nominationDirty=false;await loadContext();},'تم حفظ الترشيحات وظهرت في تقرير الإدارة.'); return;
    }
    if (event.target.closest('#print-monthly')) {
      const printable = root.querySelector('.print-only');
      if (printable) printable.innerHTML = monthlyTable();
      window.print(); return;
    }
    if (event.target.closest('#save-monthly') && !busy && !monthlyReadonly()) {
      const missing = monthlyStudents().filter(student => monthlyProblem(monthlyRows.get(student.id)));
      root.querySelectorAll('.needs-attention').forEach(card => card.classList.remove('needs-attention'));
      if (missing.length) {
        missing.forEach(student => root.querySelector(`[data-monthly-student="${student.id}"]`).classList.add('needs-attention'));
        root.querySelector(`[data-monthly-student="${missing[0].id}"] textarea`)?.focus();
        notify('التقرير غير مكتمل: ' + missing.map(student => `${student.full_name} (${monthlyProblem(monthlyRows.get(student.id))})`).join('؛ '), true); return;
      }
      await action(async () => { await repo.saveMonthly({p_teacher:teacherId,p_term:termId,p_month:month,p_rows:[...monthlyRows.values()],p_version:monthlyData.report?.version || 0}); monthlyDirty=false; await loadContext(); }, 'تم حفظ التقرير الشهري لجميع الطلاب وإظهاره للإدارة.'); return;
    }
    const edit = event.target.closest('[data-edit-student]');
    if (edit && manager && !busy) { editingStudent=edit.dataset.editStudent; renderSetup(); root.querySelector('#student-edit-form input').focus(); return; }
    const archive = event.target.closest('[data-archive-student]');
    if (archive && manager && !busy) {
      const student=context.students.find(row=>row.id===archive.dataset.archiveStudent);
      if (!await confirm(student.active?'حذف من القائمة':'استعادة الطالب', student.active?'سيُؤرشف الطالب وتظل تقييماته السابقة محفوظة، ويمكن استعادته لاحقًا.':'سيعود الطالب إلى قائمة الحلقة.')) return;
      await action(async()=>{await repo.manageStudent({p_id:student.id,p_name:student.full_name,p_teacher:student.teacher_username,p_active:!student.active}); await loadContext();},'تم تحديث قائمة الطلاب.'); return;
    }
    const nav = event.target.closest('[data-view]');
    if (nav && !busy) {
      if (view === 'khairkom' && nominationDirty) { if (!await mayLeave()) return; nominatedStudents = new Map(khairkomData.rows.filter(row=>row.teacher_username===teacherId).map(row=>[row.student_id,[...(row.test_parts || [])]])); identityNumbers = new Map(khairkomData.rows.filter(row=>row.teacher_username===teacherId).map(row=>[row.student_id,row.identity_number || ''])); nominationDirty=false; }
      if (view === 'monthly' && monthlyDirty) { if (!await mayLeave()) return; loadMonthlyRows(); }
      if (view === 'evaluation' && dirty) { if (!await mayLeave()) return; loadScores(); }
      if ((view === 'honors' && honorDirty) || (view === 'knight' && knightDirty)) {
        if (!await mayLeave()) return;
        selectedHonors = new Set(context.honors.map(row => row.student_id)); honorDirty = false;
        chosenKnight = review()?.knight_student_id || ''; knightDirty = false;
      }
      view = nav.dataset.view; render(); return;
    }
    const chip = event.target.closest('[data-score]');
    if (chip && !readonly() && !busy) {
      const card = chip.closest('[data-student]'), row = scores.get(card.dataset.student);
      row[chip.dataset.score] = Number(chip.dataset.point); dirty = true;
      if (validateScores(row, true)) card.classList.remove('needs-attention');
      chip.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button === chip ? 'true' : 'false'));
      const total = scoreTotal(row); card.querySelector('.total-badge').innerHTML = `${total === null ? '—' : total}<small>/ ١٢</small>`; updateProgress(); return;
    }
    const candidate = event.target.closest('[data-knight]');
    if (candidate && !busy) { chosenKnight = candidate.dataset.knight; knightDirty = true; root.querySelectorAll('[data-knight]').forEach(button => { const selected = button.dataset.knight === chosenKnight; button.classList.toggle('chosen', selected); button.setAttribute('aria-pressed', String(selected)); button.querySelector('.choice-label').textContent = selected ? '✓ اختيارك لفارس الأسبوع' : 'اختيار هذا الطالب'; }); root.querySelector('#save-knight').disabled = week > today() || !selectedTerm()?.active; return; }
    const report = event.target.closest('[data-teacher-report]');
    if (report && !busy) { if (!await mayLeave()) return; teacherId = report.dataset.teacherReport; view = 'evaluation'; updateSelectors(); await loadContext(); return; }
    const id = event.target.closest('button')?.id;
    if (admin && ['submit-week','save-knight','save-honors'].includes(id)) return;
    if (id === 'submit-week') {
      const rows = [...scores.values()], missing = weekStudents().filter(student => !validateScores(scores.get(student.id), true));
      root.querySelectorAll('.needs-attention').forEach(card => card.classList.remove('needs-attention'));
      if (!rows.length) { notify('لا يوجد طلاب لتقييمهم.', true); return; }
      if (missing.length) {
        const details = missing.map(student => `${student.full_name} (${SCORE_FIELDS.filter(field => scores.get(student.id)[field.key] === null).map(field => field.label).join('، ')})`);
        missing.forEach(student => root.querySelector(`[data-student="${student.id}"]`)?.classList.add('needs-attention'));
        root.querySelector(`[data-student="${missing[0].id}"] button`)?.focus();
        notify('لم يكتمل التقييم: ' + details.join('؛ '), true); return;
      }
      if (!await confirm('حفظ تقييم الحلقة', 'سيُحفظ تقييم جميع الطلاب ويُعتمد الأسبوع، ثم يمكنك اختيار فارسه يدويًا. التعديل بعد الحفظ يحتاج إعادة فتح الأسبوع بواسطة الإدارة.')) return;
      await action(async () => { await repo.saveWeek({ p_teacher: teacherId, p_term: termId, p_week: week, p_rows: rows, p_submit: true, p_version: review()?.version || 0 }); dirty = false; await loadContext(); }, 'تم حفظ تقييم جميع الطلاب. اختر فارس الأسبوع يدويًا.');
    }
    if (id === 'print-admin-report' && admin) { openReport('weekly', true); return; }
    if (id === 'save-knight') await action(async () => { await repo.knight({ p_teacher: teacherId, p_term: termId, p_week: week, p_student: chosenKnight, p_note: root.querySelector('#knight-note').value.trim(), p_version: review()?.version || 0 }); await loadContext(); }, 'تم حفظ فارس الأسبوع وإظهاره للإدارة.');
    if (id === 'save-honors') await action(async () => { await repo.honors({ p_teacher: teacherId, p_term: termId, p_students: [...selectedHonors], p_note: root.querySelector('#honor-note').value.trim() }); honorDirty = false; await loadContext(); }, 'تم حفظ قائمة التكريم الفصلي.');
    if (id === 'reopen-week' && await confirm('إعادة فتح التقييم', 'سيصبح الأسبوع مسودة لتعديل النقاط، مع الاحتفاظ باختيار فارس الأسبوع.')) await action(async () => { await repo.reopen({ p_review: review().id, p_version: review().version }); await loadContext(); }, 'تمت إعادة فتح التقييم للتعديل.');
    if (id === 'refresh-dashboard' && !busy && await mayLeave()) await action(async () => {
      terms = await repo.terms();
      if (manager) { teachers = await repo.teachers(); teacherId ||= teachers[0]?.username || ''; }
      if (!terms.some(term => term.id === termId)) { termId = terms.find(term => term.active)?.id || terms[0]?.id || ''; const weeks = selectedTerm() ? termWeeks(selectedTerm()) : []; week = weeks.filter(day => day <= today()).at(-1) || weeks[0] || ''; }
      updateSelectors(); await loadContext();
    }, 'تم تحديث البيانات.');
    if (id === 'dashboard-logout' && !busy && await mayLeave()) {
      try { await onLogout(); clearTimeout(messageTimer); window.removeEventListener('beforeunload', beforeUnload); }
      catch (error) { notify(errorText(error), true); }
    }
  });
  root.addEventListener('change', async event => {
    if (busy) return;
    if (event.target.hasAttribute('data-khairkom-choice') && !admin) {
      const card=event.target.closest('[data-khairkom-student]'), studentId=card.dataset.khairkomStudent;
      if (event.target.checked) { nominatedStudents.set(studentId,[]); identityNumbers.set(studentId,''); }
      else { nominatedStudents.delete(studentId); identityNumbers.delete(studentId); }
      card.classList.toggle('chosen',event.target.checked);
      card.querySelector('[data-khairkom-part-select]').disabled=!event.target.checked;
      card.querySelector('[data-khairkom-add-part]').disabled=!event.target.checked;
      card.querySelector('[data-khairkom-identity]').disabled=!event.target.checked;
      card.querySelector('[data-khairkom-identity]').value='';
      card.querySelector('small').textContent=`${context.students.find(student=>student.id===studentId)?.source_class || teacher().class_name} · ${event.target.checked?'✓ مرشح لجمعية خيركم':'اختر للترشيح'}`;
      updateKhairkomParts(card);
      nominationDirty=true;root.querySelector('.khairkom-status').textContent=`${nominatedStudents.size} مرشح`;root.querySelector('#khairkom-save-state').textContent='تغييرات لم تُحفظ';return;
    }
    if (event.target.id === 'month-select') {
      const next = event.target.value;
      if (!await mayLeave()) { event.target.value = month; return; }
      month = next; await loadContext(); return;
    }
    if (event.target.dataset.monthlyNone && !monthlyReadonly()) {
      const row = monthlyRows.get(event.target.closest('[data-monthly-student]').dataset.monthlyStudent), kind = event.target.dataset.monthlyNone;
      row[kind] = {none:event.target.checked,text:''};
      monthlyDirty=true; renderMonthly(); return;
    }
    const bonus = event.target.dataset.bonus;
    if (bonus && !readonly()) { const card = event.target.closest('[data-student]'), row = scores.get(card.dataset.student); row[bonus] = event.target.checked ? 1 : 0; dirty = true; const total = scoreTotal(row); card.querySelector('.total-badge').innerHTML = `${total === null ? '—' : total}<small>/ ١٢</small>`; updateProgress(); }
    if (event.target.dataset.honor) { const id = event.target.dataset.honor; if (event.target.checked) selectedHonors.add(id); else selectedHonors.delete(id); honorDirty = true; event.target.closest('.honor-card').classList.toggle('chosen', event.target.checked); root.querySelector('#honor-count').textContent = `${selectedHonors.size} مختار للتكريم`; }
    if (event.target === termSelect || event.target === weekSelect || event.target === teacherSelect) {
      if (!await mayLeave()) { updateSelectors(); return; }
      if (event.target === termSelect) { termId = termSelect.value; const weeks = termWeeks(selectedTerm()); week = weeks.filter(value => value <= today()).at(-1) || weeks[0] || ''; }
      if (event.target === weekSelect) week = weekSelect.value;
      if (event.target === teacherSelect) teacherId = teacherSelect.value;
      updateSelectors(); await loadContext();
    }
  });
  root.addEventListener('input', event => {
    if (event.target.hasAttribute('data-khairkom-identity') && !admin) {
      const card=event.target.closest('[data-khairkom-student]'), id=card.dataset.khairkomStudent;
      if (nominatedStudents.has(id)) { identityNumbers.set(id,event.target.value); nominationDirty=true; card.classList.remove('needs-attention'); root.querySelector('#khairkom-save-state').textContent='تغييرات لم تُحفظ'; }
      return;
    }
    const card = event.target.closest('[data-monthly-student]');
    if (card && !monthlyReadonly() && !busy) {
      const row = monthlyRows.get(card.dataset.monthlyStudent);
      if (event.target.hasAttribute('data-monthly-note')) row.note = event.target.value;
      if (event.target.dataset.monthlyKind) row[event.target.dataset.monthlyKind].text = event.target.value;
      monthlyDirty=true; root.querySelector('#monthly-save-state').textContent='تغييرات لم تُحفظ بعد';
    }
    if (event.target.id === 'honor-note') honorDirty = true;
    if (event.target.id === 'knight-note') knightDirty = true;
  });
  root.addEventListener('submit', async event => {
    event.preventDefault();
    if (event.target.id === 'student-edit-form' && manager) {
      const student=context.students.find(row=>row.id===editingStudent), form=new FormData(event.target);
      if (!student) return;
      if (!await confirm('حفظ بيانات الطالب','سيُحفظ الاسم والمعلم المختار. عند النقل تبقى التقييمات السابقة محفوظة.')) return;
      await action(async()=>{await repo.manageStudent({p_id:student.id,p_name:form.get('full_name').trim(),p_teacher:form.get('teacher'),p_active:student.active}); editingStudent=''; await loadContext();},'تم حفظ بيانات الطالب.'); return;
    }
    if (event.target.id === 'term-form') {
      const form = new FormData(event.target), starts_on = form.get('starts_on'), ends_on = form.get('ends_on'), name = form.get('name').trim();
      if (!name || ends_on < starts_on || termWeeks({ starts_on, ends_on }).length >= 105) { notify('راجع اسم الفصل وتواريخ بدايته ونهايته.', true); return; }
      if (!await mayLeave()) return;
      await action(async () => { const added = await repo.addTerm({ name, starts_on, ends_on }); terms = await repo.terms(); termId = added.id; week = termWeeks(added).filter(value => value <= today()).at(-1) || termWeeks(added)[0]; updateSelectors(); await loadContext(); }, 'تم حفظ الفصل الدراسي.');
    }
    if (event.target.id === 'students-form') {
      const rows = new FormData(event.target).get('names').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const [full_name, student_code] = line.split('|').map(value => value.trim());
        return { full_name, student_code: student_code || null, teacher_username: teacherId };
      });
      if (!rows.length || rows.length > 300 || rows.some(row => !row.full_name || row.full_name.length > 150)) { notify('أدخل قائمة صحيحة، بحد أقصى ٣٠٠ طالب في الدفعة.', true); return; }
      if (rows.some((row, i) => rows.some((other, j) => j !== i && ((row.student_code && row.student_code === other.student_code) || (!row.student_code && row.full_name === other.full_name))))) { notify('يوجد تكرار في القائمة. للأسماء المتشابهة أضف رقم الطالب بعد علامة | لكل اسم.', true); return; }
      if (rows.some(row => context.students.some(student => row.student_code ? student.student_code === row.student_code : student.full_name === row.full_name))) { notify('القائمة تتضمن طالبًا موجودًا بالفعل. راجع الأسماء والأرقام قبل الحفظ.', true); return; }
      if (!await confirm('حفظ قائمة الطلاب', `سيُضاف ${rows.length} طالبًا إلى حلقة ${teacher().class_name}. تأكد من اختيار الحلقة الصحيحة.`)) return;
      await action(async () => { await repo.addStudents(rows); await loadContext(); }, 'تم حفظ الطلاب وربطهم بالمعلم.');
    }
  });
  function beforeUnload(event) { if (dirty || honorDirty || knightDirty || monthlyDirty || nominationDirty) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload', beforeUnload);
  try {
    [terms, teachers] = await Promise.all([repo.terms(), manager ? repo.teachers() : Promise.resolve([account])]);
    teacherId ||= teachers[0]?.username || '';
    termId = terms.find(term => term.active && term.starts_on <= today() && term.ends_on >= today())?.id || terms.find(term => term.active)?.id || terms[0]?.id || '';
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    week = weeks.filter(value => value <= today()).at(-1) || weeks[0] || '';
    updateSelectors(); await loadContext();
  } catch (error) { content.innerHTML = empty('تعذر تحميل لوحة التحكم', 'اضغط تحديث البيانات بعد التأكد من اتصال الإنترنت.'); notify(errorText(error), true); }
}
