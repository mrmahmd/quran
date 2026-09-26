import { SCORE_FIELDS, emptyScores, scoreTotal, validateScores, termWeeks, rankWeekly, semesterSummary } from './evaluation-model.mjs';

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
  let scores = new Map(), dirty = false, honorDirty = false, knightDirty = false, busy = false, generation = 0, search = '', chosenKnight = '', selectedHonors = new Set();
  let messageTimer;
  const admin = account.role === 'admin';
  const selectedTerm = () => terms.find(term => term.id === termId);
  const teacher = () => teachers.find(row => row.username === teacherId) || account;
  const review = () => context.reviews.find(row => row.week_start === week);
  const readonly = () => !selectedTerm()?.active || review()?.status === 'submitted';
  const weekStudents = () => context.students.filter(student => (review()?.status !== 'submitted' && student.active) || context.evaluations.some(row => row.review_id === review()?.id && row.student_id === student.id));
  const completeCount = () => [...scores.values()].filter(row => validateScores(row, true)).length;

  root.innerHTML = `<div class="dashboard-shell">
    <header class="dashboard-topbar"><a class="brand" href="#"><img src="assets/alandalus-logo.png" alt="شعار مدارس الأندلس الأهلية"><span class="brand-copy"><strong>المدرسة القرآنية</strong><small>المسار المصري - فرع الحمدانية</small></span></a><div class="dashboard-user"><span>${esc(account.role === 'admin' ? 'حساب الإدارة' : account.full_name)}</span><button class="light-button" id="dashboard-logout">تسجيل الخروج</button></div></header>
    ${preview ? '<div class="preview-banner">معاينة تصميم محلية - جميع الأسماء والدرجات هنا تجريبية</div>' : ''}
    <main class="dashboard-main"><section class="welcome-banner"><div><p class="eyebrow">${admin ? 'إشراف واضح.. ودعم لكل حلقة' : 'خطوة صغيرة.. وأثر كبير'}</p><h1>${admin ? 'لوحة إدارة المدرسة القرآنية' : `أهلًا بك، ${esc(account.full_name)}`}</h1><p>${admin ? 'تابع التقييمات المعتمدة وفرسان الأسبوع والتكريم الفصلي.' : `حلقة <bdi dir="ltr">${esc(account.class_name)}</bdi> · قيّم اجتهاد كل طالب وتقدمه مقارنة بنفسه.`}</p></div><div class="welcome-symbol" aria-hidden="true">✦</div></section>
    <section class="dashboard-toolbar" aria-label="الفصل الدراسي والأسبوع"><label>الفصل الدراسي<select id="term-select"></select></label>${admin ? '<label>الحلقة<select id="teacher-select"></select></label>' : '<div class="class-tag">حلقتي <strong>'+esc(account.class_name)+'</strong></div>'}<label>الأسبوع<select id="week-select"></select></label><button class="light-button" id="refresh-dashboard">تحديث البيانات</button></section>
    <nav class="dashboard-actions" aria-label="أقسام لوحة التحكم"><button class="action-card blue-card" data-view="evaluation"><span class="action-symbol">✓</span><span><strong>التقييم الأسبوعي</strong><small>نقاط واضحة من ١٢</small></span><span class="action-arrow">←</span></button><button class="action-card gold-card" data-view="knight"><span class="action-symbol">★</span><span><strong>فارس الأسبوع</strong><small>احتفِ بالاجتهاد والتحسن</small></span><span class="action-arrow">←</span></button><button class="action-card purple-card" data-view="honors"><span class="action-symbol">✦</span><span><strong>التكريم الفصلي</strong><small>ثمرة رحلة الفصل الدراسي</small></span><span class="action-arrow">←</span></button></nav>
    ${admin ? '<div class="admin-tabs"><button class="light-button" data-view="reports">تقارير جميع الحلقات</button><button class="light-button" data-view="setup">الطلاب والفصول الدراسية</button></div>' : ''}
    <div id="dashboard-message" class="dashboard-message" role="status" hidden></div><section id="dashboard-content" aria-live="polite"></section>
    </main><footer class="dashboard-footer">مدارس الأندلس الأهلية · نحتفي بالتقدم والتحسن والإتقان</footer>
    <dialog id="dashboard-confirm" class="confirm-dialog"><h2></h2><p></p><div><button class="light-button" data-answer="cancel">العودة</button><button class="solid-button" data-answer="confirm">تأكيد</button></div></dialog></div>`;

  const content = root.querySelector('#dashboard-content');
  const termSelect = root.querySelector('#term-select');
  const weekSelect = root.querySelector('#week-select');
  const teacherSelect = root.querySelector('#teacher-select');
  const dialog = root.querySelector('#dashboard-confirm');
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
  async function mayLeave() { return (!dirty && !honorDirty && !knightDirty) || await confirm('تغييرات لم تُحفظ', 'هل تريد الانتقال وترك التغييرات غير المحفوظة؟'); }
  function updateSelectors() {
    termSelect.innerHTML = terms.length ? terms.map(term => `<option value="${esc(term.id)}">${esc(term.name)}${term.active ? '' : ' (مؤرشف)'}</option>`).join('') : '<option value="">لم تُحدد الفصول الدراسية بعد</option>';
    termSelect.value = termId;
    if (teacherSelect) { teacherSelect.innerHTML = teachers.map(row => `<option value="${esc(row.username)}">${esc(row.class_name)} · ${esc(row.full_name)}</option>`).join(''); teacherSelect.value = teacherId; }
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    weekSelect.innerHTML = weeks.length ? weeks.map((day, i) => `<option value="${day}">الأسبوع ${i + 1} · ${dateLabel(day)}${day > today() ? ' (قادم)' : ''}</option>`).join('') : '<option value="">بانتظار تواريخ الفصل الدراسي</option>';
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
      if (ticket !== generation) return;
      context = data; overview = report; loadScores(); render();
    } catch (error) { if (ticket !== generation) return; content.innerHTML = '<div class="empty-state"><h2>تعذر تحميل البيانات</h2><p>اضغط تحديث البيانات للمحاولة مرة أخرى.</p></div>'; notify(errorText(error), true); }
  }
  function empty(title, text, symbol = '✦') { return `<div class="empty-state"><span class="empty-symbol">${symbol}</span><h2>${esc(title)}</h2><p>${esc(text)}</p></div>`; }
  function render() {
    root.querySelectorAll('[data-view]').forEach(button => { button.classList.toggle('selected', button.dataset.view === view); button.setAttribute('aria-current', button.dataset.view === view ? 'page' : 'false'); });
    if (view === 'setup') { renderSetup(); return; }
    if (!termId) { content.innerHTML = empty('جاهزون لبدء الرحلة', 'ستظهر التقييمات بعد إضافة تواريخ الفصل الدراسي وقوائم الطلاب التي سترسلها الإدارة.'); return; }
    if (view === 'reports') { renderReports(); return; }
    if (!context.students.length) { content.innerHTML = empty('قائمة طلاب الحلقة قيد التجهيز', 'ستظهر أسماء طلاب هذه الحلقة فور إضافتها، لتقييمهم واختيار فارس الأسبوع والمكرَّمين.'); return; }
    if (view === 'evaluation') renderEvaluation();
    if (view === 'knight') renderKnight();
    if (view === 'honors') renderHonors();
  }
  function scoreCard(student) {
    const row = scores.get(student.id), total = scoreTotal(row);
    return `<article class="student-score-card" data-student="${esc(student.id)}"><header><span class="student-avatar" aria-hidden="true">${esc(student.full_name.trim().slice(0, 1))}</span><div><h3>${esc(student.full_name)}</h3><small>${student.student_code ? `رقم الطالب: ${esc(student.student_code)}` : student.active ? 'طالب الحلقة' : 'طالب مؤرشف · تقييم محفوظ'}</small></div><span class="total-badge">${total === null ? '—' : total}<small>/ ١٢</small></span></header><div class="score-groups">${SCORE_FIELDS.map(field => `<div class="score-group"><span id="label-${esc(student.id)}-${field.key}">${field.label}<small>${field.max} نقاط</small></span><div role="group" aria-labelledby="label-${esc(student.id)}-${field.key}">${Array.from({ length: field.max + 1 }, (_, n) => `<button type="button" class="point-chip" data-score="${field.key}" data-point="${n}" aria-pressed="${row[field.key] === n}" aria-label="${field.label}: ${n} نقاط" ${readonly() ? 'disabled' : ''}>${n}</button>`).join('')}</div></div>`).join('')}</div><div class="bonus-row"><label><input type="checkbox" data-bonus="bonus_memorization" ${row.bonus_memorization ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز الحفظ <b>+١</b></label><label><input type="checkbox" data-bonus="bonus_revision" ${row.bonus_revision ? 'checked' : ''} ${readonly() ? 'disabled' : ''}>تميز المراجعة <b>+١</b></label></div></article>`;
  }
  function renderEvaluation() {
    const students = weekStudents();
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">التقييم الأسبوعي</p><h2>نقاط تصنع أثرًا</h2><p>قيّم التحسن مقارنة بمستوى الطالب نفسه. نقطة التميز تُمنح لتجاوز المطلوب مع الإتقان.</p></div><span class="status-pill ${review()?.status === 'submitted' ? 'approved' : ''}">${review()?.status === 'submitted' ? '✓ أسبوع معتمد' : 'مسودة الأسبوع'}</span></div>
    <div class="evaluation-tools"><div id="rating-progress" class="progress-copy"></div><label class="search-box"><span>⌕</span><input id="student-search" placeholder="ابحث باسم الطالب" value="${esc(search)}"></label></div>
    <div class="students-grid" id="students-grid">${students.filter(student => student.full_name.includes(search)).map(scoreCard).join('')}</div><p id="search-empty" class="search-empty" ${students.some(student => student.full_name.includes(search)) ? 'hidden' : ''}>لا يوجد طالب بهذا الاسم.</p>
    <div class="save-bar"><span id="save-state">${readonly() ? 'النقاط محفوظة؛ يمكنك اختيار فارس الأسبوع.' : 'يمكنك حفظ مسودة والعودة إليها لاحقًا.'}</span><div>${readonly() ? '<button class="solid-button" data-view="knight">اختيار فارس الأسبوع ←</button>' + (admin && review()?.status === 'submitted' ? '<button class="light-button" id="reopen-week">إعادة فتح التقييم</button>' : '') : '<button class="light-button" id="save-draft">حفظ مسودة</button><button class="solid-button" id="submit-week">اعتماد نقاط الأسبوع</button>'}</div></div>`;
    updateProgress();
  }
  function updateProgress() {
    const count = completeCount(), all = scores.size;
    const element = root.querySelector('#rating-progress');
    if (element) element.innerHTML = `<strong>${count} <small>من ${all} طالبًا</small></strong><span>اكتمل تقييمهم</span><div class="progress-track"><i style="width:${all ? count / all * 100 : 0}%"></i></div>`;
    const status = root.querySelector('#save-state');
    if (status && !readonly()) status.textContent = dirty ? 'تغييرات جديدة لم تُحفظ بعد' : 'يمكنك حفظ مسودة والعودة إليها لاحقًا.';
  }
  function renderKnight() {
    const current = review();
    if (current?.status !== 'submitted') { content.innerHTML = empty('اعتمد نقاط الأسبوع أولًا', 'بعد اكتمال تقييم الطلاب واعتماد النقاط، ستظهر بطاقاتهم هنا لاختيار فارس الأسبوع.', '★') + '<button class="solid-button centered-button" data-view="evaluation">الذهاب إلى التقييم الأسبوعي</button>'; return; }
    const ranked = rankWeekly(context.evaluations.filter(row => row.review_id === current.id).map(row => ({ ...row, full_name: context.students.find(student => student.id === row.student_id)?.full_name || 'طالب' })));
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker gold-text">فارس الأسبوع</p><h2>نحتفي بالاجتهاد والتحسن</h2><p>الترتيب بالنقاط ثم التحسن. عند التعادل راعِ الإتقان ثم التميز في الحفظ والمراجعة.</p></div><span class="status-pill gold-status">${current.knight_student_id ? '★ تم اختيار الفارس' : 'بانتظار اختيارك'}</span></div>
    <div class="knight-grid">${ranked.map((row, i) => `<button class="knight-card ${chosenKnight === row.student_id ? 'chosen' : ''}" data-knight="${esc(row.student_id)}" aria-pressed="${chosenKnight === row.student_id}" ${!selectedTerm()?.active ? 'disabled' : ''}><span class="candidate-rank">${i + 1}</span><span class="knight-star">★</span><h3>${esc(row.full_name)}</h3><strong>${scoreTotal(row)} <small>/ ١٢ نقطة</small></strong><div class="candidate-detail"><span>التحسن <b>${row.improvement}/٢</b></span><span>التميز <b>${row.bonus_memorization + row.bonus_revision}/٢</b></span></div><span class="choice-label">${chosenKnight === row.student_id ? '✓ اختيارك لفارس الأسبوع' : 'اختيار هذا الطالب'}</span></button>`).join('')}</div>
    <div class="note-panel"><label for="knight-note">سبب الاختيار أو ملاحظة عند التعادل <small>(اختياري)</small></label><textarea id="knight-note" maxlength="500" placeholder="مثال: تحسن واضح في إتقان التسميع">${esc(current.knight_note)}</textarea></div><div class="save-bar"><span>يحتفظ الطالب بميداليته تقديرًا لإنجازه.</span><button class="gold-button" id="save-knight" ${!chosenKnight || !selectedTerm()?.active ? 'disabled' : ''}>حفظ فارس الأسبوع ★</button></div>`;
  }
  function renderHonors() {
    const summary = semesterSummary(context.students, context.reviews, context.evaluations).filter(student => student.weeks > 0);
    if (!summary.length) { content.innerHTML = empty('التكريم يبدأ برحلة التقييم', 'ستظهر النقاط التراكمية بعد اعتماد أول أسبوع. تُجمع نقاط التميز ضمن المجموع الفصلي.'); return; }
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker purple-text">التكريم الفصلي</p><h2>ثمرة رحلة من الاجتهاد</h2><p>اختر المكرَّمين بالنظر إلى النقاط والتحسن والاستمرارية والإتقان. عدد المكرَّمين يحدده قرار الإدارة.</p></div><span class="status-pill purple-status" id="honor-count">${selectedHonors.size} مختار للتكريم</span></div><div class="honors-list">${summary.map((student, i) => `<label class="honor-card ${selectedHonors.has(student.id) ? 'chosen' : ''}"><input type="checkbox" data-honor="${esc(student.id)}" ${selectedHonors.has(student.id) ? 'checked' : ''} ${!selectedTerm()?.active ? 'disabled' : ''}><span class="honor-order">${i + 1}</span><div class="honor-name"><h3>${esc(student.full_name)}</h3><small>${student.weeks} أسبوعًا معتمدًا</small></div><div class="honor-stats"><span>نقاط الفصل<strong>${student.total}</strong></span><span>نقاط التحسن<strong>${student.improvement}</strong></span><span>الحفظ والمراجعة<strong>${student.memorization_revision}</strong></span><span>الالتزام<strong>${student.commitment}</strong></span></div><span class="honor-icon">✦</span></label>`).join('')}</div><div class="note-panel"><label for="honor-note">ملاحظة التكريم <small>(اختياري)</small></label><textarea id="honor-note" maxlength="500" placeholder="ملاحظات عن التحسن والاستمرارية أو سبب الاختيار">${esc(context.honors[0]?.note || '')}</textarea></div><div class="save-bar"><span>النقاط من الأسابيع المعتمدة فقط، وتشمل نقاط التميز.</span><button class="purple-button" id="save-honors" ${!selectedTerm()?.active ? 'disabled' : ''}>حفظ قائمة التكريم ✦</button></div>`;
  }
  function renderReports() {
    if (!overview) return;
    const approved = overview.reviews.filter(row => row.week_start === week && row.status === 'submitted');
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">متابعة الإدارة</p><h2>صورة واحدة لجميع الحلقات</h2><p>اختر حلقة لعرض نقاط طلابها وفارس الأسبوع والتكريم الفصلي.</p></div><span class="status-pill">${approved.length} / ${teachers.length} حلقة اعتمدت الأسبوع</span></div><div class="report-grid">${teachers.map(row => { const current = overview.reviews.find(r => r.teacher_username === row.username && r.week_start === week); return `<button class="report-card" data-teacher-report="${esc(row.username)}"><span class="report-class">${esc(row.class_name)}</span><h3>${esc(row.full_name)}</h3><p>${overview.students.filter(student => student.teacher_username === row.username).length} طالبًا</p><span class="status-pill ${current?.status === 'submitted' ? 'approved' : ''}">${current?.status === 'submitted' ? '✓ معتمد' : current ? 'مسودة' : 'لم يبدأ التقييم'}</span><div><span>${current?.knight_student_id ? '★ تم اختيار الفارس' : '★ لم يُختر الفارس'}</span><span>✦ ${overview.honors.filter(h => h.teacher_username === row.username).length} مكرَّم</span></div></button>`; }).join('')}</div>`;
  }
  function renderSetup() {
    content.innerHTML = `<div class="section-heading"><div><p class="section-kicker">تجهيز البيانات</p><h2>الطلاب والفصول الدراسية</h2><p>يمكن إدخال القوائم التي ترسلها المدرسة هنا، ثم تظهر تلقائيًا للمعلم المسؤول.</p></div></div><div class="setup-grid"><form id="term-form" class="setup-card"><h3>إضافة فصل دراسي</h3><label>اسم الفصل الدراسي<input name="name" maxlength="100" required placeholder="مثال: الفصل الدراسي الأول"></label><div class="date-fields"><label>تاريخ البداية<input name="starts_on" type="date" required></label><label>تاريخ النهاية<input name="ends_on" type="date" required></label></div><button class="solid-button" type="submit">حفظ الفصل الدراسي</button></form><form id="students-form" class="setup-card"><h3>إضافة طلاب الحلقة ${esc(teacher().class_name || '')}</h3><p>أدخل اسمًا واحدًا في كل سطر. راجع الأسماء قبل الحفظ.</p><label>أسماء الطلاب<textarea name="names" required rows="7" placeholder="اسم الطالب الأول&#10;اسم الطالب الثاني"></textarea></label><button class="solid-button" type="submit" ${!teacherId ? 'disabled' : ''}>حفظ الطلاب لهذه الحلقة</button></form></div><div class="roster-summary"><h3>طلاب الحلقة الحاليون (${context.students.length})</h3><div>${context.students.map(student => `<span>${esc(student.full_name)}${student.active ? '' : ' (مؤرشف)'}</span>`).join('') || '<p>لم تُضف أسماء الطلاب بعد.</p>'}</div></div>`;
  }
  async function action(work, success) {
    if (busy) return;
    busy = true; root.classList.add('is-busy'); root.setAttribute('aria-busy', 'true');
    try { await work(); notify(success); } catch (error) { notify(errorText(error), true); }
    finally { busy = false; root.classList.remove('is-busy'); root.removeAttribute('aria-busy'); }
  }
  root.addEventListener('click', async event => {
    const nav = event.target.closest('[data-view]');
    if (nav && !busy) {
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
      chip.parentElement.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', button === chip ? 'true' : 'false'));
      const total = scoreTotal(row); card.querySelector('.total-badge').innerHTML = `${total === null ? '—' : total}<small>/ ١٢</small>`; updateProgress(); return;
    }
    const candidate = event.target.closest('[data-knight]');
    if (candidate && !busy) { chosenKnight = candidate.dataset.knight; knightDirty = true; root.querySelectorAll('[data-knight]').forEach(button => { const selected = button.dataset.knight === chosenKnight; button.classList.toggle('chosen', selected); button.setAttribute('aria-pressed', String(selected)); button.querySelector('.choice-label').textContent = selected ? '✓ اختيارك لفارس الأسبوع' : 'اختيار هذا الطالب'; }); root.querySelector('#save-knight').disabled = false; return; }
    const report = event.target.closest('[data-teacher-report]');
    if (report && !busy) { if (!await mayLeave()) return; teacherId = report.dataset.teacherReport; view = 'evaluation'; updateSelectors(); await loadContext(); return; }
    const id = event.target.closest('button')?.id;
    if (id === 'save-draft' || id === 'submit-week') {
      const submit = id === 'submit-week', rows = [...scores.values()];
      if (!rows.length || !rows.every(row => validateScores(row, submit))) { notify('أكمل النقاط الأساسية لجميع الطلاب قبل اعتماد الأسبوع.', true); return; }
      if (submit && !await confirm('اعتماد نقاط الأسبوع', 'ستُحفظ النقاط وتصل إلى الإدارة، ثم يمكنك اختيار فارس الأسبوع. تعديلها بعد الاعتماد يحتاج إعادة فتحها بواسطة الإدارة.')) return;
      await action(async () => { await repo.saveWeek({ p_teacher: teacherId, p_term: termId, p_week: week, p_rows: rows, p_submit: submit, p_version: review()?.version || 0 }); dirty = false; await loadContext(); }, submit ? 'تم اعتماد نقاط الأسبوع. يمكنك الآن اختيار فارس الأسبوع.' : 'تم حفظ المسودة في قاعدة البيانات.');
    }
    if (id === 'save-knight') await action(async () => { await repo.knight({ p_review: review().id, p_student: chosenKnight, p_note: root.querySelector('#knight-note').value.trim(), p_version: review().version }); await loadContext(); }, 'تم حفظ فارس الأسبوع وإظهاره للإدارة.');
    if (id === 'save-honors') await action(async () => { await repo.honors({ p_teacher: teacherId, p_term: termId, p_students: [...selectedHonors], p_note: root.querySelector('#honor-note').value.trim() }); honorDirty = false; await loadContext(); }, 'تم حفظ قائمة التكريم الفصلي.');
    if (id === 'reopen-week' && await confirm('إعادة فتح التقييم', 'سيصبح الأسبوع مسودة، ويُلغى اختيار فارسه الحالي حتى تُعتمد النقاط مرة أخرى.')) await action(async () => { await repo.reopen({ p_review: review().id, p_version: review().version }); await loadContext(); }, 'تمت إعادة فتح التقييم للتعديل.');
    if (id === 'refresh-dashboard' && !busy && await mayLeave()) await action(async () => {
      terms = await repo.terms();
      if (admin) { teachers = await repo.teachers(); teacherId ||= teachers[0]?.username || ''; }
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
    if (event.target.id === 'student-search') {
      search = event.target.value.trim();
      root.querySelector('#students-grid').innerHTML = weekStudents().filter(student => student.full_name.includes(search)).map(scoreCard).join('');
      root.querySelector('#search-empty').hidden = weekStudents().some(student => student.full_name.includes(search));
    }
    if (event.target.id === 'honor-note') honorDirty = true;
    if (event.target.id === 'knight-note') knightDirty = true;
  });
  root.addEventListener('submit', async event => {
    event.preventDefault();
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
  function beforeUnload(event) { if (dirty || honorDirty || knightDirty) { event.preventDefault(); event.returnValue = ''; } }
  window.addEventListener('beforeunload', beforeUnload);
  try {
    [terms, teachers] = await Promise.all([repo.terms(), admin ? repo.teachers() : Promise.resolve([account])]);
    teacherId ||= teachers[0]?.username || '';
    termId = terms.find(term => term.active && term.starts_on <= today() && term.ends_on >= today())?.id || terms.find(term => term.active)?.id || terms[0]?.id || '';
    const weeks = selectedTerm() ? termWeeks(selectedTerm()) : [];
    week = weeks.filter(value => value <= today()).at(-1) || weeks[0] || '';
    updateSelectors(); await loadContext();
  } catch (error) { content.innerHTML = empty('تعذر تحميل لوحة التحكم', 'اضغط تحديث البيانات بعد التأكد من اتصال الإنترنت.'); notify(errorText(error), true); }
}
