import { brandLockup } from './brand.mjs';
import { termMonths } from './monthly-model.mjs?v=monthly-finish1';
import { buildMonthlyComparison, comparisonKinds, hasRecordedComparison, summarizeMonthlyComparison } from './monthly-comparison-model.mjs?v=5';
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
const juzPeriods = [...periods, 'إجمالي الشهرين'];
const statuses = { up: 'زاد المقدار', down: 'قلّ المقدار', same: 'دون تغيير', new: 'بدأ التسجيل', unavailable: 'بلا نسبة تغيّر' };
const monthName = month => date.format(new Date(month + 'T00:00:00Z'));
const calculationRules = `<section class="mc-panel mc-rules"><h3>قواعد الحساب</h3><ul>
  <li>العدّ يعتمد على عدد آيات كل سورة من السور الـ١١٤، ويشمل آيتي البداية والنهاية.</li>
  <li>عند الرجوع نحو أول المصحف، يُحسب باقي سورة البداية، ثم كل السور الواقعة بينهما، ثم الآيات من أول سورة الوصول حتى آية النهاية. داخل كل سورة يبقى العدّ بترتيب الآيات.</li>
  <li>يُحسب الحفظ المحفوظ حتى لو المراجعة ناقصة، وتُحسب المراجعة المحفوظة حتى لو الحفظ ناقص. «لا يوجد» يُحسب صفرًا، والمقدار الناقص أو النصي والغياب لا يدخلون في إجمالي الآيات.</li>
  <li>لكل نوع، تُحسب نسبة التغيّر للطلاب أنفسهم ممن أمكن عدّ مقدارهم في الشهرين. إذا كان إجمالي الشهر الأول صفرًا ثم زاد المقدار، يظهر فرق الآيات فقط.</li>
</ul></section>`;

function delta(result) {
  const label = result.percent === null
    ? result.first.legacy || result.second.legacy ? 'مقارنة نصية' : statuses[result.state]
    : '<bdi>' + percent.format(result.percent / 100) + '</bdi>';
  return '<span class="mc-delta mc-' + result.state + '">' + label + '</span>';
}

function chart(rows, kind, interactive) {
  const recorded = rows.map((row, index) => ({ row, index })).filter(({ row }) => hasRecordedComparison(row[kind]));
  if (!recorded.length) return `<section class="mc-panel mc-chart"><h3>ملخص ${comparisonKinds[kind]}</h3>
    <p class="mc-method">لا يوجد مقدار ${comparisonKinds[kind]} مسجّل في الشهرين.</p></section>`;
  const totals = Object.fromEntries(Object.keys(statuses).map(key => [key, 0]));
  let maximum = 1;
  for (const { row } of recorded) {
    const result = row[kind];
    totals[result.state]++;
    maximum = Math.max(maximum, result.first.count ?? 0, result.second.count ?? 0);
  }
  const stats = Object.entries(statuses).map(([state, label]) =>
    '<div class="mc-stat mc-' + state + '"><strong>' + number.format(totals[state]) + '</strong><span>' + label + '</span></div>').join('');
  const bar = (amount, index) => amount.legacy
    ? `<div class="mc-bar mc-bar-text mc-period-${index}"><b>${periods[index]}</b> <span>${escape(amount.label)}</span></div>`
    : `<div class="mc-bar mc-period-${index}" aria-label="${periods[index]}">
    <span class="mc-track" aria-hidden="true">${amount.count > 0 ? '<i style="--mc-size:' + (amount.count * 100 / maximum) + '%"></i>' : ''}</span>
    <span>${amount.count === null ? escape(amount.label) : number.format(amount.count)}</span>
  </div>`;
  const items = recorded.map(({ row, index }) => {
    const name = escape(row.name);
    const title = interactive ? '<button type="button" data-mc-student="' + index + '">' + name + '</button>' : '<strong>' + name + '</strong>';
    const result = row[kind];
    return `<li class="mc-chart-row"><span class="mc-chart-name">${title}</span>
      <div class="mc-bars">${bar(result.first, 0)}${bar(result.second, 1)}</div>${delta(result)}</li>`;
  }).join('');
  return `<section class="mc-panel mc-chart"><h3>ملخص ${comparisonKinds[kind]}</h3>
    <div class="mc-stats">${stats}</div>
    <div class="mc-legend"><span class="mc-period-0">${periods[0]}</span><span class="mc-period-1">${periods[1]}</span><small>المقدار بعدد الآيات</small></div>
    <ul class="mc-chart-list">${items}</ul></section>`;
}

