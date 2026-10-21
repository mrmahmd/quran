import {mountTeacherAppearance} from './teacher-appearance.mjs?v=monthly-reading5';
import {mountDashboardIdentity} from './dashboard-identity.mjs?v=monthly-reading5';
import {buildMonthlyReadingTable,monthlyReadingHeading} from './monthly-report-view.mjs?v=monthly-reading5';
import {teacherWeeks} from './teacher-week-model.mjs?v=monthly-reading5';
import { summarizeMonthlyTeachers } from './monthly-progress-model.mjs?v=monthly-admin1';
import { emptyMonthly, monthlyProblem, termMonths, monthlyLabel, SURAHS, monthlyRangeText, monthlyProgress, applyMonthlyAmounts, copyMonthlyAmounts, copyMemorizationToRevision, monthlyAbsent, setMonthlyAbsent, mergeMonthlyRoster, monthlySavedComplete, monthlyStudentPayload, monthlyHasChanges } from './monthly-model.mjs?v=monthly-finish1';
import { SCORE_FIELDS, emptyScores, scoreTotal, validateScores, termWeeks, semesterSummary, weekNumber, weekEnd } from './evaluation-model.mjs?v=rosters2';
import { applyEditedNominee, applySavedNominations, filterNominations, nominationFilterLabel, formatTestParts, normalizeIdentityNumber, validIdentityNumber, validTestParts } from './khairkom-model.mjs?v=monthly-admin1';
import { buildWeeklyReport, buildKhairkomReport, buildChampionsReport, buildTeacherProgressReport, buildMonthlyReport } from './report-layout.mjs?v=monthly-reading5';
import { summarizeTeacherProgress } from './admin-progress-model.mjs?v=monthly-admin1';

const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
const dateLabel = date => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Riyadh' }).format(new Date());
function errorText(error) {
  if (error?.code === '23514') return 'تحقق من نطاق النقاط والبيانات المدخلة.';
  if (error?.code === '23505') return 'هذه البيانات موجودة بالفعل. راجع القائمة قبل الإضافة.';
  if (error?.code === '42501') return /[\u0600-\u06ff]/.test(error.message||'')?error.message:'ليس لديك صلاحية لتنفيذ هذا الإجراء.';
  if (error?.message && /[\u0600-\u06ff]/.test(error.message)) return error.message;
  return 'تعذر الاتصال بقاعدة البيانات. أعد المحاولة؛ لم نعتمد تغييراتك.';
}

