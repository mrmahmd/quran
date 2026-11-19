import { brandLockup } from './brand.mjs';
import { termMonths } from './monthly-model.mjs?v=monthly-finish1';
import { ayatByMonth, buildMonthlyComparison, comparisonKinds, hasRecordedComparison, memorizationOutlierLimit, summarizeMonthlyComparison } from './monthly-comparison-model.mjs?v=7';
import { bindChartTooltips, columnChart, divergingChart, formatAyatChange, formatPercentChange, kindColors } from './comparison-charts.mjs?v=3';
import { buildJuzReport, juzCategories } from './monthly-juz-report.mjs?v=3';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = new Intl.NumberFormat('ar-EG');
const signed = new Intl.NumberFormat('ar-EG', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('ar-EG', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
const achievementPercent = new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const periods = ['الشهر الأول', 'الشهر الثاني'];
const juzCounts = ['one', 'two', 'many', 'zero'];
const statuses = { up: 'زاد المقدار', down: 'قلّ المقدار', same: 'دون تغيير', new: 'بدأ التسجيل', unavailable: 'بلا نسبة تغيّر' };
const monthName = month => date.format(new Date(month + 'T00:00:00Z'));
const calculationRules = `<details class="mc-panel mc-rules"><summary>قواعد الحساب</summary><ul>
  <li>العدّ يعتمد على عدد آيات كل سورة من السور الـ١١٤، ويشمل آيتي البداية والنهاية.</li>
  <li>عند الرجوع نحو أول المصحف، يُحسب باقي سورة البداية، ثم كل السور الواقعة بينهما، ثم الآيات من أول سورة الوصول حتى آية النهاية. داخل كل سورة يبقى العدّ بترتيب الآيات.</li>
  <li>يُحسب الحفظ المحفوظ حتى لو المراجعة ناقصة، وتُحسب المراجعة المحفوظة حتى لو الحفظ ناقص. «لا يوجد» يُحسب صفرًا، والمقدار الناقص أو النصي والغياب لا يدخلون في إجمالي الآيات.</li>
  <li>لكل نوع، تُحسب نسبة التغيّر للطلاب أنفسهم ممن أمكن عدّ مقدارهم في الشهرين. إذا كان إجمالي الشهر الأول صفرًا ثم زاد المقدار، يظهر فرق الآيات فقط.</li>
  <li>الطالب المسجّل غائبًا يُستبعد من نسبة اكتمال تسجيل الشهر. السجل الفارغ لطالب غير مسجّل غائبًا يُعدّ ناقصًا.</li>
  <li>يُحتسب الجزء إذا غطّى حفظ الطالب جميع آياته على مدار الشهرين. تُحسب الآيات المكررة مرة واحدة.</li>
  <li>«تحسّن» و«تراجع» يعدّان الطلاب الذين زاد أو قلّ مقدارهم بين الشهرين، فلا يغطي طالب بمقدار كبير على بقية الحلقة.</li>
  <li>حفظ أكثر من ${new Intl.NumberFormat('ar-EG').format(memorizationOutlierLimit)} آية في شهر واحد يُميَّز للمراجعة؛ ويمكن استبعاده من نسبة التغيّر بالخيار الظاهر فوق النتائج.</li>
</ul></details>`;

function delta(result) {
  const label = result.percent === null
    ? result.first.legacy || result.second.legacy ? 'مقارنة نصية' : statuses[result.state]
    : '<bdi>' + percent.format(result.percent / 100) + '</bdi>';
  return '<span class="mc-delta mc-' + result.state + '">' + label + '</span>';
}

function amountCell(value) {
  return `<td>${value.count === null ? '' : '<strong>' + number.format(value.count) + ' آية</strong>'}
    <span>${escape(value.label)}</span>${value.legacy ? '<small>مقدار نصي</small>' : ''}</td>`;
}

function table(rows, kind) {
  const displayed = rows.filter(row => hasRecordedComparison(row[kind]));
  return `<div class="mc-table-wrap" role="region" aria-label="تفاصيل ${comparisonKinds[kind]}" tabindex="0">
    <table class="mc-table" aria-label="${comparisonKinds[kind]}">
    <thead><tr class="mc-table-title"><th colspan="5">${comparisonKinds[kind]}</th></tr>
      <tr><th scope="col">الطالب</th><th scope="col">${periods[0]}</th><th scope="col">${periods[1]}</th><th scope="col">فرق الآيات</th><th scope="col">نسبة التغيّر</th></tr></thead>
    <tbody>${displayed.map(row => {
      const value = row[kind];
      return `<tr${value.outlier ? ' class="mc-outlier-row"' : ''}><th scope="row">${escape(row.name)}${row.className ? '<small><bdi>' + escape(row.className) + '</bdi></small>' : ''}${value.outlier ? '<small class="mc-outlier-badge">⚠ مقدار كبير — راجعه</small>' : ''}</th>
        ${amountCell(value.first)}${amountCell(value.second)}
        <td><bdi>${value.change === null ? '—' : signed.format(value.change)}</bdi></td><td>${delta(value)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">لا توجد مقادير مسجّلة.</td></tr>'}</tbody></table></div>`;
}

function reportActions(title, months) {
  return `<header class="mc-actions"><div><h3>${escape(title)}</h3><p>${months.map(monthName).join(' · ')}</p></div>
    <button type="button" class="teal-button" data-mc-pdf>معاينة وحفظ PDF</button></header>`;
}

const absPercent = value => achievementPercent.format(Math.abs(value));
// Arabic counting: 1 طالب واحد, 2 طالبان, 3–10 طلاب, 11+ طالبًا.
const studentCount = count => count === 1 ? 'طالب واحد' : count === 2 ? 'طالبان' : `${number.format(count)} ${count >= 3 && count <= 10 ? 'طلاب' : 'طالبًا'}`;

function changeChip(change) {
  if (!change.compared) return '<span class="mc-chip mc-chip-na">لا تتوفر مقارنة</span>';
  if (change.rate === null) return change.difference > 0 ? '<span class="mc-chip mc-chip-up">↑ بدأ التسجيل</span>' : '<span class="mc-chip mc-chip-same">= دون تغيير</span>';
  const tone = change.difference > 0 ? 'up' : change.difference < 0 ? 'down' : 'same';
  return `<span class="mc-chip mc-chip-${tone}">${{ up: '↑', down: '↓', same: '=' }[tone]} <bdi>${absPercent(change.rate)}</bdi></span>`;
}

function changeSentence(change) {
  if (!change.compared) return 'لا يوجد طلاب أمكن عدّ مقدارهم في الشهرين.';
  const amount = change.difference > 0 ? `${number.format(change.difference)} آية أكثر من الشهر الأول`
    : change.difference < 0 ? `${number.format(-change.difference)} آية أقل من الشهر الأول` : 'نفس مقدار الشهر الأول';
  return `${amount} · ${studentCount(change.compared)} في المقارنة`;
}

function notices({ summary, reports, excludeOutliers }) {
  const items = [];
  if (!reports[0] || !reports[1]) items.push(`لا يوجد تقرير محفوظ ${!reports[0] && !reports[1] ? 'للشهرين' : !reports[0] ? 'للشهر الأول' : 'للشهر الثاني'} لهذه الحلقة؛ لذلك لا تظهر نسبة التغيّر.`);
  else if (Object.values(summary.changes).every(change => !change.compared && change.total)) items.push('مقادير أحد الشهرين مكتوبة نصًا ولم تُحدَّد بالسور والآيات؛ تظهر النسبة بعد تحويلها من تقرير المعلم.');
  summary.revisionCopies.forEach(({ copies, recorded }, index) => {
    if (recorded >= 3 && copies / recorded >= 0.5) items.push(`المراجعة مطابقة للحفظ حرفيًا عند ${number.format(copies)} من ${studentCount(recorded)} في ${periods[index]}؛ قد لا تعبّر أرقام المراجعة عن مراجعة فعلية.`);
  });
  const outliers = summary.changes.memorization.outliers;
  const toggle = outliers ? `<label class="mc-outlier-toggle"><input type="checkbox" data-mc-exclude-outliers ${excludeOutliers ? 'checked' : ''}>
    استبعاد ${outliers === 1 ? 'هذا الطالب' : `هؤلاء الطلاب (${number.format(outliers)})`} من نسبة التغيّر</label>` : '';
  if (outliers) items.push(`${outliers === 1 ? 'حفظ طالب واحد' : `حفظ ${studentCount(outliers)}`} تجاوز ${number.format(memorizationOutlierLimit)} آية في شهر واحد؛ راجع المقدار — غالبًا كُتبت المراجعة في خانة الحفظ. ${toggle}`);
  return items.length ? `<section class="mc-notices" aria-label="تنبيهات المقارنة">${items.map(item => `<p class="mc-notice"><span aria-hidden="true">!</span><span>${item}</span></p>`).join('')}</section>` : '';
}

// Summary tiles. Each tile has its own theme (mc-kpi-<theme>) and icon; numbers stay in ink colors.
function kpiTile({ theme, icon, label, value, body = '', foot = '' }) {
  return `<section class="mc-kpi mc-kpi-${theme}">
    <header class="mc-kpi-head"><span class="mc-kpi-icon" aria-hidden="true">${icon}</span><span class="mc-kpi-label">${label}</span></header>
    <strong class="mc-kpi-value">${value}</strong>
    ${body ? `<div class="mc-kpi-body">${body}</div>` : ''}
    ${foot ? `<footer class="mc-kpi-foot">${foot}</footer>` : ''}
  </section>`;
}

function teacherSummary({ months, average, changes }) {
  const rate = value => value === null ? '—' : achievementPercent.format(value);
  const icons = { memorization: '✦', revision: '↻' };
  const kinds = Object.entries(changes).map(([kind, change]) => kpiTile({
    theme: kind, icon: icons[kind],
    label: `آيات ${comparisonKinds[kind]}<small>${periods[1]}</small>`,
    value: change.compared ? `${number.format(change.second)}<small> آية</small>` : '—',
    body: `${changeChip(change)}<span class="mc-kpi-sentence">${changeSentence(change)}</span>`,
    foot: [change.compared ? `<span>${periods[0]}: <b>${number.format(change.first)}</b> آية</span>` : '', change.excluded ? `<span class="mc-kpi-note">مستبعد ${number.format(change.excluded)} لمقدار كبير</span>` : ''].filter(Boolean).join(''),
  })).join('');
  const memorization = changes.memorization;
  const improvedShare = memorization.compared ? memorization.improved / memorization.compared : 0;
  return `<div class="mc-kpis">${kinds}
    ${kpiTile({ theme: 'students', icon: '↑', label: 'طلاب تحسّن حفظهم<small>بين الشهرين</small>',
      value: memorization.compared ? `${number.format(memorization.improved)}<small> من ${studentCount(memorization.compared)}</small>` : '—',
      body: memorization.compared ? `<span class="mc-kpi-meter" aria-hidden="true"><i style="inline-size:${improvedShare * 100}%"></i></span>` : '',
      foot: memorization.compared ? `<span class="mc-up">↑ ${number.format(memorization.improved)} تحسّن</span><span class="mc-down">↓ ${number.format(memorization.declined)} تراجع</span><span class="mc-same">= ${number.format(memorization.unchanged)} ثابت</span>` : '' })}
    ${kpiTile({ theme: 'completion', icon: '✓', label: 'متوسط اكتمال التقرير<small>للشهرين</small>',
      value: `<bdi>${rate(average)}</bdi>`,
      body: average === null ? '' : `<span class="mc-kpi-meter" aria-hidden="true"><i style="inline-size:${average * 100}%"></i></span>`,
      foot: months.map((month, i) => `<span>${periods[i]}: <b><bdi>${rate(month.rate)}</bdi></b> (${number.format(month.completed)} من ${number.format(month.total)})</span>`).join('') })}
  </div>`;
}

function comparisonChart(changes) {
  const kinds = Object.keys(comparisonKinds).filter(kind => changes[kind].compared);
  if (!kinds.length) return '';
  return `<section class="mc-panel mc-chart-panel">${columnChart({
    title: 'الشهر الأول مقابل الشهر الثاني',
    caption: `مجموع الآيات لنفس الطلاب في الشهرين · ${kinds.map(kind => `${comparisonKinds[kind]}: ${studentCount(changes[kind].compared)}`).join(' · ')}`,
    categories: periods,
    series: kinds.map(kind => ({ name: comparisonKinds[kind], color: kindColors[kind], values: [changes[kind].first, changes[kind].second] })),
  })}</section>`;
}

function trendChart(trend, months) {
  if (!trend) return '';
  const totals = ayatByMonth(trend.map(month => month.entries));
  const saved = trend.map(month => !!month.report);
  if (saved.filter(Boolean).length < 1) return '';
  const labels = ['الشهر الأول', 'الشهر الثاني', 'الشهر الثالث', 'الشهر الرابع'].slice(0, months.length);
  return `<section class="mc-panel mc-chart-panel">${columnChart({
    title: 'إجمالي آيات الحفظ والمراجعة في الحلقة',
    caption: 'كل ما سُجّل لطلاب الحلقة في كل شهر من الفصل الدراسي؛ «—» يعني لا يوجد تقرير محفوظ لذلك الشهر.',
    categories: labels,
    series: Object.keys(comparisonKinds).map(kind => ({ name: comparisonKinds[kind], color: kindColors[kind],
      values: totals.map((month, index) => saved[index] ? month[kind].ayat : null) })),
  })}</section>`;
}

function kindSwitch(selected, label) {
  return `<div class="mc-kind-switch" role="group" aria-label="${label}">${Object.entries(comparisonKinds).map(([kind, name]) =>
    `<button type="button" data-mc-kind="${kind}" aria-pressed="${kind === selected}">${name}</button>`).join('')}</div>`;
}

function studentsChart(rows, kind, excludeOutliers) {
  const data = rows.filter(row => hasRecordedComparison(row[kind])).map(row => {
    const value = row[kind];
    const excluded = excludeOutliers && value.outlier;
    return { label: row.name, value: excluded || value.change === null ? null : value.change,
      note: excluded ? 'مستبعد: مقدار كبير' : value.change === null ? (value.first.legacy || value.second.legacy ? 'مقدار نصي' : 'غائب أو غير مسجّل') : `من ${number.format(value.first.count)} إلى ${number.format(value.second.count)} آية` };
  });
  return `<section class="mc-panel mc-chart-panel"><div class="mc-chart-heading">${kindSwitch(kind, 'نوع المقدار في رسم الطلاب')}</div>${divergingChart({
    title: `تغيّر ${comparisonKinds[kind]} لكل طالب`, caption: 'فرق الآيات بين الشهر الثاني والأول، مرتب من الأكثر زيادة.',
    rows: data, format: value => formatAyatChange(value), emptyText: 'لا يوجد طلاب أمكن عدّ مقدارهم في الشهرين.',
  })}</section>`;
}

function schoolRanking(school, teachers, kind) {
  const rows = [...teachers.values()].map(teacher => {
    const students = school.students.filter(student => student.teacher_username === teacher.username);
    const [first, second] = school.entries.map(entries => entries.filter(entry => entry.teacher_username === teacher.username));
    if (!first.length && !second.length) return null;
    const change = summarizeMonthlyComparison(students, first, second, buildMonthlyComparison(students, first, second)).changes[kind];
    const label = [teacher.full_name, teacher.ring_name || teacher.class_name].filter(Boolean).join(' · ');
    return { label, value: change.rate, note: change.compared ? `${changeSentence(change)}` : !first.length || !second.length ? 'لا يوجد تقرير لأحد الشهرين' : 'مقادير نصية أو غير مكتملة' };
  }).filter(Boolean);
  return `<section class="mc-panel mc-chart-panel"><div class="mc-chart-heading">${kindSwitch(kind, 'نوع المقدار في ترتيب المعلمين')}</div>${divergingChart({
    title: `ترتيب الحلقات حسب تغيّر ${comparisonKinds[kind]}`, caption: 'نسبة تغيّر مجموع الآيات لنفس الطلاب بين الشهر الأول والثاني.',
    rows, format: value => formatPercentChange(value), emptyText: 'لا توجد حلقات لها تقريران قابلان للمقارنة.',
  })}</section>`;
}

function meter(fraction, color) {
  return `<span class="mc-meter" aria-hidden="true" style="--mc-meter-color:${color}"><i style="inline-size:${fraction * 100}%"></i></span>`;
}

function juzSummary({ buckets, measurable, total }, interactive) {
  const metric = (key, measured) => {
    const count = buckets[key].length;
    const fraction = measured && measurable ? count / measurable : null;
    const rate = fraction === null ? '—' : achievementPercent.format(fraction);
    const contents = `<span class="mc-juz-label">${juzCategories[key]}</span>
      <span class="mc-juz-values"><strong><bdi>${number.format(count)}</bdi></strong>${measured ? `<bdi>${rate}</bdi>` : ''}</span>
      ${measured ? meter(fraction ?? 0, 'var(--mc-category)') : ''}`;
    const className = `mc-juz-metric mc-juz-${key}`;
    return interactive && count
      ? `<button type="button" class="${className}" data-mc-juz-category="${key}">${contents}</button>`
      : `<div class="${className}">${contents}</div>`;
  };
  return `<section class="mc-panel mc-juz-summary" aria-label="الأجزاء المكتملة خلال الشهرين">
    <div class="mc-juz-heading"><div><h3>الأجزاء المكتملة خلال الشهرين</h3>
      <p class="mc-method">النسب من الطلاب القابلين للحساب</p></div>
      <div class="mc-coverage"><strong>${number.format(measurable)} من ${number.format(total)}</strong><span>طلاب قابلون للحساب</span></div></div>
    <div class="mc-juz-grid">${juzCounts.map(key => metric(key, true)).join('')}</div>
    <div class="mc-juz-exclusions">${['unresolved', 'absent', 'missing'].map(key => metric(key, false)).join('')}</div>
  </section>`;
}

function juzStudents(rows, teachers) {
  return `<div class="mc-table-wrap" role="region" aria-label="الطلاب والأجزاء المكتملة" tabindex="0"><table class="mc-table mc-juz-table">
    <thead><tr><th scope="col">الطالب</th><th scope="col">الحلقة / الفصل</th><th scope="col">المعلم</th><th scope="col">أرقام الأجزاء المكتملة</th></tr></thead>
    <tbody>${rows.map(row => {
      const owners = row.teachers.map(username => teachers.get(username)).filter(Boolean);
      const groups = [...new Set([row.className, ...owners.map(teacher => teacher.ring_name || teacher.class_name)].filter(Boolean))];
      return `<tr><th scope="row">${escape(row.name)}</th><td>${escape(groups.join('، ') || '—')}</td>
        <td>${escape(owners.map(teacher => teacher.full_name).join('، ') || '—')}</td><td>${row.juz.map(part => number.format(part)).join('، ') || '—'}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function printReport({ title, months, term, summary, juz, charts = '' }) {
  return `<article class="report-document mc-document" lang="ar" dir="rtl">
    <header class="mc-print-header"><div class="mc-print-brand">${brandLockup()}</div>
      <div><h1>${escape(title)}</h1><p>${escape(term.name)} · ${months.map(monthName).join(' · ')}</p></div></header>
    ${summary ? teacherSummary(summary) : ''}
    ${charts}
    ${juzSummary(juz, false)}
  </article>`;
}

// canMessage/messageTeacher: the administration's WhatsApp button at the top of a teacher's comparison.
export function createMonthlyComparison({ repo, openPdf, openMonthlyReport, canMessage = () => false, messageTeacher = null }) {
  let selected = '', excludeOutliers = false, chartKind = 'memorization';

  function show(host, term, teachers) {
    const months = termMonths(term).slice(0, 2);
    const options = teachers.slice().sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    const teacherNames = new Map(options.map(teacher => [teacher.username, teacher]));
    if (!options.some(teacher => teacher.username === selected)) selected = '';
    host.innerHTML = `<section class="mc-workspace" aria-labelledby="mc-title">
      <header class="mc-hero"><h2 id="mc-title">مقارنة الحفظ والمراجعة</h2>
        <div class="mc-controls"><label>عرض التقرير<select data-mc-teacher aria-label="المعلم">
          <option value="">المدرسة كلها</option>${options.map(teacher => `<option value="${escape(teacher.username)}">
            ${escape([teacher.full_name, teacher.ring_name || teacher.class_name].filter(Boolean).join(' · '))}</option>`).join('')}
        </select></label><button type="button" data-mc-refresh class="light-button" disabled>تحديث</button></div>
      </header>${calculationRules}<p class="mc-status" role="status"></p><div class="mc-result"></div>
      <dialog class="confirm-dialog mc-dialog" aria-labelledby="mc-student-name"><div class="mc-student-data"></div>
        <footer><button class="light-button" type="button" data-mc-close>إغلاق التفاصيل</button></footer></dialog>
    </section>`;
    const workspace = host.querySelector('.mc-workspace');
    const select = workspace.querySelector('[data-mc-teacher]');
    const refresh = workspace.querySelector('[data-mc-refresh]');
    const status = workspace.querySelector('.mc-status');
    const result = workspace.querySelector('.mc-result');
    const dialog = workspace.querySelector('.mc-dialog');
    dialog.querySelector('[data-mc-close]').addEventListener('click', () => dialog.close());
    bindChartTooltips(workspace);
    let request = 0, snapshot, source;

    // Redraws from the loaded data (toggles never refetch).
    function draw() {
      if (!source) return;
      if (source.school) {
        const { school, juz } = source;
        snapshot = { title: 'ملخص المدرسة', months, term, juz, charts: schoolRanking(school, teacherNames, 'memorization') };
        result.innerHTML = reportActions(snapshot.title, months) + schoolRanking(school, teacherNames, chartKind) + juzSummary(juz, true);
        return;
      }
      const { teacher, data, trend, whatsapp } = source;
      const rows = buildMonthlyComparison(data.students, data.first.entries, data.second.entries);
      const summary = summarizeMonthlyComparison(data.students, data.first.entries, data.second.entries, rows, { excludeOutliers });
      const juz = buildJuzReport(data.students, data.first.entries, data.second.entries)[2];
      const title = [teacher.full_name, teacher.ring_name || teacher.class_name].filter(Boolean).join(' · ');
      const charts = comparisonChart(summary.changes) + trendChart(trend, termMonths(term));
      snapshot = { title, teacher, months, term, summary, juz, charts: charts + studentsChart(rows, 'memorization', excludeOutliers) };
      status.textContent = rows.length ? '' : 'لا توجد مقادير حفظ أو مراجعة مسجّلة لهذه الحلقة في الشهرين.';
      result.innerHTML = whatsapp + reportActions(title, months)
        + notices({ summary, reports: [data.first.report, data.second.report], excludeOutliers })
        + teacherSummary(summary) + `<div class="mc-chart-grid">${charts}</div>` + studentsChart(rows, chartKind, excludeOutliers) + juzSummary(juz, true);
      const sourceReports = [data.first, data.second].map((value, index) => value.report
        ? `<button type="button" class="light-button" data-mc-report="${index}">فتح تقرير ${periods[index]}</button>`
        : '').join('');
      if (rows.length || sourceReports) {
        result.insertAdjacentHTML('beforeend', `<details class="mc-panel mc-student-details"><summary>تفاصيل الطلاب والتقارير الشهرية</summary>
          <div class="mc-source-reports">${sourceReports}</div>
          ${rows.length ? Object.keys(comparisonKinds).map(key => table(rows, key)).join('') : ''}
        </details>`);
      }
    }

    async function load() {
      const ticket = ++request;
      const teacher = options.find(item => item.username === selected);
      snapshot = undefined;
      source = undefined;
      result.replaceChildren();
      refresh.disabled = true;
      status.textContent = 'جارٍ تحميل التقريرين…';
      try {
        if (!teacher) {
          const school = await repo.monthlySchoolComparison(term.id, months);
          if (ticket !== request || !workspace.isConnected) return;
          source = { school: true, school, juz: buildJuzReport(school.students, ...school.entries)[2] };
          status.textContent = '';
          draw();
          return;
        }
        const [data, trend] = await Promise.all([
          repo.monthlyComparison(teacher.username, term.id, months),
          repo.monthlyTrend ? repo.monthlyTrend(teacher.username, term.id, termMonths(term)).catch(() => null) : null,
        ]);
        if (ticket !== request || !workspace.isConnected) return;
        const whatsapp = messageTeacher && canMessage(teacher.username)
          ? `<div class="mc-whatsapp-bar"><div><strong>تواصل مع ${escape(teacher.full_name)}</strong><span>أرسل له ملاحظتك عن تقرير الحلقة مباشرة على واتساب.</span></div>
            <button type="button" class="whatsapp-button" data-mc-whatsapp><span aria-hidden="true">💬</span> إرسال رسالة على واتساب</button></div>`
          : messageTeacher ? '<p class="whatsapp-missing mc-whatsapp-missing">لا يوجد رقم هاتف مسجّل لهذا المعلم؛ لا يمكن إرسال رسالة واتساب.</p>' : '';
        source = { teacher, data, trend, whatsapp };
        draw();
      } catch (error) {
        console.error('monthly comparison', error);
        if (ticket === request && workspace.isConnected) status.textContent = 'تعذّر تحميل المقارنة. اضغط تحديث للمحاولة مرة أخرى.';
      } finally {
        if (ticket === request && workspace.isConnected) refresh.disabled = false;
      }
    }

    select.value = selected;
    select.addEventListener('change', () => { selected = select.value; load(); });
    refresh.addEventListener('click', load);
    result.addEventListener('change', event => {
      if (!event.target.matches('[data-mc-exclude-outliers]')) return;
      excludeOutliers = event.target.checked;
      draw();
      result.querySelector('[data-mc-exclude-outliers]')?.focus();
    });
    result.addEventListener('click', event => {
      const kindButton = event.target.closest('[data-mc-kind]');
      if (kindButton) {
        chartKind = kindButton.dataset.mcKind;
        draw();
        result.querySelector(`[data-mc-kind="${chartKind}"]`)?.focus();
        return;
      }
      const button = event.target.closest('button');
      if (!button || !snapshot) return;
      if (button.hasAttribute('data-mc-whatsapp') && snapshot.teacher) {
        messageTeacher(snapshot.teacher.username, snapshot.months.map(monthName));
        return;
      }
      if (button.hasAttribute('data-mc-report')) {
        openMonthlyReport(snapshot.teacher.username, snapshot.months[Number(button.dataset.mcReport)]);
        return;
      }
      if (button.hasAttribute('data-mc-pdf')) openPdf(printReport(snapshot));
      if (button.hasAttribute('data-mc-juz-category')) {
        const key = button.dataset.mcJuzCategory;
        const rows = snapshot.juz.buckets[key];
        dialog.querySelector('.mc-student-data').innerHTML = `<h3 id="mc-student-name">${juzCategories[key]} خلال الشهرين</h3>${juzStudents(rows, teacherNames)}`;
        dialog.showModal();
      }
    });
    load();
  }

  return { show };
}