function amountCell(value) {
  return `<td>${value.count === null ? '' : '<strong>' + number.format(value.count) + ' آية</strong>'}
    <span>${escape(value.label)}</span>${value.legacy ? '<small>مقدار نصي</small>' : ''}</td>`;
}

function table(rows, kind, includeUnrecorded = false) {
  const displayed = includeUnrecorded ? rows : rows.filter(row => hasRecordedComparison(row[kind]));
  return `<div class="mc-table-wrap" role="region" aria-label="تفاصيل ${comparisonKinds[kind]}" tabindex="0">
    <table class="mc-table" aria-label="${comparisonKinds[kind]}">
    <thead><tr class="mc-table-title"><th colspan="5">${comparisonKinds[kind]}</th></tr>
      <tr><th scope="col">الطالب</th><th scope="col">${periods[0]}</th><th scope="col">${periods[1]}</th><th scope="col">فرق الآيات</th><th scope="col">نسبة التغيّر</th></tr></thead>
    <tbody>${displayed.map(row => {
      const value = row[kind];
      return `<tr><th scope="row">${escape(row.name)}${row.className ? '<small><bdi>' + escape(row.className) + '</bdi></small>' : ''}</th>
        ${amountCell(value.first)}${amountCell(value.second)}
        <td><bdi>${value.change === null ? '—' : signed.format(value.change)}</bdi></td><td>${delta(value)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">لا توجد مقادير مسجّلة.</td></tr>'}</tbody></table></div>`;
}

function metadata(teacher, months, data, interactive = false) {
  return `<div class="mc-metadata"><div><span>المعلم</span><strong>${escape(teacher.full_name)}</strong>
    <bdi>${escape(teacher.ring_name || teacher.class_name)}</bdi></div>
    ${[data.first, data.second].map((value, i) => `<div><span>${periods[i]}</span><strong>${monthName(months[i])}</strong>
      <small>${value.report ? `تقرير محفوظ · ${number.format(value.entries.length)} سجل طالب` : 'لا يوجد تقرير محفوظ'}</small>
      ${interactive && value.report ? `<button type="button" class="light-button" data-mc-report="${i}">فتح تقرير ${periods[i]}</button>` : ''}</div>`).join('')}</div>`;
}

function teacherSummary({ months, average, changes, monthlyTotals }) {
  const rate = value => value === null ? '—' : achievementPercent.format(value);
  return `<section class="mc-panel mc-summary"><h3>إنجاز المعلم خلال الشهرين</h3>
    <div class="mc-summary-grid"><div class="mc-summary-average"><span>متوسط الشهرين</span><strong>${rate(average)}</strong></div>
    ${months.map((month, i) => `<div><span>${periods[i]}</span><strong>${rate(month.rate)}</strong>
      <small>${number.format(month.completed)} من ${number.format(month.total)} طالبًا مكتملًا ومحفوظًا</small></div>`).join('')}</div>
    <p class="mc-method">هذه نسبة اكتمال تسجيل التقرير لكل شهر. المتوسط يعطي الشهرين الوزن نفسه.</p>
    <h3>مقارنة إجمالي الآيات</h3>
    <div class="mc-table-wrap" tabindex="0" role="region" aria-label="مقارنة إجمالي الآيات"><table class="mc-table mc-totals-table">
    <thead><tr><th scope="col">المقدار</th>${periods.map(period => `<th scope="col">${period}</th>`).join('')}
    <th scope="col">فرق الآيات</th><th scope="col">نسبة التغيّر</th><th scope="col">الطلاب المشتركون في الحساب</th></tr></thead>
    <tbody>${Object.entries(changes).map(([kind, value]) => `<tr><th scope="row">${comparisonKinds[kind]}</th>
      ${monthlyTotals[kind].map(total => `<td>${total.students ? `<strong>${number.format(total.ayat)} آية</strong><small>${number.format(total.students)} طالبًا</small>` : '—'}</td>`).join('')}
      <td><bdi>${value.compared ? signed.format(value.difference) : '—'}</bdi></td>
      <td><bdi>${value.rate === null ? '—' : percent.format(value.rate)}</bdi>${value.compared && value.rate === null ? '<small>بدأ من صفر</small>' : ''}</td>
      <td>${number.format(value.compared)} من ${number.format(value.total)}${value.compared ? `<small>${number.format(value.first)} ← ${number.format(value.second)} آية</small>` : ''}</td>
    </tr>`).join('')}</tbody></table></div>
    <p class="mc-method">عمود الطلاب المشتركون يوضح عدد من أمكن عدّ مقدارهم في الشهرين من بين من سجّل لهم المعلم نفس النوع في الشهرين.</p></section>`;
}

function juzSummary(juz, interactive) {
  const cell = (period, index, key) => {
    const count = period.buckets[key].length;
    const measured = ['one', 'two', 'many', 'zero'].includes(key);
    const rate = measured && period.measurable ? achievementPercent.format(count / period.measurable) : '';
    const value = `<bdi class="mc-juz-number" dir="ltr">${number.format(count)}</bdi>${rate ? `<bdi class="mc-juz-rate" dir="ltr">${rate}</bdi>` : ''}`;
    return `<td>${interactive && count ? `<button type="button" class="mc-count" data-mc-juz-period="${index}" data-mc-juz-category="${key}" aria-label="${juzCategories[key]}، ${juzPeriods[index]}، ${number.format(count)} طالبًا${rate ? `، ${rate}` : ''}">${value}</button>` : `<span class="mc-count-static${count ? '' : ' mc-count-zero'}">${value}</span>`}</td>`;
  };
  return `<section class="mc-panel mc-summary mc-juz-summary"><h3>الأجزاء المكتملة في الحفظ</h3>
    <div class="mc-table-wrap" tabindex="0" role="region" aria-label="توزيع الأجزاء المكتملة"><table class="mc-table mc-juz-table">
      <thead><tr><th scope="col">مقدار الحفظ</th>${juzPeriods.map(period => `<th scope="col">${period}</th>`).join('')}</tr></thead>
      <tbody>${Object.entries(juzCategories).map(([key, label]) => `<tr class="mc-juz-${key}"><th scope="row">${label}</th>${juz.map((period, index) => cell(period, index, key)).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr><th scope="row">الطلاب القابلون للحساب</th>${juz.map(period => `<td><bdi class="mc-juz-number" dir="ltr">${number.format(period.measurable)}</bdi><span>من <bdi dir="ltr">${number.format(period.total)}</bdi></span></td>`).join('')}</tr></tfoot>
    </table></div>
    <p class="mc-method">النسب من الطلاب القابلين للحساب في كل عمود. إجمالي الشهرين يجمع الآيات المحفوظة مرة واحدة ويحتسب الجزء عند اكتمال جميع آياته.</p></section>`;
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

function printSchoolReport({ term, juz, teacherNames }) {
  return `<article class="report-document mc-document" lang="ar" dir="rtl">
    <header class="mc-print-header"><div class="mc-print-brand">${brandLockup()}</div>
    <div><h1>تقرير الأجزاء المكتملة على مستوى المدرسة</h1><p>${escape(term.name)}</p></div></header>
    ${calculationRules}
    ${juzSummary(juz, false)}
    ${juz.map((period, index) => {
      const rows = Object.values(period.buckets).flat().filter(row => row.juz.length);
      return rows.length ? `<section class="mc-panel"><h2>${juzPeriods[index]} · الطلاب الذين أكملوا أجزاء</h2>${juzStudents(rows, teacherNames)}</section>` : '';
    }).join('')}
  </article>`;
}

function printReport({ teacher, months, term, data, rows, summary, juz, kind }) {
  return `<article class="report-document mc-document" lang="ar" dir="rtl">
    <header class="mc-print-header"><div class="mc-print-brand">${brandLockup()}</div>
      <div><h1>مقارنة الحفظ والمراجعة الشهرية</h1><p>${escape(term.name)}</p></div></header>
    ${calculationRules}
    ${metadata(teacher, months, data)}
    ${teacherSummary(summary)}
    ${juzSummary(juz, false)}
    ${chart(rows, kind, false)}
    <section class="mc-panel mc-print-details"><h2>التقرير المفصّل للطلاب</h2>
      ${Object.keys(comparisonKinds).map(key => table(rows, key)).join('')}</section>
  </article>`;
}

export function createMonthlyComparison({ repo, openPdf, openMonthlyReport }) {
  let selected = '', kind = 'memorization';

  function show(host, term, teachers) {
    const months = termMonths(term).slice(0, 2);
    const options = teachers.slice().sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    const teacherNames = new Map(options.map(teacher => [teacher.username, teacher]));
    if (!options.some(teacher => teacher.username === selected)) selected = '';
    host.innerHTML = `<section class="mc-workspace" aria-labelledby="mc-title">
      <header class="mc-hero"><div><h2 id="mc-title">مقارنة الحفظ والمراجعة الشهرية</h2>
        <p>الأجزاء المكتملة على مستوى المدرسة ومقارنة الحفظ والمراجعة لكل معلم.</p></div>
        <div class="mc-controls"><label>المعلم<select data-mc-teacher aria-label="المعلم">
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
    let request = 0, snapshot;

    async function load() {
      const ticket = ++request;
      const teacher = options.find(item => item.username === selected);
      snapshot = undefined;
      result.replaceChildren();
      refresh.disabled = true;
      status.textContent = 'جارٍ تحميل التقريرين…';
      try {
        if (!teacher) {
          const school = await repo.monthlySchoolComparison(term.id, months);
          if (ticket !== request || !workspace.isConnected) return;
          const juz = buildJuzReport(school.students, ...school.entries);
          snapshot = { term, juz, teacherNames };
          status.textContent = '';
          result.innerHTML = `<div class="mc-actions"><h3>تقرير المدرسة</h3><button type="button" class="teal-button" data-mc-pdf>معاينة وحفظ PDF</button></div>${juzSummary(juz, true)}`;
          return;
        }
        const data = await repo.monthlyComparison(teacher.username, term.id, months);
        if (ticket !== request || !workspace.isConnected) return;
        const rows = buildMonthlyComparison(data.students, data.first.entries, data.second.entries);
        const summary = summarizeMonthlyComparison(data.students, data.first.entries, data.second.entries, rows);
        const juz = buildJuzReport(data.students, data.first.entries, data.second.entries);
        snapshot = { teacher, months, term, data, rows, summary, juz };
        status.textContent = rows.length ? '' : 'لا توجد مقادير حفظ أو مراجعة مسجّلة لهذه الحلقة في الشهرين.';
        result.innerHTML = metadata(teacher, months, data, true);
        result.insertAdjacentHTML('beforeend', teacherSummary(summary));
        result.insertAdjacentHTML('beforeend', juzSummary(juz, true));
        if (!rows.length) return;
        result.insertAdjacentHTML('beforeend', `<div class="mc-actions">
          <div role="group" aria-label="نوع المقارنة">${Object.entries(comparisonKinds).map(([key, label]) =>
            `<button type="button" data-mc-kind="${key}" aria-pressed="${kind === key}">${label}</button>`).join('')}</div>
          <button type="button" class="teal-button" data-mc-pdf>معاينة وحفظ PDF</button></div>
          <div class="mc-chart-area">${chart(rows, kind, true)}</div>
          <section class="mc-panel"><h3>التقرير المفصّل للطلاب</h3>
            ${Object.keys(comparisonKinds).map(key => table(rows, key)).join('')}
          </section>`);
      } catch {
        if (ticket === request && workspace.isConnected) status.textContent = 'تعذّر تحميل المقارنة. اضغط تحديث للمحاولة مرة أخرى.';
      } finally {
        if (ticket === request && workspace.isConnected) refresh.disabled = false;
      }
    }

    select.value = selected;
    select.addEventListener('change', () => { selected = select.value; load(); });
    refresh.addEventListener('click', load);
    result.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button || !snapshot) return;
      if (button.hasAttribute('data-mc-report')) {
        openMonthlyReport(snapshot.teacher.username, snapshot.months[Number(button.dataset.mcReport)]);
        return;
      }
      if (button.hasAttribute('data-mc-pdf')) openPdf(snapshot.teacher ? printReport({ ...snapshot, kind }) : printSchoolReport(snapshot));
      if (button.hasAttribute('data-mc-juz-category')) {
        const period = Number(button.dataset.mcJuzPeriod), key = button.dataset.mcJuzCategory;
        const rows = snapshot.juz[period].buckets[key];
        dialog.querySelector('.mc-student-data').innerHTML = `<h3 id="mc-student-name">${juzPeriods[period]} · ${juzCategories[key]}</h3>${juzStudents(rows, teacherNames)}`;
        dialog.showModal();
      }
      if (button.dataset.mcKind) {
        kind = button.dataset.mcKind;
        for (const toggle of result.querySelectorAll('[data-mc-kind]')) toggle.setAttribute('aria-pressed', String(toggle === button));
        result.querySelector('.mc-chart-area').innerHTML = chart(snapshot.rows, kind, true);
      }
      if (button.hasAttribute('data-mc-student')) {
        const row = snapshot.rows[Number(button.dataset.mcStudent)];
        if (!row) return;
        dialog.querySelector('.mc-student-data').innerHTML = `<h3 id="mc-student-name">${escape(row.name)}</h3>
          ${Object.keys(comparisonKinds).map(key => table([row], key, true)).join('')}`;
        dialog.showModal();
      }
    });
    load();
  }

  return { show };
}