export async function mountDashboard(root, { repository: repo, account, onLogout, preview = false }) {
  let terms = [], teachers = [], termId = '', teacherId = account.username || '', week = '', view = account.role === 'admin' ? 'reports' : 'home';
  let context = { students: [], reviews: [], evaluations: [], honors: [] }, overview = null, weekStates = [], monthStates = [], monthlyOverview = {reports:[],entries:[],students:[]};
  let scores = new Map(), dirty = false, honorDirty = false, knightDirty = false, busy = false, generation = 0, monthlyDirty = false, month = '', monthlyData = { report: null, entries: [] }, monthlyRows = new Map(), champions = [], chosenKnight = '', selectedHonors = new Set(), khairkomData = { sets: [], rows: [], students: [] }, nominatedStudents = new Map(), identityNumbers = new Map(), nominationDirty = false;
  let messageTimer, editingStudent = '', rosterDirty = false, monthlyCardsVisible = false, monthlyStudentFilter = 'pending';
  let nominationSaveReceipt = null, rosterRequests = [], requestFilter = 'pending', rosterPollTimer, rosterPolling=false, dashboardClosed=false;
  let progressFocus = 'weekly';
  let weeklyStudentFilter = 'pending', weeklyActiveStudent = '';
  const weeklyEntryComplete = id => validateScores(scores.get(id),true);
  let nominationFilters = {parts:[], mode:'all', teacher:'', className:''}, nominationReport = null;
  const nominationViewer = account.role === 'admin' || account.khairkom_viewer === true;
  const identityEditor = account.role === 'admin' || account.khairkom_identity_editor === true;
  const nominationAdder = account.role === 'admin' || account.khairkom_nomination_adder === true;
  const reportData = () => nominationReport || {...khairkomData, teachers};
  const filteredNominations = () => filterNominations(reportData(), reportData().teachers, nominationFilters);
  const admin = account.role === 'admin';
  const manager = admin || account.roster_manager;
  const canManageRoster = () => manager || teacherId === account.username;
  const monthlyReader = admin || account.username === 'quran17';
  const monthlyOverviewMode = () => admin || ['monthlyReport','monthlyProgress'].includes(view);
  const selectedTerm = () => terms.find(term => term.id === termId);
  const teacher = () => teachers.find(row => row.username === teacherId) || account;
  const review = () => context.reviews.find(row => row.week_start === week);
  const weekOpen = value => value >= (selectedTerm()?.starts_on || '') && weekStates.find(row => row.week_start === value)?.is_open !== false;
  const currentWeek = () => { const date = new Date(`${today()}T00:00:00Z`); date.setUTCDate(date.getUTCDate() - date.getUTCDay()); return date.toISOString().slice(0,10); };
  const khairkomOpen = () => weekOpen(currentWeek());
  const readonly = () => admin || !selectedTerm()?.active || !weekOpen(week) || review()?.status === 'submitted';
  const weekStudents = () => context.students.filter(student => (review()?.status !== 'submitted' && student.active) || context.evaluations.some(row => row.review_id === review()?.id && row.student_id === student.id));
  const completeCount = () => [...scores.values()].filter(row => validateScores(row, true)).length;
  const adminProgress = () => summarizeTeacherProgress(teachers, overview?.reviews || [], champions, khairkomData.rows, week, weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week)));
  const toolbar = '<section class="dashboard-toolbar" aria-label="مرشحات لوحة التحكم">' +
    '<label data-filter="term">الفصل الدراسي<select id="term-select"></select></label>' +
    (manager ? '<label data-filter="teacher">الحلقة<select id="teacher-select"></select></label>' : '<div class="class-tag">حلقتي <strong>' + esc(account.class_name) + '</strong></div>') +
    '<label data-filter="week">الأسبوع<select id="week-select"></select></label>' +
    '<button class="light-button" id="refresh-dashboard">تحديث البيانات</button></section>';

  root.innerHTML = `<div class="dashboard-shell">
    <header class="dashboard-topbar"><a class="brand" href="#"><img src="assets/alandalus-logo.png" alt="شعار مدارس الأندلس الأهلية"><span class="brand-copy"><strong>المدرسة القرآنية</strong><small>المسار المصري - فرع الحمدانية</small></span></a><div class="dashboard-user"><span>${esc(account.role === 'admin' ? 'حساب الإدارة' : account.full_name)}</span><button class="light-button" id="dashboard-logout">تسجيل الخروج</button></div></header>
    ${preview ? '<div class="preview-banner">معاينة تصميم محلية - جميع الأسماء والدرجات هنا تجريبية</div>' : ''}
    <main class="dashboard-main"><section class="welcome-banner"><div><p class="eyebrow">${admin ? 'إشراف واضح.. ودعم لكل حلقة' : 'خطوة صغيرة.. وأثر كبير'}</p><h1>${admin ? 'لوحة إدارة المدرسة القرآنية' : `أهلًا بك، ${esc(account.full_name)}`}</h1><p>${admin ? 'تابع التقييمات المعتمدة وفرسان الأسبوع والتكريم الفصلي.' : `حلقة ${esc(account.ring_name || "")} <bdi dir="ltr">${esc(account.class_name)}</bdi> · قيّم اجتهاد كل طالب وتقدمه مقارنة بنفسه.`}</p></div><div class="welcome-symbol" aria-hidden="true">✦</div></section>
    ${admin ? '' : toolbar + '<div id="teacher-save-indicator" class="teacher-save-indicator" role="status"></div><section id="teacher-home" hidden aria-label="ملخص عمل الحلقة"></section>'}
    ${admin ? `<div class="admin-workspace"><aside class="admin-sidebar"><div class="admin-sidebar-title"><span>✦</span><div><strong>مركز الإدارة</strong><small>متابعة الحلقات والتقارير</small></div></div><nav aria-label="أقسام الإدارة"><button data-view="reports"><span>▦</span> نظرة عامة</button><button data-view="evaluation"><span>✓</span> تقييم الحلقة</button><button data-view="champions"><span>★</span> فرسان الأسبوع</button><button data-view="khairkom"><span>◆</span> ترشيحات خيركم</button><button data-view="monthly"><span>▤</span> تقارير الحفظ الشهرية</button><button data-view="monthlyProgress"><span>◔</span> إنجاز التقارير الشهرية</button><button data-view="honors"><span>✦</span> التكريم الفصلي</button><button data-view="rosterRequests"><span>◷</span> طلبات الطلاب <b data-roster-request-count>0</b></button><button data-view="setup"><span>♧</span> قوائم الطلاب</button></nav><div class="admin-sidebar-note">في النظرة العامة اختر الأسبوع فقط؛ ولعرض طلاب حلقة افتح «تقييم الحلقة» ثم اختر المعلم.</div></aside><div class="admin-workspace-content">${toolbar}` : `<nav class="dashboard-actions" aria-label="أقسام لوحة التحكم"><button class="action-card home-card" data-view="home"><span class="action-symbol">⌂</span><span><strong>الرئيسية</strong><small>إنجازك وما تبقّى عليك</small></span><span class="action-arrow">←</span></button><button class="action-card blue-card" data-view="evaluation"><span class="action-symbol">✓</span><span><strong>التقييم الأسبوعي</strong><small>نقاط واضحة من ١٢</small></span><span class="action-arrow">←</span></button><button class="action-card gold-card" data-view="knight"><span class="action-symbol">★</span><span><strong>فارس الأسبوع</strong><small>احتفِ بالاجتهاد والتحسن</small></span><span class="action-arrow">←</span></button><button class="action-card purple-card" data-view="honors"><span class="action-symbol">✦</span><span><strong>التكريم الفصلي</strong><small>ثمرة رحلة الفصل الدراسي</small></span><span class="action-arrow">←</span></button><button class="action-card teal-card" data-view="monthly"><span class="action-symbol">▤</span><span><strong>التقرير الشهري</strong><small>مقدار الحفظ والمراجعة</small></span><span class="action-arrow">←</span></button><button class="action-card khairkom-card" data-view="khairkom"><span class="action-symbol">◆</span><span><strong>ترشيحات جمعية خيركم</strong><small>رشّح طلاب حلقتك</small></span><span class="action-arrow">←</span></button>${!manager ? '<button class="action-card roster-card" data-view="setup"><span class="action-symbol">♧</span><span><strong>طلاب حلقتي</strong><small>طلبات إضافة وحذف · تعديل الاسم</small></span><span class="action-arrow">←</span></button>' : ''}</nav>${manager ? '<div class="admin-tabs"><span>مشرف الطلاب · تقييمات الحلقات الأخرى تخص معلميها</span><button class="gold-button" data-view="champions">★ فرسان الأسبوع</button><button class="light-button" data-view="setup">إدارة قوائم الطلاب</button></div>' : ''}`}
    ${!admin && monthlyReader ? '<div class="admin-tabs"><button class="solid-button" data-view="monthlyReport">▤ استعراض التقارير الشهرية لجميع الحلقات</button><button class="light-button" data-view="monthlyProgress">◔ إنجاز التقارير الشهرية</button></div>' : ''}${!admin && nominationViewer ? '<div class="admin-tabs"><button class="solid-button" data-view="khairkomReport">◆ استعراض ترشيحات جميع المعلمين</button></div>' : ''}${!admin?'<div class="teacher-workspace-return" hidden><button class="solid-button" type="button" data-view="home">⌂ العودة للصفحة الرئيسية</button></div>':''}<div id="week-workflow" class="week-workflow" aria-live="polite"></div><div id="dashboard-message" class="dashboard-message" role="status" hidden></div><section id="dashboard-content" aria-live="polite"></section>
    ${admin ? '</div></div>' : ''}</main><footer class="dashboard-footer">مدارس الأندلس الأهلية · نحتفي بالتقدم والتحسن والإتقان</footer>
    <dialog id="dashboard-confirm" class="confirm-dialog"><h2></h2><p></p><div><button class="light-button" data-answer="cancel">العودة</button><button class="solid-button" data-answer="confirm">تأكيد</button></div></dialog></div><section id="report-preview" class="report-preview" hidden aria-label="معاينة التقرير"><div class="report-preview-toolbar"><strong>معاينة التقرير</strong><span>اختر «حفظ PDF» من نافذة الطباعة للحصول على الملف.</span><div><button type="button" id="report-print">حفظ PDF / طباعة</button><button type="button" id="report-close">إغلاق المعاينة</button></div></div><div id="report-preview-body"></div></section>`;

  const teacherAppearance = admin ? null : mountTeacherAppearance(root,repo);
  const content = root.querySelector('#dashboard-content');
  const dashboardIdentity = mountDashboardIdentity(root);
  const termSelect = root.querySelector('#term-select');
  const weekSelect = root.querySelector('#week-select');
  const teacherSelect = root.querySelector('#teacher-select');
  const dialog = root.querySelector('#dashboard-confirm');
  const reportPreview = root.querySelector('#report-preview');
  function updateToolbarVisibility() {
    if (!admin) {
      root.querySelector('[data-filter="week"]').hidden=!['home','evaluation','knight','champions'].includes(view);
      if (manager) root.querySelector('[data-filter="teacher"]').hidden=['monthlyReport','monthlyProgress','khairkomReport','champions'].includes(view);
      return;
    }
    const showTeacher = ['evaluation', 'monthly', 'honors', 'setup'].includes(view);
    const showWeek = ['reports', 'evaluation', 'champions'].includes(view);
    root.querySelector('[data-filter="term"]').hidden = ['reports','rosterRequests'].includes(view);
    root.querySelector('[data-filter="teacher"]').hidden = !showTeacher;
    root.querySelector('[data-filter="week"]').hidden = !showWeek;
    root.querySelector('.dashboard-toolbar').setAttribute('aria-label', view === 'reports' ? 'اختيار أسبوع المتابعة العامة' : 'مرشحات ' + (view === 'evaluation' ? 'تقييم الحلقة' : 'لوحة الإدارة'));
    root.querySelector('.dashboard-toolbar').dataset.overview = String(view === 'reports');
  }
  function renderWeekWorkflow() {
    const panel = root.querySelector('#week-workflow');
    if (!termId || !week) { panel.hidden = true; return; }
    const selectedOpen = weekOpen(week), relevantOpen = view === 'khairkom' ? khairkomOpen() : selectedOpen;
    panel.hidden = admin ? !['reports','evaluation','champions'].includes(view) : (relevantOpen || !['evaluation','knight','khairkom'].includes(view));
    if (admin) {
      panel.innerHTML = `<div><span class="week-workflow-icon">${selectedOpen?'◉':'⊘'}</span><div><strong>عمل المعلمين · الأسبوع ${weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week))}</strong><small>${selectedOpen?'مفتوح لجميع المعلمين: التقييم وفارس الأسبوع. ترشيحات خيركم تكليف الأسبوع الرابع فقط.':'مغلق لجميع المعلمين: لا يمكن حفظ تقييمات أو فارس الأسبوع. وتُغلق ترشيحات خيركم إذا كان هذا هو الأسبوع الجاري.'}</small></div></div><button class="week-toggle ${selectedOpen?'':'closed'}" type="button" id="toggle-week-workflow" role="switch" aria-checked="${selectedOpen}" aria-label="${selectedOpen?'إغلاق':'فتح'} عمل جميع المعلمين في هذا الأسبوع"><span class="week-toggle-track"><i></i></span><b>${selectedOpen?'مفتوح':'مغلق'}</b></button>`;
    } else if (!relevantOpen) {
      panel.innerHTML = `<div><span class="week-workflow-icon">⊘</span><div><strong>${view==='khairkom'?'ترشيحات خيركم متوقفة هذا الأسبوع':'هذا الأسبوع مغلق من الإدارة'}</strong><small>يمكنك قراءة البيانات المحفوظة، لكن الحفظ متوقف حتى تعيد الإدارة فتح الأسبوع.</small></div></div>`;
    }
  }
  function openReport(kind, oneTeacher = false, freshProgress = null) {
    if (kind === 'champions' ? !manager : kind === 'khairkom' ? !nominationViewer : kind === 'monthly' ? !monthlyReader : !admin) return;
    const common = { term: selectedTerm(), week, weekNumber: weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week)), weekEnd: weekEnd(week) };
    let markup;
    if (kind === 'weekly') markup = buildWeeklyReport({ ...common, teachers, overview, teacherUsername: oneTeacher ? teacherId : undefined });
    if (kind === 'khairkom') markup = buildKhairkomReport({ term: selectedTerm(), teachers:reportData().teachers, data:{...reportData(), rows:filteredNominations()}, filterLabel:nominationFilterLabel(nominationFilters,reportData().teachers) });
    if (kind === 'champions') markup = buildChampionsReport({ ...common, champions });
    if (kind === 'monthly') markup = buildMonthlyReport({term:selectedTerm(),label:monthLabel(month),teachers,data:monthlyOverview,teacherUsername:oneTeacher?teacherId:undefined});
    if (kind === 'progress') markup = buildTeacherProgressReport({ ...common, progress: freshProgress || adminProgress() });
    if (!markup) return;
    root.querySelector('#report-preview-body').innerHTML = markup;
    root.querySelector('#report-print').textContent = kind === 'champions' ? 'تحميل PDF · صفحة واحدة' : 'حفظ PDF / طباعة';
    root.querySelector('.report-preview-toolbar>span').textContent = kind === 'champions' ? 'ملف واحد بصفحة واحدة، بنفس التنسيق على الجوال والكمبيوتر.' : 'اختر «حفظ PDF» من نافذة الطباعة للحصول على الملف.';
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
  function confirm(title, text, yesLabel = 'تأكيد') {
    dialog.querySelector('[data-answer="confirm"]').textContent=yesLabel;
    dialog.querySelector('h2').textContent = title; dialog.querySelector('p').textContent = text;
    return new Promise(resolve => {
      const finish = answer => { dialog.close(); dialog.removeEventListener('click', click); dialog.removeEventListener('cancel', cancel); resolve(answer); };
      const click = event => { const answer = event.target.closest('[data-answer]'); if (answer) finish(answer.dataset.answer === 'confirm'); };
      const cancel = event => { event.preventDefault(); finish(false); };
      dialog.addEventListener('click', click); dialog.addEventListener('cancel', cancel); dialog.showModal();
    });
  }
  async function mayLeave() { return (!dirty && !honorDirty && !knightDirty && !monthlyDirty && !nominationDirty && !rosterDirty) || await confirm('تغييرات لم تُحفظ', 'هل تريد الانتقال وترك التغييرات غير المحفوظة؟'); }
  function updateSelectors() {
    termSelect.innerHTML = terms.length ? terms.map(term => `<option value="${esc(term.id)}">${esc(term.name)}${term.active ? '' : ' (مؤرشف)'}</option>`).join('') : '<option value="">لم تُحدد الفصول الدراسية بعد</option>';
    termSelect.value = termId;
    if (teacherSelect) { teacherSelect.innerHTML = teachers.map(row => `<option value="${esc(row.username)}">${esc(row.ring_name ? row.ring_name + " (" + row.class_name + ")" : row.class_name)} · ${esc(row.full_name)}</option>`).join(''); teacherSelect.value = teacherId; }
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    weekSelect.innerHTML = weeks.length ? weeks.map((day, i) => `<option value="${day}">الأسبوع ${weekNumber(selectedTerm(), i)} · ${dateLabel(day)} – ${dateLabel(weekEnd(day))}${day > today() ? ' (قادم)' : ''}</option>`).join('') : '<option value="">بانتظار تواريخ الفصل الدراسي</option>';
    const archived = [...new Set([...(overview?.reviews || []), ...context.reviews].filter(row=>row.term_id===termId && row.week_start<selectedTerm()?.starts_on).map(row=>row.week_start))].sort();
    if (archived.length) weekSelect.innerHTML += '<optgroup label="سجلات سابقة محفوظة">' + archived.map(day=>`<option value="${day}">سجل سابق · ${dateLabel(day)} – ${dateLabel(weekEnd(day))}</option>`).join('') + '</optgroup>';
    weekSelect.value = week; weekSelect.disabled = !weeks.length;
  }
  function loadScores() {
    scores = new Map(weekStudents().map(student => {
      const stored = context.evaluations.find(row => row.student_id === student.id && row.review_id === review()?.id);
      const row = stored ? Object.fromEntries(Object.keys(emptyScores(student.id)).map(key => [key, stored[key]])) : emptyScores(student.id);
      return [student.id, row];
    }));
    weeklyActiveStudent = '';
    weeklyStudentFilter = review()?.status === 'submitted' ? 'all' : 'pending';
    chosenKnight = review()?.knight_student_id || '';
    selectedHonors = new Set(context.honors.map(row => row.student_id)); dirty = false; honorDirty = false; knightDirty = false;
  }
  async function loadContext() {
    const ticket = ++generation;
    if (!admin) root.querySelector('#teacher-home').hidden = true;
    content.innerHTML = '<div class="empty-state"><span class="loading-ring"></span><h2>جارٍ تحميل بيانات الحلقة</h2></div>';
    try {
      const [access,requests] = await Promise.all([termId?repo.weekStates(termId):Promise.resolve([]),repo.rosterRequests()]);
      const data = teacherId ? await repo.context(teacherId, termId) : { students: [], reviews: [], evaluations: [], honors: [] };
      const report = admin && termId ? await repo.overview(termId) : null;
      const months = termMonths(selectedTerm());
      if (!months.includes(month)) month = months[0] || '';
      const monthly = teacherId && termId && month ? await repo.monthly(teacherId, termId, month) : { report: null, entries: [] };
      const monthsAccess = termId ? await repo.monthStates(termId) : [];
      const monthsOverview = monthlyReader && ['monthly','monthlyReport','monthlyProgress'].includes(view) && monthlyOverviewMode() && termId && month ? await repo.monthlyOverview(termId,month) : {reports:[],entries:[],students:[]};
      const gallery = manager && termId ? await repo.champions(termId, week) : [];
      const combined = nominationViewer && termId ? await repo.khairkomReport(termId) : null;
      const nominations = termId ? await repo.khairkom(termId) : { sets: [], rows: [], students: [] };
      if (ticket !== generation) return;
      rosterRequests=requests; rosterDirty=false; editingStudent=''; nominationReport = combined; context = data; overview = report; weekStates = access; monthlyData = monthly; monthStates=monthsAccess; monthlyOverview=monthsOverview; champions = gallery; khairkomData = nominations; nominatedStudents = new Map(nominations.rows.filter(row => row.teacher_username === teacherId).map(row => [row.student_id, [...(row.test_parts || [])]])); identityNumbers = new Map(nominations.rows.filter(row => row.teacher_username === teacherId).map(row => [row.student_id, row.identity_number || ''])); nominationDirty = false; loadScores(); loadMonthlyRows(); updateSelectors(); render();
    } catch (error) { if (ticket !== generation) return; content.innerHTML = '<div class="empty-state"><h2>تعذر تحميل البيانات</h2><p>اضغط تحديث البيانات للمحاولة مرة أخرى.</p></div>'; notify(errorText(error), true); }
  }
  function empty(title, text, symbol = '✦') { return `<div class="empty-state"><span class="empty-symbol">${symbol}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`; }
  function renderTeacherHome() {
    if (admin) return;
    const panel = root.querySelector('#teacher-home');
    panel.hidden = view !== 'home' || teacherId !== account.username || !selectedTerm();
    if (panel.hidden) return;
    const weeks = teacherWeeks(selectedTerm(),context,khairkomData.rows,account.username,today());
    const state = weeks.find(row => row.start === week);
    if (!state) { panel.hidden = true; return; }
    const open = weekOpen(week) && selectedTerm().active && !state.future;
    const task = (done,title,detail,target) => done&&!state.complete ? '' : `<li class="${done?'done':'pending'}"><span class="task-check" aria-hidden="true">${done?'✓':'○'}</span><div><strong>${title}</strong><span>${esc(detail)}</span></div>${!done&&open?`<button class="light-button" data-view="${target}">${target==='evaluation'?'استكمال التقييم':target==='knight'?'اختيار الفارس':'فتح الترشيحات'} ←</button>`:''}</li>`;
    const status = state.complete ? '✓ أنجزت مهام الأسبوع' : state.future ? 'الأسبوع لم يبدأ بعد' : !open ? 'الأسبوع مغلق · بيانات محفوظة' : 'أكمل مهام أسبوعك';
    panel.innerHTML = `<div class="teacher-home-grid"><article class="teacher-week-card ${state.complete?'complete':''}"><div class="teacher-week-heading"><div><p>متابعة حلقتك</p><h2>${state.label}</h2><span>${dateLabel(week)} – ${dateLabel(weekEnd(week))}</span></div><span class="teacher-week-emblem" aria-hidden="true">${state.complete?'✓':'✦'}</span></div><strong class="teacher-week-status">${status}</strong><div class="teacher-week-meter"><b>${state.percent}<small>٪</small></b><span>المهام المحفوظة: ${state.done} / ${state.taskCount}</span></div><div class="teacher-completion-track" role="progressbar" aria-label="إنجاز مهام الأسبوع المحفوظة" aria-valuenow="${state.percent}" aria-valuemin="0" aria-valuemax="100"><i style="width:${state.percent}%"></i></div><div class="teacher-week-badges"><span>${state.evaluation?'✓ التقييم محفوظ':'○ التقييم لم يُعتمد'}</span><span>${state.champion?'★ الفارس محفوظ':'○ الفارس لم يُختر'}</span></div><p class="teacher-persisted-note">الحالة مبنية على البيانات المحفوظة، وتبقى اختياراتك اليدوية للفارس كما هي.</p></article><article class="teacher-task-card"><p class="teacher-section-eyebrow">خطوتك التالية</p><h2>${state.complete?'أحسنت.. اكتمل المطلوب':'المطلوب منك الآن'}</h2><ul>${task(state.evaluation,'التقييم الأسبوعي',state.evaluation?`تم حفظ تقييم ${state.rated} طالبًا`:state.total?`${state.rated} من ${state.total} طالبًا بتقييم محفوظ · ${state.remaining} متبقٍ${state.remaining===0?' · يلزم اعتماد التقييم':''}`:'بانتظار إضافة طلاب الحلقة','evaluation')}${task(state.champion,'فارس الأسبوع',state.champion?state.championName:'اختر طالبًا بنفسك، ثم احفظ الاختيار','knight')}${state.khairkomRequired?task(state.khairkom,'ترشيحات جمعية خيركم',state.khairkom?'تم حفظ مرشح واحد على الأقل':'تكليف الأسبوع الرابع فقط','khairkom'):''}</ul>${!open&&!state.complete?'<p class="teacher-task-note">يمكنك استعراض المحفوظ. الإدخال متاح عندما يكون الأسبوع مفتوحًا وقد بدأ.</p>':''}</article></div>${state.champion?`<article class="teacher-home-champion"><span class="teacher-champion-star" aria-hidden="true">★</span><div><span>فارس ${state.label} · اختيارك المحفوظ</span><h3>${esc(state.championName)}</h3><p>${esc(teacher().ring_name || teacher().class_name)}${state.championNote?' · '+esc(state.championNote):''}</p></div><button class="gold-button" data-view="knight">${open?'تغيير الفارس':'عرض الفارس'} ←</button></article>`:''}<details class="teacher-week-history"><summary><span>سجل أسابيعك</span><small>الأسابيع المكتملة: ${weeks.filter(row=>row.complete).length} · اضغط للاستعراض</small></summary><div class="teacher-history-grid">${weeks.map(row=>`<button type="button" data-teacher-week="${row.start}" class="teacher-history-card ${row.complete?'complete':row.future?'upcoming':'pending'}" aria-current="${row.start===week?'date':'false'}"><strong>${row.label}</strong><span>${dateLabel(row.start)} – ${dateLabel(weekEnd(row.start))}</span><b>${row.complete?'✓ مكتمل':row.future?'◷ قادم':'○ غير مكتمل'}</b><small>${row.evaluation?'✓':'○'} التقييم · ${row.champion?'★':'○'} الفارس${row.khairkomRequired?' · '+(row.khairkom?'✓':'○')+' خيركم':''}</small></button>`).join('')}</div></details>`;
  }
  function updateTeacherSaveState() {
    if (admin) return;
    const node = root.querySelector('#teacher-save-indicator');
    if (!node) return;
    const pending = dirty || honorDirty || knightDirty || monthlyDirty || nominationDirty || rosterDirty;
    const state = busy?'saving':pending?'pending':'saved';
    node.dataset.state = state;
    node.textContent = busy?'◷ جارٍ تنفيذ طلبك…':pending?'● لديك تعديلات لم تُحفظ بعد':'✓ المعروض في ملخص الإنجاز هو المحفوظ فقط';
  }
  function render() {
    if (!admin && account.roster_manager && teacherId !== account.username && !['champions','setup','khairkomReport',...(monthlyReader?['monthlyReport','monthlyProgress']:[])].includes(view)) view = 'setup';
    teacherAppearance?.setView(view);
    const returnBar=root.querySelector('.teacher-workspace-return');if(returnBar)returnBar.hidden=view==='home';
    root.querySelector('.dashboard-shell').dataset.workspace = view;
    updateToolbarVisibility();
    renderWeekWorkflow();
    updateRosterRequestBadges();
    renderTeacherHome(); updateTeacherSaveState();
    root.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('selected', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); });
    if (view === 'setup') { renderSetup(); return; }
    if (view === 'rosterRequests' && admin) { renderRosterRequests(); return; }
    if (!termId) { content.innerHTML = empty('جاهزون لبدء الرحلة', 'ستظهر التقييمات بعد إضافة تواريخ الفصل الدراسي وقوائم الطلاب التي سترسلها الإدارة.'); return; }
    if (view === 'home') { content.replaceChildren(); return; }
    if (view === 'champions') { renderChampions(); return; }
    if (view === 'khairkomReport' && nominationViewer) { renderKhairkom(); return; }
    if (view === 'khairkom') { renderKhairkom(); return; }
    if (view === 'monthlyProgress' && monthlyReader) { renderMonthlyProgress(); return; }
    if (view === 'monthly' || view === 'monthlyReport' && monthlyReader) { renderMonthly(); return; }
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
    if (!readonly() && weeklyEntryComplete(student.id) && weeklyActiveStudent!==student.id) return `<article class="weekly-completed-card" data-student="${esc(student.id)}"><span class="weekly-done-icon" aria-hidden="true">✓</span><div><h3>${esc(student.full_name)}</h3><span>تم إدخال النقاط · بانتظار الحفظ الجماعي</span></div><strong>${total}<small> / ١٢</small></strong><button type="button" class="light-button" data-weekly-edit="${esc(student.id)}">تعديل النقاط</button></article>`;
    return `<article class="student-score-card" data-student="${esc(student.id)}"><header><span class="student-avatar" aria-hidden="true">${esc(student.full_name.trim().slice(0, 1))}</span><div><h3>${esc(student.full_name)}</h3><small>${student.source_class ? `الفصل الأصلي: <bdi dir="ltr">${esc(student.source_class)}</bdi>` : student.student_code && !/^(DOC17-|TRANSFER-)/.test(student.student_code) ? `رقم الطالب: ${esc(student.student_code)}` : student.active ? 'طالب الحلقة' : 'طالب مؤرشف · تقييم محفوظ'}</small></div><span class="total-badge">${total === null ? '—' : total}<small>/ ١٢</small></span></header><div class="score-groups">${SCORE_FIELDS.map(field => `<div class="score-group"><span id="label-${esc(student.id)}-${field.key}">${field.label}<small>${field.max} نقاط</small></span><div role="group" aria-labelledby="label-${esc(student.id)}-${field.key}">${Array.from({ length: field.max + 1 }, (_, n) => `<button type="button" class="point-chip" data-score="${field.key}" data-point="${n}" aria-pressed="${row[field.key] === n}" aria-label="${field.label}: ${n} نقاط" ${readonly() ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`).join('')}</div><div class="bonus-row"><label><input type="checkbox" data-bonus="bonus_memorization" ${row.bonus_memorization ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز الحفظ <b>+١</b></label><label><input type="checkbox" data-bonus="bonus_revision" ${row.bonus_revision ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز المراجعة <b>+١</b></label></div>${readonly()?'':'<p class="weekly-entry-note">اكتمال النقاط يُحتسب تلقائيًا. أضف التميز إن أردت؛ الحفظ مرة واحدة للجميع.</p>'}</article>`;
  }
  function updateWeeklyFilters() {
    const students = weekStudents(), editable = !readonly();
    const done = students.filter(student => weeklyEntryComplete(student.id)).length;
    const filters = root.querySelector('#weekly-student-filters');
    if (filters) filters.innerHTML = editable ? `<div class="weekly-filter-buttons" role="group" aria-label="عرض طلاب التقييم"><button type="button" data-weekly-filter="pending" aria-pressed="${weeklyStudentFilter==='pending'}">المتبقّون <b>${students.length-done}</b></button><button type="button" data-weekly-filter="done" aria-pressed="${weeklyStudentFilter==='done'}">تم إدخال نقاطهم <b>${done}</b></button><button type="button" data-weekly-filter="all" aria-pressed="${weeklyStudentFilter==='all'}">الجميع <b>${students.length}</b></button></div><p>اكتب النقاط فقط؛ تُختصر البطاقة تلقائيًا عند بدء طالب آخر. زر الحفظ واحد لجميع الطلاب.</p>` : '';
  }
  function renderWeeklyStudents(focusNext = false, editingId = '') {
    const students = weekStudents(), editable = !readonly();
    updateWeeklyFilters();
    const visible = students.filter(student => !editable || weeklyStudentFilter==='all' || (weeklyStudentFilter==='done' ? weeklyEntryComplete(student.id) : !weeklyEntryComplete(student.id) || weeklyActiveStudent===student.id));
    const grid = root.querySelector('#students-grid');
    grid.innerHTML = visible.length ? visible.map(scoreCard).join('') : `<div class="weekly-list-empty"><span aria-hidden="true">${weeklyStudentFilter==='pending'?'✓':'○'}</span><h3>${weeklyStudentFilter==='pending'?'انتهيت من إدخال نقاط جميع الطلاب':'لم يكتمل إدخال نقاط أي طالب بعد'}</h3><p>${weeklyStudentFilter==='pending'?'راجع المكتملين إذا احتجت، ثم اضغط «حفظ تقييم جميع الطلاب» لاعتماد النقاط.':'أدخل النقاط الأساسية الأربع؛ يظهر الطالب هنا تلقائيًا بعد اكتمالها.'}</p></div>`;
    if (focusNext) {
      const editingCard = editingId ? [...grid.querySelectorAll('[data-student]')].find(card=>card.dataset.student===editingId) : null;
      (editingCard?.querySelector('[data-score]:not(:disabled)') || grid.querySelector('[data-score]:not(:disabled),[data-weekly-edit]') || root.querySelector('#submit-week'))?.focus({preventScroll:true});
    }
  }
  function updateWeeklyActiveStudent(id, focusSelector) {
    const changed = weeklyActiveStudent!==id;
    weeklyActiveStudent=id;
    if (changed) {
      renderWeeklyStudents();
      const card=[...root.querySelectorAll('#students-grid [data-student]')].find(node=>node.dataset.student===id);
      card?.querySelector(focusSelector)?.focus({preventScroll:true});
    } else updateWeeklyFilters();
    updateProgress();
  }
  function renderEvaluation() {
    const students = weekStudents();
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">التقييم الأسبوعي</p><h2>طالبًا بعد طالب.. بخطوات أوضح</h2><p>أدخل النقاط مباشرة، وأضف نقاط التميز إن أردت. تُختصر بطاقة الطالب المكتمل عند بدء طالب آخر؛ احفظ الجميع مرة واحدة بعد الانتهاء.</p></div><span class="status-pill ${review()?.status === 'submitted' ? 'approved' : ''}">${review()?.status === 'submitted' ? '✓ أسبوع معتمد' : 'بانتظار الحفظ والاعتماد'}</span></div>
    <div class="evaluation-tools"><div id="rating-progress" class="progress-copy"></div><span class="help-pill">✓ الحفظ ٤ · المراجعة ٢ · التحسن ٢ · الالتزام ٢ · التميز ٢</span></div>
    <div id="weekly-student-filters" class="weekly-student-filters"></div><div class="students-grid" id="students-grid"></div>
    <div class="save-bar"><span id="save-state"></span><div>${readonly() ? (weekOpen(week) ? '<button class="gold-button" data-view="knight">اختيار فارس الأسبوع ★</button>' : '') + (admin && review()?.status === 'submitted' ? '<button class="light-button" id="reopen-week">إعادة فتح التقييم</button>' : '') : '<button class="solid-button" id="submit-week" ' + (week > today() || !students.length ? 'disabled title="الحفظ متاح بعد بداية الأسبوع"' : '') + '>✓ حفظ تقييم جميع الطلاب</button>'}</div></div>`;
    renderWeeklyStudents(); updateProgress();
  }
  function updateProgress() {
    const count = completeCount(), all = scores.size;
    const element = root.querySelector('#rating-progress');
    if (element) element.innerHTML = `<strong>${count} <small>من ${all} طالبًا</small></strong><span>اكتمل إدخال نقاطهم · متبقٍ ${all-count}</span><div class="progress-track"><i style="width:${all ? count / all * 100 : 0}%"></i></div>`;
    const status = root.querySelector('#save-state');
    if (status) status.textContent = !weekOpen(week) ? 'أغلقت الإدارة هذا الأسبوع؛ الحفظ متوقف.' : readonly() ? 'تم حفظ واعتماد تقييم الحلقة.' : dirty ? '● النقاط لم تُحفظ بعد؛ احفظ تقييم جميع الطلاب بعد الانتهاء.' : 'زر واحد لحفظ واعتماد نقاط جميع الطلاب.';
  }
  function renderKnight() {
    const current = review();
    const ranked = context.students.filter(student => student.active || student.id === current?.knight_student_id).map(student => ({student_id: student.id, full_name: student.full_name}));
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker gold-text">فارس الأسبوع</p><h2>نحتفي بالاجتهاد والتحسن</h2><p>اختر فارس الأسبوع بنفسك من طلاب الحلقة. لا يوجد اختيار تلقائي أو ترتيب بالنقاط.</p></div><span class="status-pill gold-status">${current?.knight_student_id ? '★ تم اختيار الفارس' : 'بانتظار اختيارك'}</span></div>
    <div class="knight-select-panel"><label for="knight-student">اختر فارس الأسبوع من طلاب حلقتك</label><select id="knight-student" ${!selectedTerm()?.active || !weekOpen(week) || week > today() ? 'disabled' : ''}><option value="">اختر الطالب…</option>${ranked.map(row=>`<option value="${esc(row.student_id)}" ${chosenKnight===row.student_id?'selected':''}>${esc(row.full_name)}</option>`).join('')}</select><p>اختيار يدوي من المعلم، ثم اضغط حفظ لتأكيد الاختيار.</p></div>
    ${current?.knight_student_id ? `<article class="saved-knight-card"><span class="saved-knight-medal">★</span><div><span>فارس الأسبوع ${weekNumber(selectedTerm(),termWeeks(selectedTerm()).indexOf(week))} · اختيار محفوظ</span><h3>${esc(ranked.find(row=>row.student_id===current.knight_student_id)?.full_name || 'فارس الحلقة')}</h3><p>${esc(teacher().ring_name || teacher().class_name)} · ${dateLabel(week)} – ${dateLabel(weekEnd(week))}</p>${current.knight_note?`<p class="saved-knight-note">${esc(current.knight_note)}</p>`:''}</div></article>` : ''}
    <div class="note-panel"><label for="knight-note">سبب اختيار فارس الأسبوع <small>(اختياري)</small></label><textarea id="knight-note" maxlength="500" placeholder="مثال: تحسن واضح في إتقان التسميع" ${!weekOpen(week)?'disabled':''}>${esc(current?.knight_note || '')}</textarea></div><div class="save-bar"><span>يحتفظ الطالب بميداليته تقديرًا لإنجازه.</span><div><button class="light-button" type="button" data-view="home">⌂ العودة للرئيسية</button><button class="gold-button" id="save-knight" ${!chosenKnight || !selectedTerm()?.active || !weekOpen(week) || week > today() ? 'disabled' : ''}>حفظ فارس الأسبوع ★</button></div></div>`;
  }
  const monthlyStudents = () => context.students.filter(student => student.active || monthlyData.entries.some(row => row.student_id === student.id));
  const monthOpen = () => monthStates.find(r=>r.month_start===month)?.is_open!==false;
  const monthlyReadonly = () => admin || ['monthlyReport','monthlyProgress'].includes(view) || !monthOpen() || !selectedTerm()?.active || teacherId !== account.username;
  function loadMonthlyRows() {
    monthlyRows = mergeMonthlyRoster(context.students, monthlyData.entries);
    monthlyDirty = false;
  }
  async function refreshMonthlyRoster() {
    const targetTeacher=teacherId,targetTerm=termId,targetMonth=month,preserve=monthlyDirty;
    const [fresh,saved,access,summary]=await Promise.all([repo.context(targetTeacher,targetTerm),preserve?Promise.resolve(monthlyData):repo.monthly(targetTeacher,targetTerm,targetMonth),repo.monthStates(targetTerm),monthlyReader&&monthlyOverviewMode()?repo.monthlyOverview(targetTerm,targetMonth):Promise.resolve(null)]);
    if(targetTeacher!==teacherId||targetTerm!==termId||targetMonth!==month)return false;
    context.students=fresh.students;monthlyData=saved;monthStates=access;if(summary)monthlyOverview=summary;
    monthlyRows=mergeMonthlyRoster(context.students,monthlyData.entries,preserve?[...monthlyRows.values()]:[]);
    render();return true;
  }
  const monthLabel = value => monthlyLabel(selectedTerm(),value);
  function monthlySection(student, kind, label) {
    const row=monthlyRows.get(student.id)[kind], r=row.range||{}, disabled=monthlyReadonly()?'disabled':'';
    const fields=(side,title)=>`<div class="monthly-range-end"><b>${title}</b><label>السورة<select data-monthly-range="${side}_surah" aria-label="سورة ${title}"><option value="">اختر السورة…</option>${SURAHS.map(s=>`<option value="${s.number}" ${r[side+'_surah']===s.number?'selected':''}>${s.number}. ${esc(s.name)}</option>`).join('')}</select></label><label>الآية<input type="number" inputmode="numeric" min="1" max="${SURAHS.find(s=>s.number===r[side+'_surah'])?.verses||286}" data-monthly-range="${side}_ayah" value="${r[side+'_ayah']||''}" placeholder="رقم الآية" aria-label="آية ${title}"></label></div>`;
    return `<section class="monthly-section ${kind}" data-monthly-section="${kind}"><h4>مقدار ${label}</h4><label class="none-choice"><input type="checkbox" data-monthly-none="${kind}" ${row.none?'checked':''} ${disabled}>لا يوجد ${label} خلال الشهر</label>${row.none?'<p class="zero-report">لا يوجد مقدار مسجّل لهذا الشهر.</p>':!row.range && row.text ? `<label>مقدار مسجّل سابقًا<textarea data-monthly-kind="${kind}" maxlength="1000" rows="3">${esc(row.text)}</textarea></label><p>يمكنك تعديل النص السابق دون فقد بياناته.</p>` : `<div class="monthly-range-grid">${fields('from','البداية')}${fields('to','النهاية')}</div><p class="monthly-range-summary" aria-live="polite">${esc(row.text||'اختر السور وأدخل أرقام الآيات؛ من ١ إلى عدد آيات السورة.')}</p>`}</section>`;
  }
  function monthlyReaderPicker() {
    return `<label class="monthly-reader-select">المعلم / الحلقة<select id="monthly-report-teacher">${teachers.map(t=>`<option value="${esc(t.username)}" ${t.username===teacherId?'selected':''}>${esc(t.full_name)} · ${esc(t.ring_name||t.class_name)}</option>`).join('')}</select></label>`;
  }
  function renderMonthlyProgress() {
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker teal-text">متابعة الشهر</p><h2>إنجاز التقارير الشهرية</h2><p>متابعة اكتمال التقارير وفتح الشهر أو إغلاقه. لقراءة مقادير الحفظ والمراجعة افتح تقارير الحفظ الشهرية.</p></div><button class="teal-button" data-view="${admin?'monthly':'monthlyReport'}">▤ عرض تقارير الحفظ</button></div><div class="monthly-toolbar"><label>الشهر<select id="month-select">${termMonths(selectedTerm()).map(value=>`<option value="${value}" ${month===value?'selected':''}>${monthLabel(value)}</option>`).join('')}</select></label><button class="light-button" id="refresh-monthly-roster">↻ تحديث الإنجاز</button></div>${monthWorkflow()}${monthlyAdminSummary()}`;
  }
  function monthlyAdminSummary() {
    const p=summarizeMonthlyTeachers(teachers,monthlyOverview);
    return `<section class="monthly-admin-summary"><div class="monthly-admin-hero"><div><span>متابعة إنجاز المعلمين</span><h2>${monthLabel(month)} · صورة واضحة لكل حلقة</h2><p>المعلم منتهي عند حفظ تقرير جميع طلابه، والغائب لا يمنع الاكتمال.</p></div><button class="teal-button" id="print-monthly-overview">▤ تقرير جميع المعلمين</button></div><div class="monthly-admin-stats"><article class="aqua"><span>نسبة إنجاز المعلمين</span><strong>${p.percent}%</strong><progress max="100" value="${p.percent}"></progress></article><article class="mint"><span>معلمون انتهوا</span><strong>${p.completed}</strong><small>من ${p.total} معلمًا لديهم طلاب</small></article><article class="amber"><span>لم ينتهوا بعد</span><strong>${p.remaining}</strong><small>تقارير جزئية أو لم تُحفظ</small></article><article class="lilac"><span>لم يرسلوا تقريرًا</span><strong>${p.pending}</strong><small>${p.empty?`${p.empty} حلقة بلا طلاب خارج نسبة الإنجاز`:'متابعة واضحة للشهر المختار'}</small></article></div><div class="monthly-cards-toolbar"><button type="button" class="light-button" id="toggle-monthly-teachers" aria-expanded="${monthlyCardsVisible}" aria-controls="monthly-teacher-cards">${monthlyCardsVisible?'⌃ إخفاء بطاقات المعلمين':'⌄ عرض بطاقات المعلمين'}</button><span>${p.rows.length} معلمًا · تفاصيل الإنجاز لكل حلقة</span></div><div id="monthly-teacher-cards" class="monthly-teacher-grid" ${monthlyCardsVisible?'':'hidden'}>${p.rows.map(t=>`<button type="button" class="monthly-teacher-status ${t.status} ${t.username===teacherId?'selected':''}" data-monthly-teacher="${esc(t.username)}"><span class="monthly-teacher-state">${t.status==='complete'?'✓ منتهٍ':t.status==='draft'?'◷ غير مكتمل':t.status==='empty'?'— بلا طلاب':'○ لم يبدأ'}</span><h3>${esc(t.full_name)}</h3><small>${esc(t.ring_name||t.class_name)}</small><strong>${t.percent}%</strong><progress max="100" value="${t.percent}"></progress><span>${t.completed} من ${t.total} طالبًا · عرض التقرير ←</span></button>`).join('')}</div></section>`;
  }
  function monthWorkflow() {
    return `<section class="month-workflow ${monthOpen()?'':'closed'}"><div><strong>${monthLabel(month)} · ${monthOpen()?'مفتوح أمام المعلمين':'مغلق من الإدارة'}</strong><p>${monthOpen()?'يمكن للمعلمين إدخال التقارير وحفظها وتعديلها.':'التقارير المحفوظة متاحة للعرض؛ الإدخال والحفظ متوقفان حتى إعادة فتح الشهر.'}</p></div>${admin?`<button type="button" class="week-toggle ${monthOpen()?'':'closed'}" id="toggle-month-workflow" role="switch" aria-checked="${monthOpen()}" aria-label="${monthOpen()?'إغلاق':'فتح'} الشهر أمام جميع المعلمين" ${selectedTerm()?.active?'':'disabled'}><span class="week-toggle-track"><i></i></span><b>${monthOpen()?'مفتوح':'مغلق'}</b></button>`:''}</section>`;
  }
  const monthlyFinished = id => monthlySavedComplete(monthlyRows.get(id),monthlyData.entries.find(row=>row.student_id===id));
  const monthlyFilteredStudents = () => monthlyStudents().filter(s=>monthlyStudentFilter==='all'||monthlyFinished(s.id)===(monthlyStudentFilter==='complete'));
  function monthlyStudentFilters(){
    const total=monthlyStudents().length,done=monthlyStudents().filter(s=>monthlyFinished(s.id)).length;
    return `<div class="monthly-student-filters" role="group" aria-label="عرض طلاب التقرير"><button type="button" data-monthly-filter="pending" aria-pressed="${monthlyStudentFilter==='pending'}">المتبقون <b>${total-done}</b></button><button type="button" data-monthly-filter="complete" aria-pressed="${monthlyStudentFilter==='complete'}">المكتملون <b>${done}</b></button><button type="button" data-monthly-filter="all" aria-pressed="${monthlyStudentFilter==='all'}">جميع الطلاب <b>${total}</b></button></div><p class="monthly-finish-hint">اضغط «تم الانتهاء من الطالب» لحفظ بياناته ونقله إلى المكتملين. البيانات غير المحفوظة تبقى ضمن المتبقين.</p>`;
  }
  function renderMonthly() {
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker teal-text">التقرير الشهري</p><h2>${monthlyOverviewMode()?'تقارير الحفظ والمراجعة الشهرية':'رحلة الحفظ والمراجعة'}</h2><p>${monthlyOverviewMode()?'اختر الشهر والمعلم لعرض مقدار حفظ ومراجعة كل طالب مباشرة، ثم اطبع تقرير الحلقة.':'اختر سورة البداية والنهاية وأرقام الآيات لكل طالب، أو اختر «لا يوجد». يمكنك تعديل التقرير بعد حفظه؛ وتظهر آخر نسخة محفوظة عند الإدارة.'}</p></div><span class="status-pill teal-status">${monthlyData.report ? monthlyData.report.status === 'draft' ? '◷ مسودة محفوظة · غير مكتملة' : '✓ تقرير مكتمل ومحفوظ' : monthlyOverviewMode()?'لم يُرسل تقرير':'تقرير جديد'}</span></div><div class="monthly-toolbar"><label>الشهر<select id="month-select">${termMonths(selectedTerm()).map(value => `<option value="${value}" ${month === value ? 'selected' : ''}>${monthLabel(value)}</option>`).join('')}</select></label>${monthlyOverviewMode()&&!admin?monthlyReaderPicker():''}${!monthlyReadonly() ? '<button class="teal-button" type="button" id="bulk-monthly" '+(!monthlyRows.size?'disabled':'')+'>⇄ تطبيق مقدار على عدة طلاب</button>' : ''}<button type="button" class="light-button" id="refresh-monthly-roster">↻ تحديث قائمة الطلاب</button><button class="light-button" id="print-monthly">▤ طباعة التقرير</button><span>${esc(teacher().full_name)} · ${esc(teacher().ring_name || teacher().class_name)}</span></div><div class="print-heading"><h2>التقرير الشهري — ${monthLabel(month)}</h2><p>${esc(teacher().full_name)} · ${esc(teacher().ring_name || teacher().class_name)}</p></div>${!monthlyOverviewMode()?monthWorkflow():''}${monthlyOverviewMode()?monthlyReadingHeading({teacher:teacher(),label:monthLabel(month)}):''}${!monthlyOverviewMode()?monthlyProgressCard():''}${monthlyReadonly() ? monthlyData.report ? monthlyTable() : empty('لم يُرسل تقرير هذا الشهر بعد', monthlyOverviewMode()?'لا يوجد تقرير محفوظ لهذه الحلقة في الشهر المختار.':monthOpen()?'سيظهر تقرير الحلقة هنا بعد حفظه بواسطة المعلم.':'هذا الشهر مغلق. يمكنك إعداد التقرير بعد أن تفتحه الإدارة.') : ` ${monthlyStudentFilters()}<div class="monthly-grid">${monthlyFilteredStudents().map(student => `<article class="monthly-card" data-monthly-student="${student.id}"><header><span class="student-avatar">${esc(student.full_name.slice(0, 1))}</span><h3>${esc(student.full_name)}</h3>${student.active ? '' : '<small>مؤرشف · تقرير محفوظ</small>'}</header><label class="monthly-absence"><input type="checkbox" data-monthly-absent ${monthlyAbsent(monthlyRows.get(student.id))?'checked':''}><span>غائب — لم يحضر</span></label>${monthlyAbsent(monthlyRows.get(student.id)) ? '<div class="monthly-absence-info">الطالب غائب؛ لا يُطلب له حفظ أو مراجعة، ولا يمنع اكتمال التقرير.</div>' : `${monthlySection(student, 'memorization', 'حفظ')}<button type="button" class="monthly-copy-button monthly-copy-revision" data-copy-revision="${student.id}">↓ نسخ الحفظ إلى المراجعة</button>${monthlySection(student, 'revision', 'مراجعة')}<label class="monthly-note">ملاحظة اختيارية<textarea data-monthly-note maxlength="500" rows="2" ${monthlyReadonly() ? 'disabled' : ''}>${esc(monthlyRows.get(student.id).note)}</textarea></label><button type="button" class="monthly-copy-button" data-copy-monthly="${student.id}">⇄ نسخ المقدار لطلاب آخرين</button>`}<button type="button" class="monthly-finish-button" data-finish-monthly="${student.id}" ${monthlyProblem(monthlyRows.get(student.id))?'disabled':''}>✓ تم الانتهاء من الطالب</button></article>`).join('') || (monthlyRows.size?empty(monthlyStudentFilter==='pending'?'اكتمل تقرير الشهر لجميع الطلاب 🎉':'لا يوجد طلاب مكتملون محفوظون بعد',monthlyStudentFilter==='pending'?'يمكنك عرض المكتملين والرجوع لتعديلهم ما دام الشهر مفتوحًا.':'أكمل بيانات الطالب واضغط «تم الانتهاء من الطالب» لحفظه.') : empty('لا توجد أسماء في الحلقة', 'أضف الطلاب قبل إعداد التقرير الشهري.'))}</div><div class="print-only">${monthlyTable()}</div>`}<div class="save-bar"><span id="monthly-save-state">${monthlyReadonly() ? 'اطلاع فقط · آخر نسخة محفوظة لدى المعلم' : monthlyDirty ? 'تغييرات لم تُحفظ بعد' : 'حفظ واحد لجميع طلاب الحلقة'}</span>${!monthlyReadonly() ? `<button class="teal-button" id="save-monthly" ${!monthlyRows.size ? 'disabled' : ''}>${monthlyData.report ? '✓ حفظ التعديلات' : '✓ حفظ التقرير الشهري'}</button>` : '<span>عرض تقرير الحلقة المحفوظ</span>'}</div>`;
  }
  function monthlyProgressCard(){
    const p=monthlyProgress(monthlyRows.values());
    return `<section class="monthly-progress" id="monthly-progress" aria-live="polite"><div><strong>اكتمال ${monthLabel(month)}</strong><b>${p.percent}%</b></div><progress max="100" value="${p.percent}" aria-label="نسبة اكتمال الشهر"></progress><p>${p.completed} من ${p.total} طالبًا مكتملًا · ${p.remaining} متبقي${monthlyDirty?' · تغييرات لم تُحفظ بعد':''}</p>${monthlyData.report?.status==='draft'?'<p>مسودة محفوظة غير منتهية — يمكنك العودة لاحقًا لاستكمال التقرير.</p>':''}</section>`;
  }
  function updateMonthlyProgress(){
    const old=root.querySelector('#monthly-progress');if(old)old.outerHTML=monthlyProgressCard();
    const filters=root.querySelector('.monthly-student-filters');if(filters)filters.outerHTML=monthlyStudentFilters().split('<p class="monthly-finish-hint">')[0];
    root.querySelectorAll('[data-finish-monthly]').forEach(button=>{button.disabled=!!monthlyProblem(monthlyRows.get(button.dataset.finishMonthly));});
  }
  function monthlyTable() {
    return buildMonthlyReadingTable({students:monthlyStudents(),rows:monthlyRows,className:teacher().class_name});
  }
  function nominationFilterControls(data, owners) {
    const classes = [...new Set(data.students.map(s=>s.source_class || owners.find(t=>t.username===s.teacher_username)?.class_name || '').filter(Boolean))].sort();
    return `<section class="nomination-filters"><div><h3>فلترة المرشحين</h3><p>${esc(nominationFilterLabel(nominationFilters,owners))}</p></div><div class="nomination-filter-fields"><label>المعلم<select data-nomination-filter="teacher"><option value="">جميع المعلمين</option>${owners.map(t=>`<option value="${esc(t.username)}" ${nominationFilters.teacher===t.username?'selected':''}>${esc(t.full_name)}</option>`).join('')}</select></label><label>الفصل<select data-nomination-filter="className"><option value="">جميع الفصول</option>${classes.map(c=>`<option ${nominationFilters.className===c?'selected':''}>${esc(c)}</option>`).join('')}</select></label><label>أجزاء الاختبار — يمكن اختيار أكثر من جزء<select multiple size="5" data-nomination-filter="parts">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${nominationFilters.parts.includes(i+1)?'selected':''}>الجزء ${i+1}</option>`).join('')}</select><small>على الكمبيوتر اضغط Ctrl أثناء اختيار أكثر من جزء.</small></label><label>مطابقة الأجزاء<select data-nomination-filter="mode"><option value="all" ${nominationFilters.mode==='all'?'selected':''}>جميع الأجزاء المحددة معًا</option><option value="any" ${nominationFilters.mode==='any'?'selected':''}>أي جزء من الأجزاء المحددة</option></select></label><button class="light-button" id="reset-nomination-filters">إلغاء الفلاتر</button></div></section>`;
  }
  function renderKhairkom() {
    if (admin || view === 'khairkomReport' && nominationViewer) {
      const data = reportData(), teachers = data.teachers;
      const rows = filteredNominations();
      const studentNames = new Map(data.students.map(student => [student.id, student]));
      const teacherNames = new Map(teachers.map(row => [row.username, row]));
      const nominatedTeachers = new Set(rows.map(row => row.teacher_username));
      const reviewedTeachers = new Set(data.sets.map(row => row.teacher_username));
      const reviewedCount = teachers.filter(row => reviewedTeachers.has(row.username)).length;
      const reviewedPercent = teachers.length ? Math.round(reviewedCount * 100 / teachers.length) : 0;
      const progressMarkup = '<section class="khairkom-progress"><div><span>إنجاز ترشيحات خيركم · مرة واحدة للفصل الدراسي</span><strong>' + reviewedPercent + '%</strong><p>' + reviewedCount + ' من ' + teachers.length + ' معلمًا راجعوا الترشيحات، بمن فيهم من أكد عدم وجود مرشحين.</p></div><span class="progress-track"><i style="width:' + reviewedPercent + '%"></i></span></section>' +
        '<div class="khairkom-teacher-list">' + teachers.map(row => {
          const done = reviewedTeachers.has(row.username), count = rows.filter(item => item.teacher_username === row.username).length;
          return '<article class="khairkom-teacher ' + (done ? 'done' : '') + '"><span>' + (done ? '✓' : '○') + '</span><strong>' + esc(row.full_name) + '</strong><small>' + esc(row.ring_name || row.class_name) + '</small><b>' + (done ? (count ? count + ' مرشح' : 'تمت المراجعة بلا ترشيحات') : 'لم يُنجز بعد') + '</b></article>';
        }).join('') + '</div>';
      content.innerHTML = `<div class="section-heading"><div><p class="section-kicker khairkom-text">جمعية خيركم</p><h2>تقرير المرشحين واختباراتهم</h2><p>ترشيحات جميع المعلمين للفصل الدراسي المحدد، مع رقم هوية الطالب والأجزاء التي سيُختبر فيها.</p></div><span class="status-pill khairkom-status">${rows.length} طالبًا · ${nominatedTeachers.size} معلمًا</span></div>
      ${nominationAdder && selectedTerm()?.active ? '<div class="nomination-add-toolbar"><span>أضف مرشحًا من قائمة الطلاب أو اكتب اسمه بنفسك.</span><button class="solid-button" id="add-supervised-nominee">＋ إضافة طالب للترشيحات</button></div>' : ''}
      ${admin ? progressMarkup : ''}
      ${nominationFilterControls(data,teachers)}
      <div class="admin-summary"><div><strong>${rows.length}</strong><span>طلاب مرشحون</span></div><div><strong>${nominatedTeachers.size}</strong><span>معلمون رشحوا طلابًا</span></div><div><strong>${teachers.length-reviewedCount}</strong><span>لم يراجعوا الترشيحات بعد</span></div></div>
      ${rows.length ? `<div class="monthly-table-wrap"><table class="monthly-report-table khairkom-table"><thead><tr><th>م</th><th>الطالب المرشح</th><th>الفصل</th><th>رقم الهوية</th><th>المعلم</th><th>أجزاء الاختبار</th></tr></thead><tbody>${rows.map((row,index)=>{const owner=teacherNames.get(row.teacher_username), student=studentNames.get(row.student_id);return `<tr><td>${index+1}</td><th scope="row">${esc(student?.full_name || 'طالب مؤرشف')}</th><td><bdi dir="ltr">${esc(student?.source_class || owner?.class_name || '—')}</bdi></td><td><bdi dir="ltr" class="khairkom-report-identity">${esc(row.identity_number || 'لم يُسجّل')}</bdi>${identityEditor ? `<button class="light-button" data-edit-nomination="${esc(row.set_id)}" data-nomination-student="${esc(row.student_id)}">تعديل المرشح</button>` : ''}</td><td>${esc(owner?.full_name || row.teacher_username)}</td><td><span class="khairkom-report-parts">${esc(formatTestParts(row.test_parts))}</span></td></tr>`;}).join('')}</tbody></table></div>` : empty('لا توجد نتائج مطابقة', 'غيّر الأجزاء أو المعلم أو الفصل، أو اضغط إلغاء الفلاتر لعرض جميع المرشحين.', '◆')}
      <div class="save-bar khairkom-report-bar"><span>التقرير مجمّع تلقائيًا من لوحات المعلمين.</span><div><button class="light-button" id="refresh-khairkom">↻ تحديث الترشيحات</button><button class="solid-button" id="print-khairkom">معاينة وحفظ PDF</button></div></div>`;
      return;
    }
    const ownSet = khairkomData.sets.find(row => row.teacher_username === teacherId);
    const students = context.students.filter(student => student.active || nominatedStudents.has(student.id));
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker khairkom-text">جمعية خيركم</p><h2>اختر المرشح وأجزاء اختباره</h2><p>رشّح الطالب، واكتب رقم هويته، ثم أضف الأجزاء التي سيُختبر فيها من الجزء ١ إلى ٣٠. يمكن تعديل البيانات قبل الحفظ.</p></div><span class="status-pill khairkom-status">${nominatedStudents.size} مرشح</span></div>
    ${students.length ? `<div class="khairkom-list">${students.map(student=>{const chosen=nominatedStudents.has(student.id), parts=nominatedStudents.get(student.id) || [];return `<article class="khairkom-student ${chosen?'chosen':''}" data-khairkom-student="${esc(student.id)}"><label class="khairkom-choice"><input type="checkbox" data-khairkom-choice ${chosen?'checked':''} ${!selectedTerm()?.active||!khairkomOpen()?'disabled':''}><span><strong>${esc(student.full_name)}</strong><small>${esc(student.source_class || teacher().class_name)} · ${chosen?'✓ مرشح لجمعية خيركم':'اختر للترشيح'}</small></span></label><div class="khairkom-part-panel"><label class="khairkom-identity-label">رقم هوية الطالب<input type="text" data-khairkom-identity inputmode="numeric" dir="ltr" autocomplete="off" maxlength="25" placeholder="اكتب رقم الهوية" aria-label="رقم هوية الطالب ${esc(student.full_name)}" value="${esc(identityNumbers.get(student.id) || '')}" ${chosen&&selectedTerm()?.active&&khairkomOpen()?'':'disabled'}><small>٦ إلى ٢٠ رقمًا · يمكن الكتابة بالأرقام العربية أو الإنجليزية</small></label><label>أجزاء الاختبار<div class="khairkom-part-picker"><select data-khairkom-part-select aria-label="اختر جزءًا للطالب ${esc(student.full_name)}" ${chosen&&selectedTerm()?.active&&khairkomOpen()?'':'disabled'}><option value="">اختر الجزء</option>${Array.from({length:30},(_,i)=>`<option value="${i+1}">الجزء ${new Intl.NumberFormat('ar-EG').format(i+1)}</option>`).join('')}</select><button type="button" class="khairkom-add-part" data-khairkom-add-part ${chosen&&selectedTerm()?.active&&khairkomOpen()?'':'disabled'}>+ إضافة الجزء</button></div></label><div class="khairkom-parts" aria-label="الأجزاء المختارة">${parts.map(part=>`<span class="khairkom-part-chip">الجزء ${new Intl.NumberFormat('ar-EG').format(part)}<button type="button" data-khairkom-remove-part="${part}" aria-label="حذف الجزء ${part}" ${!selectedTerm()?.active||!khairkomOpen()?'disabled':''}>×</button></span>`).join('') || '<span class="khairkom-part-empty">لم تختر أجزاء بعد</span>'}</div></div></article>`;}).join('')}</div>` : empty('لا توجد أسماء طلاب في حلقتك', 'ستظهر أسماء الطلاب هنا بعد إضافة قائمة الحلقة.', '◆')}
    <div class="save-bar"><span id="khairkom-save-state" aria-live="polite">${ownSet?(nominatedStudents.size?'✓ لديك '+nominatedStudents.size+' ترشيحات محفوظة · يمكنك تعديلها':'✓ تمت مراجعة الترشيحات بلا مرشحين'):'لم تُراجع الترشيحات بعد'}</span><button class="solid-button" id="save-khairkom" ${!students.length||!selectedTerm()?.active||!khairkomOpen()?'disabled':''}>${nominatedStudents.size?'✓ حفظ ترشيحات جمعية خيركم':'✓ تمت المراجعة بلا ترشيحات'}</button></div>
    ${nominationSaveReceipt?.teacher === teacherId && nominationSaveReceipt?.term === termId && !nominationDirty ? `<div class="khairkom-save-confirmation" role="status"><strong>✓ تم الحفظ بنجاح</strong><span>${nominationSaveReceipt.count ? 'تم حفظ '+nominationSaveReceipt.count+' طلاب مرشحين، مع أرقام الهوية وأجزاء الاختبار.':'تم تسجيل مراجعة الترشيحات بلا مرشحين.'} الترشيحات متاحة في تقرير الإدارة.</span></div>` : ''}`;
  }
  function updateKhairkomParts(card) {
    nominationSaveReceipt = null; content.querySelector('.khairkom-save-confirmation')?.remove();
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
    const progress = adminProgress();
    if (!progress.khairkomRequired && progressFocus === 'khairkom') progressFocus = 'weekly';
    const focus = progressFocus;
    const labels = { weekly: 'إنجاز الأسبوع كاملًا', evaluation: 'التقييم الأسبوعي', champion: 'فارس الأسبوع', khairkom: 'ترشيحات خيركم' };
    const descriptions = { weekly: progress.khairkomRequired ? 'التقييم والفارس وترشيح طالب للجمعية' : 'اعتماد التقييم واختيار الفارس معًا', evaluation: 'اعتماد نقاط جميع طلاب الحلقة', champion: 'اختيار يدوي محفوظ من المعلم', khairkom: 'ترشيح طالب واحد على الأقل في الأسبوع الرابع' };
    const cardTypes = [['weekly','✦'],['evaluation','✓'],['champion','★'],...(progress.khairkomRequired ? [['khairkom','◆']] : [])];
    const cards = cardTypes.map(([key,icon]) => {
      const done = progress.completed[key], percent = progress.percent[key];
      return '<button type="button" class="progress-summary-card progress-' + key + (focus === key ? ' selected' : '') + '" data-progress-focus="' + key + '" aria-pressed="' + (focus === key) + '">' +
        '<span class="progress-summary-icon">' + icon + '</span><span class="progress-summary-title">' + labels[key] + '</span><strong>' + percent + '%</strong>' +
        '<small>' + done + ' من ' + progress.total + ' معلمًا · ' + descriptions[key] + '</small>' +
        '<span class="progress-track"><i style="width:' + percent + '%"></i></span><span class="progress-summary-link">عرض حالة المعلمين ←</span></button>';
    }).join('');
    const rows = progress.rows.map(row => {
      const done = focus === 'weekly' ? row.weeklyComplete : row[focus];
      return '<article class="progress-teacher-row ' + (done ? 'complete' : 'pending') + '">' +
        '<span class="progress-teacher-avatar">' + esc(row.full_name.slice(0, 1)) + '</span>' +
        '<div class="progress-teacher-name"><strong>' + esc(row.full_name) + '</strong><small>' + esc(row.ring_name || row.class_name) + '</small></div>' +
        '<div class="progress-teacher-checks"><span class="' + (row.evaluation ? 'done' : '') + '">✓ التقييم: ' + (row.evaluation ? 'معتمد' : 'لم يُعتمد') + '</span>' +
        '<span class="' + (row.champion ? 'done' : '') + '">★ الفارس: ' + (row.champion ? 'اختير' : 'لم يُختر') + '</span>' +
        '<span class="' + (row.khairkom && progress.khairkomRequired ? 'done' : '') + '">◆ خيركم: ' + (progress.khairkomRequired ? (row.khairkom ? row.nominations + ' مرشح' : 'لم يُرشَّح') : 'غير مطلوب') + '</span></div>' +
        '<span class="progress-teacher-state ' + (done ? 'done' : '') + '">' + (done ? '✓ أنجز المطلوب' : 'بانتظار الإنجاز') + '</span>' +
        '<button type="button" class="progress-teacher-link" data-teacher-report="' + esc(row.username) + '">تقييم الطلاب ←</button></article>';
    }).join('');
    content.innerHTML = '<section class="progress-hero"><div><span>متابعة مباشرة · الأسبوع ' + weekNumber(selectedTerm(), termWeeks(selectedTerm()).indexOf(week)) + '</span><h2>كل ما تحتاج متابعته، في مكان واحد</h2><p>اختر بطاقة لمعرفة من أنجز المطلوب ومن لا يزال ينتظره. تُحدّث الأرقام من الحفظ الفعلي في لوحات المعلمين.</p></div><span class="progress-hero-week">' + dateLabel(week) + ' – ' + dateLabel(weekEnd(week)) + '</span></section>' +
      `<button class="roster-request-alert" data-view="rosterRequests">◷ طلبات إضافة وحذف الطلاب <b>${rosterRequests.filter(r=>r.status==='pending').length}</b> بانتظار مراجعتك ←</button>` +
      '<div class="progress-report-action"><button type="button" id="preview-teacher-progress"><span aria-hidden="true">▤</span> تحميل تقرير إنجاز المعلمين PDF</button><button type="button" class="champions-download" id="download-champions"><span aria-hidden="true">★</span> تحميل فرسان الأسبوع PDF</button></div>' +
      '<div class="progress-summary-grid' + (progress.khairkomRequired ? '' : ' three-cards') + '">' + cards + '</div>' +
      '<section class="progress-details"><div class="progress-details-heading"><div><span>تقرير إنجاز المعلمين</span><h3>' + labels[focus] + '</h3><p>' + descriptions[focus] + ' · أنجز ' + progress.completed[focus] + ' من أصل ' + progress.total + ' معلمًا.</p></div><span class="progress-details-percent">' + progress.percent[focus] + '%</span></div>' +
      '<div class="progress-teacher-list">' + (rows || '<p class="progress-empty">لا توجد حسابات معلمين نشطة.</p>') + '</div></section>' +
      '<div class="report-intro"><div><strong>التقرير الأسبوعي المجمّع</strong><span>جميع المعلمين في ملف واحد، مع قسم لكل حلقة وتفاصيل تقييم طلابها.</span></div><button class="solid-button" id="preview-weekly-all">معاينة وحفظ PDF</button></div>';
  }
  const requestKind={add:'إضافة طالب',archive:'حذف من الحلقة',restore:'استعادة طالب'};
  const requestStatus={pending:'◷ بانتظار موافقة الإدارة',approved:'✓ تمت الموافقة',rejected:'× تم الرفض'};
  function requestCard(req,decide=false){
    const owner=teachers.find(t=>t.username===req.teacher_username);
    const date=new Date(req.created_at),when=Number.isFinite(date.getTime())?new Intl.DateTimeFormat('ar-EG',{day:'numeric',month:'short',hour:'numeric',minute:'2-digit',timeZone:'Asia/Riyadh'}).format(date):'';
    return `<article class="roster-request-card request-${esc(req.status)}" data-roster-request="${esc(req.id)}"><header><span class="roster-kind kind-${esc(req.kind)}">${requestKind[req.kind]||'طلب طالب'}</span><strong>${requestStatus[req.status]||''}</strong></header><h3>${esc(req.student_name)}</h3><p>${esc(owner?.full_name||req.teacher_username)} · <bdi dir="auto">${esc(req.source_class||owner?.class_name||'')}</bdi></p><small>أُرسل ${esc(when)}</small>${req.admin_note?`<p class="roster-admin-note">ملاحظة الإدارة: ${esc(req.admin_note)}</p>`:''}${decide&&req.status==='pending'?`<label>ملاحظة الإدارة (اختياري)<textarea data-roster-note maxlength="500" rows="2" placeholder="تظهر الملاحظة للمعلم"></textarea></label><div class="roster-decision-actions"><button type="button" class="teal-button" data-roster-decision="approve" data-request-id="${esc(req.id)}">✓ موافقة وتنفيذ</button><button type="button" class="roster-archive-button" data-roster-decision="reject" data-request-id="${esc(req.id)}">× رفض الطلب</button></div>`:''}</article>`;
  }
  function teacherRequestHistory(){
    const pending=rosterRequests.filter(r=>r.status==='pending'),history=rosterRequests.filter(r=>r.status!=='pending');
    return `<section class="roster-request-section"><h3>طلباتك لدى الإدارة <b>${pending.length} معلّق</b></h3><p>الإضافة والحذف والاستعادة لا تُنفّذ قبل الموافقة.</p><div class="roster-request-grid">${pending.map(r=>requestCard(r)).join('')||'<p>لا توجد طلبات معلّقة.</p>'}</div>${history.length?`<details class="roster-request-history"><summary>سجل الطلبات التي تمت مراجعتها (${history.length})</summary><div class="roster-request-grid">${history.map(r=>requestCard(r)).join('')}</div></details>`:''}</section>`;
  }
  function renderRosterRequests(){
    const counts={pending:0,approved:0,rejected:0};for(const req of rosterRequests)counts[req.status]++;
    const labels={pending:'بانتظار المراجعة',approved:'تمت الموافقة',rejected:'مرفوضة',all:'جميع الطلبات'};
    const rows=rosterRequests.filter(r=>requestFilter==='all'||r.status===requestFilter);
    content.innerHTML=`<div class="section-heading"><div><p class="section-kicker">مراجعة الإدارة</p><h2>طلبات إضافة وحذف الطلاب</h2><p>راجع طلبات جميع المعلمين. الموافقة تنفّذ التغيير مباشرة، والرفض يحتفظ بالقائمة كما هي. تبقى التقييمات والتقارير محفوظة عند الحذف.</p></div><span class="status-pill">${counts.pending} طلبًا معلّقًا</span></div><div class="roster-request-filters" role="group" aria-label="حالة طلبات الطلاب">${Object.entries(labels).map(([key,label])=>`<button type="button" data-request-filter="${key}" aria-pressed="${requestFilter===key}">${label} <b>${key==='all'?rosterRequests.length:counts[key]}</b></button>`).join('')}</div><div class="roster-request-grid">${rows.map(r=>requestCard(r,true)).join('')||empty('لا توجد طلبات في هذه القائمة','تظهر طلبات المعلمين هنا عند إرسالها.')}</div>`;
  }
  function updateRosterRequestBadges(){
    root.querySelectorAll('[data-roster-request-count],.roster-request-alert b').forEach(node=>node.textContent=rosterRequests.filter(r=>r.status==='pending').length);
  }
  async function pollRosterRequests(){
    if(dashboardClosed||rosterPolling||busy||document.visibilityState==='hidden'||dialog.open)return;
    rosterPolling=true;const ticket=generation;
    try{
      const fresh=await repo.rosterRequests();
      if(dashboardClosed||ticket!==generation||busy||dialog.open||JSON.stringify(fresh)===JSON.stringify(rosterRequests))return;
      rosterRequests=fresh;updateRosterRequestBadges();
      if(view==='setup'&&!rosterDirty)await loadContext();
      else if(view==='rosterRequests'&&admin&&![...root.querySelectorAll('[data-roster-note]')].some(n=>n.value.trim()))renderRosterRequests();
    }catch{/* Keep the displayed data and retry without interrupting entered work. */}
    finally{rosterPolling=false;}
  }
  function renderSetup() {
    if (!canManageRoster()) { content.innerHTML=empty('غير متاح','يمكنك إدارة طلاب حلقتك فقط.'); return; }
    const active=context.students.filter(s=>s.active), archived=context.students.filter(s=>!s.active);
    const studentRow=student=>{
      const pending=rosterRequests.find(r=>r.student_id===student.id&&r.status==='pending');
      return `<div class="roster-row"><span><strong>${esc(student.full_name)}</strong><small>${esc(student.source_class || teacher().class_name || '')}${student.active?'':' · مؤرشف'}</small>${pending?'<small class="roster-pending-label">◷ طلب '+(pending.kind==='archive'?'حذف':'استعادة')+' بانتظار الإدارة</small>':''}</span><div><button type="button" class="light-button" data-edit-student="${esc(student.id)}">${admin?'تعديل / نقل':'تعديل الاسم'}</button><button type="button" class="${student.active?'roster-archive-button':'teal-button'}" data-archive-student="${esc(student.id)}" ${pending&&!admin?'disabled':''}>${admin?(student.active?'أرشفة الطالب':'استعادة الطالب'):(student.active?'طلب حذف الطالب':'طلب استعادة الطالب')}</button></div></div>`;
    };
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">إدارة الطلاب</p><h2>${manager?'الطلاب والفصول الدراسية':'طلاب حلقتي'}</h2><p>${admin?'اختر الحلقة لإدارة الطلاب مع الاحتفاظ بالتقارير السابقة.':'أرسل طلب إضافة أو حذف أو استعادة للإدارة. قائمة الطلاب لا تتغير قبل الموافقة. يمكنك تعديل الاسم مباشرة.'}</p></div><span class="status-pill">${active.length} طالبًا نشطًا</span></div><div class="setup-grid">${admin ? `<form id="term-form" class="setup-card"><h3>إضافة فصل دراسي</h3><label>اسم الفصل الدراسي<input name="name" maxlength="100" required placeholder="مثال: الفصل الدراسي الأول"></label><div class="date-fields"><label>تاريخ البداية<input name="starts_on" type="date" required></label><label>تاريخ النهاية<input name="ends_on" type="date" required></label></div><button class="solid-button" type="submit">حفظ الفصل الدراسي</button></form>` : ''}<form id="students-form" class="setup-card"><h3>＋ إضافة طلاب للحلقة ${esc(teacher().class_name || '')}</h3><p>اكتب اسم الطالب، أو عدة أسماء كل اسم في سطر. يمكنك إضافة رقم الطالب بعد علامة | لتمييز الأسماء المتشابهة.</p><label>أسماء الطلاب<textarea name="names" required rows="4" placeholder="اسم الطالب الأول&#10;اسم الطالب الثاني"></textarea></label><button class="solid-button" type="submit" ${!teacherId ? 'disabled' : ''}>${admin?'＋ حفظ الطلاب في الحلقة':'＋ إرسال طلبات الإضافة'}</button></form>${studentEditor()}</div>${!admin?teacherRequestHistory():''}<section class="roster-summary"><h3>طلاب الحلقة (${active.length})</h3><div>${active.map(studentRow).join('') || '<p>لا يوجد طلاب نشطون في الحلقة حاليًا.</p>'}</div></section>${archived.length?`<details class="roster-archive"><summary>الطلاب المؤرشفون (${archived.length}) · عرض واستعادة</summary><div>${archived.map(studentRow).join('')}</div></details>`:''}`;
  }
  function studentEditor() {
    const student=context.students.find(row=>row.id===editingStudent);
    if (!student) return '';
    return `<form id="student-edit-form" class="setup-card roster-editor"><h3>تعديل ${esc(student.full_name)}</h3><label>اسم الطالب<input name="full_name" maxlength="150" required value="${esc(student.full_name)}"></label>${admin?`<label>المعلم / الحلقة<select name="teacher">${teachers.map(row=>`<option value="${esc(row.username)}" ${row.username===student.teacher_username?'selected':''}>${esc(row.ring_name ? row.ring_name + " (" + row.class_name + ")" : row.class_name)} · ${esc(row.full_name)}</option>`).join('')}</select></label><p>عند النقل تظل التقييمات السابقة محفوظة لدى الحلقة السابقة، وتبدأ المتابعة في الحلقة الجديدة.</p>`:`<p>حلقتي: <bdi dir="auto">${esc(teacher().class_name)}</bdi></p>`}<div class="roster-editor-actions"><button class="solid-button" type="submit">حفظ التعديل</button><button class="light-button" type="button" id="cancel-student-edit">إلغاء</button></div></form>`;
  }
  async function writeStudent(student,name,active,targetTeacher=student.teacher_username) {
    const saved=manager?await repo.manageStudent({p_id:student.id,p_name:name,p_teacher:targetTeacher,p_active:active}):await repo.manageOwnStudent({p_id:student.id,p_name:name,p_active:active});
    if (!saved?.id || saved.full_name!==name.trim() || saved.active!==active || saved.teacher_username!==targetTeacher) throw new Error('تعذر تأكيد حفظ بيانات الطالب. حدّث القائمة قبل إعادة المحاولة.');
    return saved;
  }
  async function action(work, success) {
    if (busy) return;
    busy = true; updateTeacherSaveState(); root.classList.add('is-busy'); root.setAttribute('aria-busy', 'true');
    try { await work(); if (success) notify(success); } catch (error) { notify(errorText(error), true); }
    finally { busy = false; updateTeacherSaveState(); root.classList.remove('is-busy'); root.removeAttribute('aria-busy'); }
  }
  function openMonthlyBulk(sourceId=null) {
    const source=sourceId?monthlyRows.get(sourceId):null;
    if(sourceId&&(!source||monthlyAbsent(source)||monthlyProblem(source))){notify('أكمل مقدار الحفظ والمراجعة للطالب أولًا، أو اختر «لا يوجد».',true);return;}
    const targets=monthlyStudents().filter(s=>s.id!==sourceId&&!monthlyAbsent(monthlyRows.get(s.id))),sourceName=monthlyStudents().find(s=>s.id===sourceId)?.full_name;
    if(!targets.length){notify('لا يوجد طلاب آخرون في الحلقة لنسخ المقدار إليهم.',true);return;}
    const modal=document.createElement('dialog');modal.className='monthly-bulk-dialog';modal.setAttribute('aria-label','تطبيق مقدار على عدة طلاب');
    const rangeFields=(kind,title)=>`<section data-bulk-section="${kind}" ${kind==='revision'?'hidden':''}><h3>مقدار ${title}</h3><div class="monthly-range-grid">${['from','to'].map(side=>`<div class="monthly-range-end"><b>${side==='from'?'البداية':'النهاية'}</b><label>السورة<select data-bulk-range="${side}_surah" aria-label="سورة ${side==='from'?'البداية':'النهاية'}"><option value="">اختر السورة…</option>${SURAHS.map(s=>`<option value="${s.number}">${s.number}. ${esc(s.name)}</option>`).join('')}</select></label><label>الآية<input type="number" min="1" max="286" inputmode="numeric" data-bulk-range="${side}_ayah" aria-label="آية ${side==='from'?'البداية':'النهاية'}" placeholder="رقم الآية"></label></div>`).join('')}</div></section>`;
    modal.innerHTML=`<form><header><span>⇄ إدخال جماعي</span><h2>مقدار واحد.. لعدة طلاب</h2><p>حدّد الطلاب وأدخل المقدار. يمكنك مراجعة بطاقاتهم وتعديلها قبل حفظ التقرير.</p></header><label class="bulk-kind-label">المقدار المطلوب<select id="bulk-monthly-kind"><option value="memorization">الحفظ فقط</option><option value="revision">المراجعة فقط</option><option value="both">الحفظ والمراجعة</option></select></label><div class="bulk-selection-heading"><label><input type="checkbox" id="bulk-monthly-all"> تحديد الكل</label><strong id="bulk-selected-count">٠ طلاب محددين</strong></div><div class="bulk-students">${targets.map(s=>`<label><input type="checkbox" name="bulk-student" value="${esc(s.id)}">${esc(s.full_name)}</label>`).join('')}</div>${rangeFields('memorization','الحفظ')}${rangeFields('revision','المراجعة')}<p class="bulk-error" role="alert"></p><footer><button type="button" class="light-button" data-bulk-cancel>العودة</button><button type="submit" class="teal-button">تطبيق على الطلاب المحددين</button></footer><p class="bulk-footnote">التطبيق يملأ البطاقات فقط. احفظ التقرير بعد مراجعتها.</p></form>`;
    modal.querySelectorAll('[name="bulk-student"]').forEach(c=>{if(c.value===sourceId)c.closest('label').remove();});
    if(source){
      modal.setAttribute('aria-label','نسخ المقدار لطلاب آخرين');modal.querySelector('h2').textContent='نسخ المقدار لطلاب آخرين';modal.querySelector('header p').textContent=`مقدار الطالب: ${sourceName}. حدّد الطلاب الذين تريد تطبيق الحفظ والمراجعة عليهم.`;
      modal.querySelector('.bulk-kind-label').hidden=true;modal.querySelector('#bulk-monthly-kind').value='both';modal.querySelectorAll('[data-bulk-section]').forEach(s=>s.remove());
      const summary=document.createElement('div');summary.className='monthly-copy-summary';summary.innerHTML=`<h3>المقدار الذي سيتم نسخه</h3>${[['memorization','الحفظ'],['revision','المراجعة']].map(([kind,label])=>`<p><strong>${label}:</strong> ${source[kind].none?'لا يوجد':esc(source[kind].text)}</p>`).join('')}`;modal.querySelector('.bulk-error').before(summary);
    }
    modal.querySelectorAll('[data-bulk-section=revision] input,[data-bulk-section=revision] select').forEach(f=>f.disabled=true);document.body.append(modal);modal.showModal();
    const close=()=>{modal.close();modal.remove();};modal.addEventListener('cancel',e=>{e.preventDefault();close();});modal.querySelector('[data-bulk-cancel]').onclick=close;
    let applying=false;
    modal.addEventListener('change',e=>{
      if(e.target.id==='bulk-monthly-kind'){const mode=e.target.value;modal.querySelectorAll('[data-bulk-section]').forEach(s=>{s.hidden=mode!=='both'&&mode!==s.dataset.bulkSection;s.querySelectorAll('input,select').forEach(f=>f.disabled=s.hidden);});}
      if(e.target.id==='bulk-monthly-all')modal.querySelectorAll('[name="bulk-student"]').forEach(c=>c.checked=e.target.checked);
      const count=modal.querySelectorAll('[name="bulk-student"]:checked').length,total=targets.length,all=modal.querySelector('#bulk-monthly-all');all.checked=count===total;all.indeterminate=count>0&&count<total;modal.querySelector('#bulk-selected-count').textContent=`${count} طالبًا محددًا`;
      if(e.target.dataset.bulkRange?.endsWith('surah')){const side=e.target.dataset.bulkRange.split('_')[0];e.target.closest('[data-bulk-section]').querySelector(`[data-bulk-range="${side}_ayah"]`).max=SURAHS.find(s=>s.number===Number(e.target.value))?.verses||286;}
    });
    modal.querySelector('form').addEventListener('submit',async e=>{
      e.preventDefault();if(applying)return;
      const error=modal.querySelector('.bulk-error'),button=modal.querySelector('[type="submit"]'),mode=modal.querySelector('#bulk-monthly-kind').value,ids=[...modal.querySelectorAll('[name="bulk-student"]:checked')].map(c=>c.value),kinds=mode==='both'?['memorization','revision']:[mode],amounts={};error.textContent='';
      if(!source)for(const kind of kinds){const section=modal.querySelector(`[data-bulk-section="${kind}"]`),range=Object.fromEntries([...section.querySelectorAll('[data-bulk-range]')].map(f=>[f.dataset.bulkRange,f.value?Number(f.value):null]));amounts[kind]={none:false,text:monthlyRangeText(range),range};}
      let next;try{next=source?copyMonthlyAmounts([...monthlyRows.values()],sourceId,ids):applyMonthlyAmounts([...monthlyRows.values()],ids,amounts);}catch(err){error.textContent=err.message;return;}
      applying=true;button.disabled=true;
      try{
        const existing=ids.some(id=>kinds.some(kind=>{const value=monthlyRows.get(id)[kind];return value.none||value.text?.trim()||Object.values(value.range||{}).some(v=>v!==null&&v!==undefined&&v!=='');}));
        if(existing&&!await confirm('استبدال المقدار المكتوب؟','بعض الطلاب المحددين لديهم بيانات في المقدار المختار. هل تريد استبدالها بالمقدار الجديد؟','نعم، تطبيق المقدار'))return;
        monthlyRows=new Map(next.map(r=>[r.student_id,r]));monthlyDirty=true;close();renderMonthly();notify(`تم تطبيق المقدار على ${ids.length} طالبًا. راجع البطاقات ثم احفظ التقرير.`);root.querySelector('#monthly-progress')?.scrollIntoView({block:'nearest',behavior:'smooth'});
      }finally{applying=false;button.disabled=false;}
    });
  }
  root.addEventListener('click', async event => {
    const requestFilterButton=event.target.closest('[data-request-filter]');
    if(requestFilterButton&&admin&&!busy){if(rosterDirty&&!await mayLeave())return;rosterDirty=false;requestFilter=requestFilterButton.dataset.requestFilter;renderRosterRequests();return;}
    const requestDecision=event.target.closest('[data-roster-decision]');
    if(requestDecision&&admin&&!busy){
      const id=requestDecision.dataset.requestId,req=rosterRequests.find(r=>r.id===id),approve=requestDecision.dataset.rosterDecision==='approve';
      if(!req||req.status!=='pending')return;
      const note=requestDecision.closest('[data-roster-request]').querySelector('[data-roster-note]').value.trim();
      if(!await confirm(approve?'الموافقة وتنفيذ الطلب':'رفض الطلب',approve?`سيُنفّذ طلب ${requestKind[req.kind]} للطالب ${req.student_name} الآن، مع الحفاظ على التقارير السابقة.`:`سيُرفض طلب الطالب ${req.student_name} دون تغيير قائمة الحلقة.`))return;
      await action(async()=>{const saved=await repo.decideRosterRequest(id,approve,note);if(saved?.id!==id||saved.status!==(approve?'approved':'rejected'))throw new Error('تعذر تأكيد القرار. حدّث قائمة الطلبات للمراجعة.');await loadContext();},approve?'تمت الموافقة وتنفيذ الطلب في قائمة الحلقة.':'تم رفض الطلب وإظهار القرار للمعلم.');return;
    }
    const monthlyFilter=event.target.closest('[data-monthly-filter]');
    if(monthlyFilter&&!busy){monthlyStudentFilter=monthlyFilter.dataset.monthlyFilter;renderMonthly();return;}
    const finishMonthly=event.target.closest('[data-finish-monthly]');
    if(finishMonthly&&!busy&&!monthlyReadonly()){
      const id=finishMonthly.dataset.finishMonthly;
      if(monthlyProblem(monthlyRows.get(id))){notify('أكمل مقدار الحفظ والمراجعة للطالب أولًا، أو حدده غائبًا.',true);return;}
      await action(async()=>{
        if(!await refreshMonthlyRoster())return;
        if(monthlyReadonly())throw new Error('هذا الشهر مغلق من الإدارة؛ لا يمكن حفظ التقرير حتى إعادة فتحه.');
        const payload=monthlyStudentPayload(monthlyRows.values(),monthlyData.entries,id);
        const version=monthlyData.report?.version||0;
        const saved=await repo.saveMonthly({p_teacher:teacherId,p_term:termId,p_month:month,p_rows:payload,p_version:version});
        if(!saved?.id || saved.version!==version+1)throw new Error('لم يصل تأكيد الحفظ. البيانات المدخلة ما زالت موجودة؛ حاول مرة أخرى.');
        monthlyData={report:saved,entries:payload};
        monthlyDirty=monthlyHasChanges(monthlyRows.values(),payload);
        renderMonthly();notify('تم حفظ بيانات الطالب بنجاح ونقله إلى المكتملين.');
      },'');return;
    }
    const monthlyCardsToggle=event.target.closest('#toggle-monthly-teachers');
    if(monthlyCardsToggle&&monthlyReader){
      monthlyCardsVisible=!monthlyCardsVisible;
      root.querySelector('#monthly-teacher-cards').hidden=!monthlyCardsVisible;
      monthlyCardsToggle.setAttribute('aria-expanded',String(monthlyCardsVisible));
      monthlyCardsToggle.textContent=monthlyCardsVisible?'⌃ إخفاء بطاقات المعلمين':'⌄ عرض بطاقات المعلمين';
      return;
    }
    if(event.target.closest('#toggle-month-workflow')&&admin&&!busy){
      const opening=!monthOpen();if(!await confirm(opening?'فتح الشهر لجميع المعلمين؟':'إغلاق الشهر لجميع المعلمين؟',opening?'سيتمكن جميع المعلمين من إدخال التقارير الشهرية وحفظها وتعديلها.':'سيتوقف حفظ وتعديل تقارير هذا الشهر لجميع المعلمين، وتبقى البيانات المحفوظة متاحة للعرض.',opening?'نعم، فتح الشهر':'نعم، إغلاق الشهر'))return;
      await action(async()=>{await repo.setMonthOpen(termId,month,opening);await refreshMonthlyRoster();},opening?'تم فتح الشهر لجميع المعلمين.':'تم إغلاق الشهر لجميع المعلمين.');return;
    }
    const monthlyTeacher=event.target.closest('[data-monthly-teacher]');
    if(monthlyTeacher&&monthlyReader&&!busy){teacherId=monthlyTeacher.dataset.monthlyTeacher;view=admin?'monthly':'monthlyReport';updateSelectors();await action(refreshMonthlyRoster,'');root.querySelector('.monthly-detail-title')?.scrollIntoView({block:'start',behavior:'smooth'});return;}
    if(event.target.closest('#print-monthly-overview')&&monthlyReader&&!busy){await action(async()=>{await refreshMonthlyRoster();openReport('monthly');},'');return;}
    if(event.target.closest('#refresh-monthly-roster')&&!busy){await action(refreshMonthlyRoster,'تم تحديث قائمة الطلاب مع الاحتفاظ بالبيانات المدخلة.');return;}
    const copyRevision=event.target.closest('[data-copy-revision]');
    if(copyRevision&&!busy&&!monthlyReadonly()){
      const id=copyRevision.dataset.copyRevision,row=monthlyRows.get(id);let next;
      try{next=copyMemorizationToRevision(row);}catch{notify('أكمل مقدار الحفظ أولًا، أو اختر «لا يوجد».');return;}
      const existing=row.revision.none||row.revision.text?.trim()||Object.values(row.revision.range||{}).some(v=>v!==null&&v!==undefined&&v!=='');
      if(existing&&!await confirm('استبدال مقدار المراجعة؟','المراجعة لهذا الطالب فيها بيانات. هل تريد استبدالها بنفس مقدار الحفظ؟','نعم، نسخ الحفظ'))return;
      monthlyRows.set(id,next);monthlyDirty=true;renderMonthly();
      root.querySelector(`[data-monthly-student="${id}"] [data-monthly-section="revision"]`)?.scrollIntoView({block:'nearest',behavior:'smooth'});
      notify('تم نسخ الحفظ إلى المراجعة. يمكنك تعديله ثم حفظ التقرير.');return;
    }
    const copyMonthly=event.target.closest('[data-copy-monthly]');if(copyMonthly&&!busy&&!monthlyReadonly()){openMonthlyBulk(copyMonthly.dataset.copyMonthly);return;}
    if(event.target.closest('#bulk-monthly')&&!busy&&!monthlyReadonly()){openMonthlyBulk();return;}
    if (event.target.closest('#refresh-khairkom') && nominationViewer && !busy) { await action(async()=>{nominationReport = await repo.khairkomReport(termId); renderKhairkom();},'تم تحديث الترشيحات من قاعدة البيانات.'); return; }
    if (event.target.closest('#reset-nomination-filters') && nominationViewer) { nominationFilters = {parts:[],mode:'all',teacher:'',className:''}; renderKhairkom(); return; }
    if (event.target.closest('#add-supervised-nominee') && nominationAdder && !busy) {
      const targetTerm = termId;
      await action(async()=>{
        const candidates = await repo.khairkomCandidates(targetTerm);
        if (targetTerm !== termId) return;
        const modal = document.createElement('dialog'); modal.className = 'nomination-add-dialog';
        modal.innerHTML = `<form id="supervised-nominee-form"><p class="section-kicker khairkom-text">ترشيحات جمعية خيركم</p><h2>إضافة طالب جديد للترشيحات</h2><label>طريقة إضافة الطالب<select name="method"><option value="existing">اختيار من طلاب الحلقات</option><option value="manual">كتابة اسم الطالب يدويًا</option></select></label><label data-existing>اختر الطالب<select name="student"><option value="">اختر الطالب…</option>${candidates.map(s=>`<option value="${esc(s.id)}">${esc(s.full_name)} · ${esc(s.source_class || reportData().teachers.find(t=>t.username===s.teacher_username)?.class_name || '')}</option>`).join('')}</select></label><div data-manual hidden><label>اسم الطالب<input name="full_name" maxlength="150" placeholder="اكتب الاسم كاملًا"></label><label>الفصل (اختياري)<input name="class_name" maxlength="100" placeholder="مثال: 4/A"></label></div><label>رقم هوية الطالب<input name="identity" inputmode="numeric" dir="ltr" maxlength="24" placeholder="رقم هوية الطالب"></label><fieldset><legend>أجزاء الاختبار · اختر جزءًا أو أكثر</legend><div class="nomination-part-grid">${Array.from({length:30},(_,i)=>`<label><input type="checkbox" name="parts" value="${i+1}"><span>${i+1}</span></label>`).join('')}</div></fieldset><p class="nomination-form-error" role="alert"></p><div class="nomination-modal-actions"><button class="light-button" type="button" data-cancel-nomination>إلغاء</button><button class="solid-button" type="submit">حفظ الطالب في الترشيحات</button></div></form>`;
        root.append(modal);
        modal.addEventListener('change',e=>{if(e.target.name==='method'){const manual=e.target.value==='manual';modal.querySelector('[data-existing]').hidden=manual;modal.querySelector('[data-manual]').hidden=!manual;}});
        modal.showModal();
        try {
          await new Promise(resolve=>{
            modal.addEventListener('cancel',e=>{if(modal.querySelector('[type="submit"]').disabled)e.preventDefault();else resolve();});
            modal.querySelector('[data-cancel-nomination]').addEventListener('click',()=>resolve(),{once:true});
            modal.querySelector('form').addEventListener('submit',async e=>{
              e.preventDefault(); e.stopPropagation();
              const form=new FormData(e.target), manual=form.get('method')==='manual', identity=normalizeIdentityNumber(form.get('identity')), parts=form.getAll('parts').map(Number), name=String(form.get('full_name')||'').trim();
              const error=modal.querySelector('.nomination-form-error');
              if(manual ? name.length<3 : !form.get('student')) {error.textContent=manual?'اكتب اسم الطالب كاملًا (٣ أحرف على الأقل).':'اختر الطالب من القائمة.';return;}
              if(!validIdentityNumber(identity)) {error.textContent='أدخل رقم هوية صحيحًا من ٦ إلى ٢٠ رقمًا.';return;}
              if(!validTestParts(parts)) {error.textContent='اختر جزءًا واحدًا على الأقل للاختبار.';return;}
              const save=modal.querySelector('[type="submit"]'), cancel=modal.querySelector('[data-cancel-nomination]');
              save.disabled=true;cancel.disabled=true;save.textContent='جارٍ الحفظ…';
              const preventCancel=e=>e.preventDefault(); modal.addEventListener('cancel',preventCancel);
              try {
                await repo.addKhairkomNomination({p_term:targetTerm,p_student:manual?null:form.get('student'),p_name:manual?name:null,p_class:manual?String(form.get('class_name')||'').trim():null,p_identity:identity,p_parts:parts});
                nominationFilters={parts:[],mode:'all',teacher:'',className:''};
                await loadContext(); notify('تمت إضافة الطالب إلى الترشيحات والتقرير.');resolve();
              } catch(err) {error.textContent=errorText(err);} finally {modal.removeEventListener('cancel',preventCancel);save.disabled=false;cancel.disabled=false;save.textContent='حفظ الطالب في الترشيحات';}
            });
          });
        } finally {modal.close();modal.remove();}
      },''); return;
    }
    const identityButton = event.target.closest('[data-edit-nomination]');
    if (identityButton && identityEditor && !busy) {
      const row = reportData().rows.find(r=>r.set_id===identityButton.dataset.editNomination && r.student_id===identityButton.dataset.nominationStudent);
      const student = reportData().students.find(s=>s.id===row?.student_id);
      if (!row) return;
      const version = reportData().sets.find(s=>s.id===row.set_id)?.version;
      await action(async()=>{
        const modal = document.createElement('dialog'); modal.className = 'nomination-add-dialog';
        modal.innerHTML = `<form><p class="section-kicker khairkom-text">ترشيحات جمعية خيركم</p><h2>تعديل بيانات المرشح</h2><label>اسم الطالب<input name="full_name" maxlength="150" required value="${esc(student?.full_name || '')}"></label><p>تعديل الاسم يخص تقرير الترشيحات فقط؛ تظل قائمة الحلقة والتقييمات كما هي.</p><label>رقم هوية الطالب<input name="identity" dir="ltr" inputmode="numeric" maxlength="24" value="${esc(row.identity_number || '')}"></label><fieldset><legend>أجزاء الاختبار · اختر جزءًا أو أكثر</legend><div class="nomination-part-grid">${Array.from({length:30},(_,i)=>`<label><input type="checkbox" name="parts" value="${i+1}" ${(row.test_parts||[]).includes(i+1)?'checked':''}><span>${i+1}</span></label>`).join('')}</div></fieldset><p class="nomination-form-error" role="alert"></p><div class="nomination-modal-actions"><button class="light-button" type="button" data-cancel-nomination>إلغاء</button><button class="solid-button" type="submit">حفظ تعديلات المرشح</button></div></form>`;
        root.append(modal);modal.showModal();
        try {
          await new Promise(resolve=>{
            modal.addEventListener('cancel',e=>{if(modal.querySelector('[type="submit"]').disabled)e.preventDefault();else resolve();});
            modal.querySelector('[data-cancel-nomination]').addEventListener('click',()=>resolve(),{once:true});
            modal.querySelector('form').addEventListener('submit',async e=>{
              e.preventDefault();e.stopPropagation();
              const form=new FormData(e.target), name=String(form.get('full_name')||'').trim(), identity=normalizeIdentityNumber(form.get('identity')), parts=form.getAll('parts').map(Number), error=modal.querySelector('.nomination-form-error');
              if(name.length<3){error.textContent='اكتب اسم الطالب كاملًا (٣ أحرف على الأقل).';return;}
              if(!validIdentityNumber(identity)){error.textContent='أدخل رقم هوية صحيحًا من ٦ إلى ٢٠ رقمًا.';return;}
              if(!validTestParts(parts)){error.textContent='اختر جزءًا واحدًا على الأقل للاختبار.';return;}
              const save=modal.querySelector('[type="submit"]'),cancel=modal.querySelector('[data-cancel-nomination]');
              save.disabled=true;cancel.disabled=true;save.textContent='جارٍ الحفظ…';error.textContent='';
              try {
                const args={p_set:row.set_id,p_student:row.student_id,p_name:name,p_identity:identity,p_parts:parts,p_version:version};
                const saved=await repo.updateKhairkomNominee(args);
                nominationReport=applyEditedNominee(reportData(),saved,args);renderKhairkom();notify('تم حفظ الاسم والهوية وأجزاء الاختبار.');resolve();
              } catch(err){error.textContent=errorText(err);} finally{save.disabled=false;cancel.disabled=false;save.textContent='حفظ تعديلات المرشح';}
            });
          });
        } finally {modal.close();modal.remove();}
      },'');return;
    }
    const progressCard = event.target.closest('[data-progress-focus]');
    if (progressCard && admin && !busy) { progressFocus = progressCard.dataset.progressFocus; renderReports(); return; }
    if (event.target.closest('#toggle-week-workflow') && admin && !busy && termId && week) {
      const nextOpen = !weekOpen(week);
      await action(async () => { await repo.setWeekOpen(termId, week, nextOpen); await loadContext(); }, nextOpen ? 'تم فتح الأسبوع لجميع المعلمين.' : 'تم إغلاق الأسبوع أمام جميع المعلمين.');
      return;
    }
    if (event.target.closest('#report-close')) { closeReport(); return; }
    if (event.target.closest('#report-print') && !reportPreview.hidden) {
      const championsSheet = reportPreview.querySelector('.report-champions');
      if (!championsSheet) { await document.fonts.ready; window.print(); return; }
      const button = event.target.closest('#report-print');
      if (button.disabled) return;
      button.disabled=true;button.textContent='جارٍ تجهيز PDF…';
      try {const {downloadChampionsPdf}=await import('./champions-pdf.mjs?v=monthly-admin1');await downloadChampionsPdf(championsSheet);}
      catch(error){notify(errorText(error),true);}
      finally{button.disabled=false;button.textContent='تحميل PDF · صفحة واحدة';}
      return;
    }
    if (event.target.closest('#preview-teacher-progress') && admin && !busy && termId && week) {
      const reportTerm = selectedTerm(), reportWeek = week;
      const button = event.target.closest('#preview-teacher-progress');
      busy = true; button.disabled = true; button.textContent = 'جارٍ جلب أحدث حالة للمعلمين…';
      try {
        const snapshot = await repo.teacherProgress(reportTerm.id, reportWeek);
        if (termId !== reportTerm.id || week !== reportWeek) return;
        const progress = summarizeTeacherProgress(snapshot.teachers, snapshot.reviews, snapshot.champions, snapshot.nominations.rows, reportWeek, weekNumber(reportTerm, termWeeks(reportTerm).indexOf(reportWeek)));
        teachers = snapshot.teachers;
        overview = { ...overview, reviews: [...(overview?.reviews || []).filter(row => row.week_start !== reportWeek), ...snapshot.reviews] };
        champions = snapshot.champions;
        khairkomData = snapshot.nominations;
        renderReports();
        openReport('progress', false, progress);
      } catch (error) { notify(errorText(error), true); }
      finally { busy = false; button.disabled = false; }
      return;
    }
    if (event.target.closest('#preview-weekly-all') && admin) { openReport('weekly'); return; }
    if (event.target.closest('#print-khairkom') && nominationViewer && !busy) { await action(async()=>{nominationReport = await repo.khairkomReport(termId); renderKhairkom(); openReport('khairkom');},''); return; }
    if (event.target.closest('#preview-champions, #download-champions') && manager && !busy && termId && week) {
      const reportTerm = termId, reportWeek = week;
      const button = event.target.closest('#preview-champions, #download-champions'), label = button.innerHTML;
      busy = true; button.disabled = true; button.textContent = 'جارٍ جلب أحدث فرسان الأسبوع…';
      try {
        const latest = await repo.champions(reportTerm, reportWeek);
        if (termId !== reportTerm || week !== reportWeek) return;
        champions = latest;
        if (view === 'reports') renderReports();
        if (view === 'champions') renderChampions();
        openReport('champions');
      } catch (error) { notify(errorText(error), true); }
      finally { busy = false; button.disabled = false; button.innerHTML = label; }
      return;
    }
    const addPart = event.target.closest('[data-khairkom-add-part]');
    if (addPart && !admin && !busy && selectedTerm()?.active && khairkomOpen()) {
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
    if (removePart && !admin && !busy && selectedTerm()?.active && khairkomOpen()) {
      const card = removePart.closest('[data-khairkom-student]'), id = card.dataset.khairkomStudent;
      nominatedStudents.set(id, (nominatedStudents.get(id) || []).filter(part => part !== Number(removePart.dataset.khairkomRemovePart)));
      updateKhairkomParts(card); return;
    }
    if (event.target.closest('#save-khairkom') && !admin && !busy && khairkomOpen()) {
      // Read the displayed input too: mobile keyboards/autofill may delay input events.
      const chosen = [...nominatedStudents].map(([student_id, test_parts]) => ({ student_id, test_parts: [...test_parts].sort((a,b)=>a-b), identity_number: normalizeIdentityNumber(root.querySelector(`[data-khairkom-student="${student_id}"] [data-khairkom-identity]`)?.value ?? identityNumbers.get(student_id)) }));
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
      const saveButton=root.querySelector('#save-khairkom'), saveStatus=root.querySelector('#khairkom-save-state'), originalLabel=saveButton.textContent;
      saveButton.disabled=true;saveButton.textContent='جارٍ حفظ الترشيحات…';saveStatus.classList.remove('save-error');saveStatus.textContent='جارٍ إرسال الترشيحات؛ انتظر تأكيد الحفظ.';
      await action(async()=>{
        try {
          const saved=await repo.saveKhairkom({p_teacher:teacherId,p_term:termId,p_rows:chosen,p_version:khairkomData.sets.find(row=>row.teacher_username===teacherId)?.version||0});
          khairkomData=applySavedNominations(khairkomData,saved,teacherId,termId,chosen);
          if(nominationReport){nominationReport=applySavedNominations(nominationReport,saved,teacherId,termId,chosen);nominationReport.students=[...new Map([...nominationReport.students,...context.students].map(s=>[s.id,s])).values()];}
          nominatedStudents=new Map(chosen.map(r=>[r.student_id,[...r.test_parts]]));identityNumbers=new Map(chosen.map(r=>[r.student_id,r.identity_number]));
          nominationDirty=false;nominationSaveReceipt={teacher:teacherId,term:termId,count:chosen.length};renderKhairkom();
          content.querySelector('.khairkom-save-confirmation')?.scrollIntoView({block:'nearest',behavior:'smooth'});
        } catch(error) {saveStatus.textContent=errorText(error)+' البيانات المدخلة ما زالت موجودة.';saveStatus.classList.add('save-error');throw error;}
        finally {if(saveButton.isConnected){saveButton.disabled=false;saveButton.textContent=originalLabel;}}
      },'تم حفظ الترشيحات وظهرت في تقرير الإدارة.'); return;
    }
    if (event.target.closest('#print-monthly')) {
      if(monthlyReader&&monthlyOverviewMode()){await action(async()=>{await refreshMonthlyRoster();openReport('monthly',true);},'');return;}
      const printable = root.querySelector('.print-only');
      if (printable) printable.innerHTML = monthlyTable();
      window.print(); return;
    }
    if (event.target.closest('#save-monthly') && !busy && !monthlyReadonly()) {
      let refreshed=false;await action(async()=>{refreshed=await refreshMonthlyRoster();});if(!refreshed)return;if(monthlyReadonly()){notify('هذا الشهر مغلق من الإدارة؛ لا يمكن حفظ التقرير حتى إعادة فتحه.',true);return;}
      const missing = monthlyStudents().filter(student => monthlyProblem(monthlyRows.get(student.id)));
      root.querySelectorAll('.needs-attention').forEach(card => card.classList.remove('needs-attention'));
      if (dialog.open) return;
      if (missing.length && !await confirm('التقرير غير مكتمل', 'هل تريد حفظ التقرير والعودة لاحقًا لاستكماله؟', 'نعم، حفظ التقرير')) return;
      const saveButton=root.querySelector('#save-monthly'),saveStatus=root.querySelector('#monthly-save-state'),originalLabel=saveButton.textContent;
      saveButton.disabled=true;saveButton.textContent='جارٍ حفظ التقرير…';saveStatus.classList.remove('save-error');saveStatus.textContent='جارٍ الحفظ؛ انتظر رسالة التأكيد.';
      await action(async () => {
        try {
          const saved=await repo.saveMonthly({p_teacher:teacherId,p_term:termId,p_month:month,p_rows:[...monthlyRows.values()],p_version:monthlyData.report?.version || 0});
          if(!saved?.id)throw new Error('لم يصل تأكيد الحفظ. حاول مرة أخرى؛ البيانات المدخلة ما زالت موجودة.');
          monthlyData={report:saved,entries:structuredClone([...monthlyRows.values()])};monthlyDirty=false;renderMonthly();
          root.querySelector('#monthly-save-state').textContent=missing.length?'تم الحفظ. يمكنك العودة لاحقًا لاستكمال التقرير غير المكتمل.':'تم حفظ التقرير مكتملًا.';
        } catch(error) {saveStatus.textContent=errorText(error)+' البيانات المدخلة ما زالت موجودة.';saveStatus.classList.add('save-error');throw error;}
        finally {if(saveButton.isConnected){saveButton.disabled=false;saveButton.textContent=originalLabel;}}
      }, missing.length ? 'تم حفظ التقرير كمسودة غير مكتملة. يمكنك العودة لاحقًا لاستكمال التقرير.' : 'تم حفظ التقرير الشهري مكتملًا وتحديثه عند الإدارة.'); return;
    }
    const edit = event.target.closest('[data-edit-student]');
    if (edit && canManageRoster() && !busy) { if(rosterDirty&&!await mayLeave())return; rosterDirty=false; editingStudent=edit.dataset.editStudent; renderSetup(); root.querySelector('#student-edit-form input').focus(); return; }
    const archive = event.target.closest('[data-archive-student]');
    if (archive && canManageRoster() && !busy) {
      if(rosterDirty&&!await mayLeave())return;
      const student=context.students.find(row=>row.id===archive.dataset.archiveStudent);
      if (!student) return;
      if (!await confirm(admin?(student.active?'أرشفة الطالب':'استعادة الطالب'):(student.active?'إرسال طلب حذف':'إرسال طلب استعادة'),admin?'ستُحدّث قائمة الطلاب مع الحفاظ على التقارير السابقة.':'لن تتغير حالة الطالب الآن. يُنفّذ الطلب بعد موافقة الإدارة فقط.')) return;
      await action(async()=>{
        if(admin) await writeStudent(student,student.full_name,!student.active);
        else {const req=await repo.requestRosterStatus(student.id,!student.active);if(!req?.id||req.status!=='pending'||req.student_id!==student.id)throw new Error('تعذر تأكيد إرسال الطلب. حدّث القائمة للمراجعة.');}
        editingStudent='';await loadContext();
      },admin?'تم تحديث قائمة الطلاب.':'تم إرسال الطلب للإدارة. الطالب باقٍ في حالته الحالية حتى الموافقة.');return;
    }
    const historyWeek = event.target.closest('[data-teacher-week]');
    if (historyWeek && !admin && !busy) {
      if (!await mayLeave()) return;
      week = historyWeek.dataset.teacherWeek; view = 'home'; updateSelectors(); await loadContext();
      root.querySelector('#teacher-home')?.scrollIntoView({block:'start',behavior:'smooth'}); return;
    }
    const nav = event.target.closest('[data-view]');
    if (nav && !busy) {
      if(rosterDirty){if(!await mayLeave())return;rosterDirty=false;editingStudent='';}
      if (view === 'khairkom' && nominationDirty) { if (!await mayLeave()) return; nominatedStudents = new Map(khairkomData.rows.filter(row=>row.teacher_username===teacherId).map(row=>[row.student_id,[...(row.test_parts || [])]])); identityNumbers = new Map(khairkomData.rows.filter(row=>row.teacher_username===teacherId).map(row=>[row.student_id,row.identity_number || ''])); nominationDirty=false; }
      if (view === 'monthly' && monthlyDirty) { if (!await mayLeave()) return; loadMonthlyRows(); }
      if (view === 'evaluation' && dirty) { if (!await mayLeave()) return; loadScores(); }
      if ((view === 'honors' && honorDirty) || (view === 'knight' && knightDirty)) {
        if (!await mayLeave()) return;
        selectedHonors = new Set(context.honors.map(row => row.student_id)); honorDirty = false;
        chosenKnight = review()?.knight_student_id || ''; knightDirty = false;
      }
      const nextView = nav.dataset.view;
      if (!admin && nextView === 'home' && teacherId !== account.username) { teacherId = account.username; view = nextView; updateSelectors(); await loadContext(); return; }
      if(!admin && ['monthlyReport','monthlyProgress'].includes(view) && !['monthlyReport','monthlyProgress','setup','champions','khairkomReport'].includes(nextView)){teacherId=account.username;view=nextView;updateSelectors();await loadContext();return;}
      if (nominationViewer && (nextView === 'khairkomReport' || admin && nextView === 'khairkom')) {
        await action(async()=>{const fresh = await repo.khairkomReport(termId); nominationReport = fresh; view = nextView; render();},'');
      } else if(['monthlyReport','monthlyProgress'].includes(nextView)&&monthlyReader){view=nextView;await action(refreshMonthlyRoster,'');}
      else if(nextView==='monthly'){view=nextView;await action(refreshMonthlyRoster,'');}
      else { view = nextView; render(); }
      return;
    }
    const weeklyFilter = event.target.closest('[data-weekly-filter]');
    if (weeklyFilter && view==='evaluation' && !busy) { weeklyStudentFilter=weeklyFilter.dataset.weeklyFilter; weeklyActiveStudent=''; renderWeeklyStudents(); root.querySelector(`[data-weekly-filter="${weeklyStudentFilter}"]`)?.focus({preventScroll:true}); return; }
    const weeklyEdit = event.target.closest('[data-weekly-edit]');
    if (weeklyEdit && view==='evaluation' && !readonly() && !busy) {
      const id = weeklyEdit.dataset.weeklyEdit;
      if (!scores.has(id)) return;
      weeklyActiveStudent=id; weeklyStudentFilter='pending';
      renderWeeklyStudents(true,id); updateProgress(); return;
    }
    const chip = event.target.closest('[data-score]');
    if (chip && !readonly() && !busy) {
      const card = chip.closest('[data-student]'), row = scores.get(card.dataset.student);
      row[chip.dataset.score] = Number(chip.dataset.point); dirty = true;
      if (validateScores(row, true)) card.classList.remove('needs-attention');
      chip.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button === chip ? 'true' : 'false'));
      const total = scoreTotal(row); card.querySelector('.total-badge').innerHTML = `${total === null ? '—' : total}<small>/ ١٢</small>`; updateWeeklyActiveStudent(card.dataset.student,`[data-score="${chip.dataset.score}"][data-point="${chip.dataset.point}"]`); return;
    }
    const report = event.target.closest('[data-teacher-report]');
    if (report && !busy) { if (!await mayLeave()) return; teacherId = report.dataset.teacherReport; view = 'evaluation'; updateSelectors(); await loadContext(); return; }
    const id = event.target.closest('button')?.id;
    if (admin && ['submit-week','save-knight','save-honors'].includes(id)) return;
    if (id === 'cancel-student-edit' && canManageRoster()) { if(rosterDirty&&!await mayLeave())return; rosterDirty=false; editingStudent=''; renderSetup(); return; }
    if (id === 'submit-week' && weekOpen(week)) {
      const rows = [...scores.values()], missing = weekStudents().filter(student => !validateScores(scores.get(student.id), true));
      root.querySelectorAll('.needs-attention').forEach(card => card.classList.remove('needs-attention'));
      if (!rows.length) { notify('لا يوجد طلاب لتقييمهم.', true); return; }
      if (missing.length) {
        weeklyStudentFilter='pending'; weeklyActiveStudent=''; renderWeeklyStudents();
        const details = missing.map(student => `${student.full_name} (${SCORE_FIELDS.filter(field => scores.get(student.id)[field.key] === null).map(field => field.label).join('، ')})`);
        missing.forEach(student => root.querySelector(`[data-student="${student.id}"]`)?.classList.add('needs-attention'));
        root.querySelector(`[data-student="${missing[0].id}"] button`)?.focus();
        notify('لم يكتمل التقييم: ' + details.join('؛ '), true); return;
      }
      if (!await confirm('حفظ تقييم الحلقة', 'سيُحفظ تقييم جميع الطلاب ويُعتمد الأسبوع، ثم يمكنك اختيار فارسه يدويًا. التعديل بعد الحفظ يحتاج إعادة فتح الأسبوع بواسطة الإدارة.')) return;
      await action(async () => { await repo.saveWeek({ p_teacher: teacherId, p_term: termId, p_week: week, p_rows: rows, p_submit: true, p_version: review()?.version || 0 }); dirty = false; await loadContext(); }, 'تم حفظ تقييم جميع الطلاب. اختر فارس الأسبوع يدويًا.');
    }
    if (id === 'print-admin-report' && admin) { openReport('weekly', true); return; }
    if (id === 'save-knight' && weekOpen(week)) await action(async () => { await repo.knight({ p_teacher: teacherId, p_term: termId, p_week: week, p_student: chosenKnight, p_note: root.querySelector('#knight-note').value.trim(), p_version: review()?.version || 0 }); await loadContext(); }, 'تم حفظ فارس الأسبوع وإظهاره للإدارة.');
    if (id === 'save-honors') await action(async () => { await repo.honors({ p_teacher: teacherId, p_term: termId, p_students: [...selectedHonors], p_note: root.querySelector('#honor-note').value.trim() }); honorDirty = false; await loadContext(); }, 'تم حفظ قائمة التكريم الفصلي.');
    if (id === 'reopen-week' && await confirm('إعادة فتح التقييم', 'سيصبح الأسبوع مسودة لتعديل النقاط، مع الاحتفاظ باختيار فارس الأسبوع.')) await action(async () => { await repo.reopen({ p_review: review().id, p_version: review().version }); await loadContext(); }, 'تمت إعادة فتح التقييم للتعديل.');
    if (id === 'refresh-dashboard' && !busy && await mayLeave()) await action(async () => {
      terms = await repo.terms();
      if (manager) { teachers = await repo.teachers(); teacherId ||= teachers[0]?.username || ''; }
      if (!terms.some(term => term.id === termId)) { termId = terms.find(term => term.active)?.id || terms[0]?.id || ''; const weeks = selectedTerm() ? termWeeks(selectedTerm()) : []; week = weeks.filter(day => day <= today()).at(-1) || weeks[0] || ''; }
      updateSelectors(); await loadContext();
    }, 'تم تحديث البيانات.');
    if (id === 'dashboard-logout' && !busy && await mayLeave()) {
      try { await onLogout(); dashboardClosed=true;clearInterval(rosterPollTimer);teacherAppearance?.destroy();dashboardIdentity.destroy(); for (const type of ['input','change','click']) root.removeEventListener(type,queueTeacherSaveState); clearTimeout(messageTimer); window.removeEventListener('beforeunload', beforeUnload); }
      catch (error) { notify(errorText(error), true); }
    }
  });
  root.addEventListener('change', async event => {
    if(event.target.id==='monthly-report-teacher'&&monthlyReader&&!busy){teacherId=event.target.value;await action(refreshMonthlyRoster,'');return;}
    if (event.target.id === 'knight-student' && !admin && !busy && weekOpen(week)) { chosenKnight = event.target.value; knightDirty = true; root.querySelector('#save-knight').disabled = !chosenKnight || week > today() || !selectedTerm()?.active || !weekOpen(week); return; }
    if (event.target.hasAttribute('data-nomination-filter') && nominationViewer && !busy) {
      const field = event.target.dataset.nominationFilter;
      nominationFilters[field] = field === 'parts' ? Array.from(event.target.selectedOptions).map(o=>Number(o.value)) : event.target.value;
      renderKhairkom(); return;
    }
    if (busy) return;
    if (event.target.hasAttribute('data-khairkom-choice') && !admin && khairkomOpen()) {
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
      root.querySelector('#save-khairkom').textContent = nominatedStudents.size ? '✓ حفظ ترشيحات جمعية خيركم' : '✓ تمت المراجعة بلا ترشيحات';
      nominationDirty=true;root.querySelector('.khairkom-status').textContent=`${nominatedStudents.size} مرشح`;root.querySelector('#khairkom-save-state').textContent='تغييرات لم تُحفظ';return;
    }
    if (event.target.id === 'month-select') {
      const next = event.target.value;
      if (!await mayLeave()) { event.target.value = month; return; }
      month = next; await loadContext(); return;
    }
    if(event.target.hasAttribute('data-monthly-absent')&&!monthlyReadonly()&&!busy){
      const id=event.target.closest('[data-monthly-student]').dataset.monthlyStudent;
      monthlyRows.set(id,setMonthlyAbsent(monthlyRows.get(id),event.target.checked));monthlyDirty=true;renderMonthly();return;
    }
    if(event.target.dataset.monthlyRange && !monthlyReadonly() && !busy){updateMonthlyRange(event.target);return;}
    if (event.target.dataset.monthlyNone && !monthlyReadonly()) {
      const row = monthlyRows.get(event.target.closest('[data-monthly-student]').dataset.monthlyStudent), kind = event.target.dataset.monthlyNone;
      row[kind] = {none:event.target.checked,text:''};
      monthlyDirty=true; renderMonthly(); return;
    }
    const bonus = event.target.dataset.bonus;
    if (bonus && !readonly() && !busy) { const card = event.target.closest('[data-student]'), row = scores.get(card.dataset.student); row[bonus] = event.target.checked ? 1 : 0; dirty = true; const total = scoreTotal(row); card.querySelector('.total-badge').innerHTML = `${total === null ? '—' : total}<small>/ ١٢</small>`; updateWeeklyActiveStudent(card.dataset.student,`[data-bonus="${bonus}"]`); }
    if (event.target.dataset.honor) { const id = event.target.dataset.honor; if (event.target.checked) selectedHonors.add(id); else selectedHonors.delete(id); honorDirty = true; event.target.closest('.honor-card').classList.toggle('chosen', event.target.checked); root.querySelector('#honor-count').textContent = `${selectedHonors.size} مختار للتكريم`; }
    if (event.target === termSelect || event.target === weekSelect || event.target === teacherSelect) {
      if (!await mayLeave()) { updateSelectors(); return; }
      if (event.target === termSelect) { termId = termSelect.value; const weeks = termWeeks(selectedTerm()); week = weeks.filter(value => value <= today()).at(-1) || weeks[0] || ''; }
      if (event.target === weekSelect) week = weekSelect.value;
      if (event.target === teacherSelect) teacherId = teacherSelect.value;
      updateSelectors(); await loadContext();
    }
  });
  function updateMonthlyRange(input){
    const card=input.closest('[data-monthly-student]'),section=input.closest('[data-monthly-section]'),row=monthlyRows.get(card.dataset.monthlyStudent)[section.dataset.monthlySection];
    row.range||={};row.range[input.dataset.monthlyRange]=input.value?Number(input.value):null;
    for(const side of ['from','to']){const field=section.querySelector(`[data-monthly-range="${side}_ayah"]`);field.max=SURAHS.find(s=>s.number===row.range[side+'_surah'])?.verses||286;}
    row.text=monthlyRangeText(row.range);section.querySelector('.monthly-range-summary').textContent=row.text||'أكمل السور والآيات الصحيحة؛ آية النهاية لا تسبق البداية داخل السورة نفسها.';
    monthlyDirty=true;root.querySelector('#monthly-save-state').textContent='تغييرات لم تُحفظ بعد';updateMonthlyProgress();
  }
  root.addEventListener('input', event => {
    if(event.target.closest('#students-form,#student-edit-form')||event.target.hasAttribute('data-roster-note'))rosterDirty=true;
    if (event.target.hasAttribute('data-khairkom-identity') && !admin) {
      nominationSaveReceipt=null;content.querySelector('.khairkom-save-confirmation')?.remove();
      const card=event.target.closest('[data-khairkom-student]'), id=card.dataset.khairkomStudent;
      if (nominatedStudents.has(id)) { identityNumbers.set(id,event.target.value); nominationDirty=true; card.classList.remove('needs-attention'); root.querySelector('#khairkom-save-state').textContent='تغييرات لم تُحفظ'; }
      return;
    }
    if(event.target.dataset.monthlyRange && !monthlyReadonly() && !busy){updateMonthlyRange(event.target);return;}
    const card = event.target.closest('[data-monthly-student]');
    if (card && !monthlyReadonly() && !busy) {
      const row = monthlyRows.get(card.dataset.monthlyStudent);
      if (event.target.hasAttribute('data-monthly-note')) row.note = event.target.value;
      if (event.target.dataset.monthlyKind) row[event.target.dataset.monthlyKind].text = event.target.value;
      monthlyDirty=true; root.querySelector('#monthly-save-state').textContent='تغييرات لم تُحفظ بعد';updateMonthlyProgress();
    }
    if (event.target.id === 'honor-note') honorDirty = true;
    if (event.target.id === 'knight-note') knightDirty = true;
  });
  root.addEventListener('submit', async event => {
    event.preventDefault();
    if (event.target.id === 'student-edit-form' && canManageRoster()) {
      const student=context.students.find(row=>row.id===editingStudent), form=new FormData(event.target);
      if (!student) return;
      if (!await confirm('حفظ بيانات الطالب',admin?'سيُحفظ الاسم والمعلم المختار. عند النقل تبقى التقييمات السابقة محفوظة.':'سيُحدّث اسم الطالب وتقاريره المحفوظة.')) return;
      await action(async()=>{await writeStudent(student,form.get('full_name').trim(),student.active,admin?form.get('teacher'):student.teacher_username); editingStudent=''; await loadContext();},'تم حفظ بيانات الطالب.'); return;
    }
    if (event.target.id === 'term-form') {
      const form = new FormData(event.target), starts_on = form.get('starts_on'), ends_on = form.get('ends_on'), name = form.get('name').trim();
      if (!name || ends_on < starts_on || termWeeks({ starts_on, ends_on }).length >= 105) { notify('راجع اسم الفصل وتواريخ بدايته ونهايته.', true); return; }
      if (!await mayLeave()) return;
      await action(async () => { const added = await repo.addTerm({ name, starts_on, ends_on }); terms = await repo.terms(); termId = added.id; week = termWeeks(added).filter(value => value <= today()).at(-1) || termWeeks(added)[0]; updateSelectors(); await loadContext(); }, 'تم حفظ الفصل الدراسي.');
    }
    if (event.target.id === 'students-form' && canManageRoster()) {
      const rows = new FormData(event.target).get('names').split(/\r?\n/).map(line => line.trim()).filter(Boolean).map(line => {
        const [full_name, student_code] = line.split('|').map(value => value.trim());
        return { full_name, student_code: student_code || null, teacher_username: teacherId };
      });
      if (!rows.length || rows.length > 300 || rows.some(row => !row.full_name || row.full_name.length > 150)) { notify('أدخل قائمة صحيحة، بحد أقصى ٣٠٠ طالب في الدفعة.', true); return; }
      if (rows.some((row, i) => rows.some((other, j) => j !== i && ((row.student_code && row.student_code === other.student_code) || (!row.student_code && row.full_name === other.full_name))))) { notify('يوجد تكرار في القائمة. للأسماء المتشابهة أضف رقم الطالب بعد علامة | لكل اسم.', true); return; }
      if (rows.some(row => context.students.some(student => row.student_code ? student.student_code === row.student_code : student.full_name === row.full_name))) { notify('القائمة تتضمن طالبًا موجودًا بالفعل. راجع الأسماء والأرقام قبل الحفظ.', true); return; }
      if (!await confirm('حفظ قائمة الطلاب', admin?`سيُضاف ${rows.length} طالبًا إلى حلقة ${teacher().class_name}.`:`سيُرسل ${rows.length} طلب إضافة للإدارة. لن تُضاف الأسماء للحلقة قبل الموافقة.`)) return;
      await action(async () => { const added=admin?await repo.addStudents(rows.map(row=>({...row,source_class:teacher().class_name||''}))):await repo.requestRosterAdditions(rows,teacherId); if(!Array.isArray(added)||added.length!==rows.length||added.some(row=>!row.id||!admin&&row.status!=='pending'))throw new Error('تعذر تأكيد إضافة الطلاب. حدّث القائمة قبل إعادة المحاولة.'); await loadContext(); }, admin?'تم حفظ الطلاب وربطهم بالمعلم.':'تم إرسال طلبات الإضافة للإدارة. ستظهر الأسماء في الحلقة بعد الموافقة.');
    }
  });
  function beforeUnload(event) { if (dirty || honorDirty || knightDirty || monthlyDirty || nominationDirty || rosterDirty) { event.preventDefault(); event.returnValue = ''; } }
  // Refresh the indicator after each existing input handler without re-rendering fields.
  function queueTeacherSaveState() { queueMicrotask(updateTeacherSaveState); }
  if (!admin) for (const eventName of ['input','change','click']) root.addEventListener(eventName,queueTeacherSaveState);
  window.addEventListener('beforeunload', beforeUnload);
  try {
    [terms, teachers] = await Promise.all([repo.terms(), manager ? repo.teachers() : Promise.resolve([account])]);
    teacherId ||= teachers[0]?.username || '';
    termId = terms.find(term => term.active && term.starts_on <= today() && term.ends_on >= today())?.id || terms.find(term => term.active)?.id || terms[0]?.id || '';
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    week = weeks.filter(value => value <= today()).at(-1) || weeks[0] || '';
    updateSelectors(); await loadContext();rosterPollTimer=setInterval(pollRosterRequests,30000);
  } catch (error) { content.innerHTML = empty('تعذر تحميل لوحة التحكم', 'اضغط تحديث البيانات بعد التأكد من اتصال الإنترنت.'); notify(errorText(error), true); }
}
