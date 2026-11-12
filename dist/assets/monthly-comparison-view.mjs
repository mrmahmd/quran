import { brandLockup } from './brand.mjs';
import { termMonths } from './monthly-model.mjs?v=monthly-finish1';
import { buildMonthlyComparison, comparisonKinds, summarizeMonthlyComparison } from './monthly-comparison-model.mjs?v=2';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const number = new Intl.NumberFormat('ar-EG');
const signed = new Intl.NumberFormat('ar-EG', { signDisplay: 'exceptZero' });
const percent = new Intl.NumberFormat('ar-EG', { style: 'percent', signDisplay: 'exceptZero', maximumFractionDigits: 1 });
const achievementPercent = new Intl.NumberFormat('ar-EG', { style: 'percent', maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat('ar-SA-u-ca-gregory', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const periods = ['الشهر الأول', 'الشهر الثاني'];
const statuses = { up: 'زاد المقدار', down: 'قلّ المقدار', same: 'دون تغيير', new: 'بدأ التسجيل', unavailable: 'بلا نسبة تغيّر' };
const explanation = 'تُحسب نسبة التغيّر عند توفر عدد الآيات للشهرين. تظهر المقادير النصية كما حُفظت، ويمكن مراجعتها جنبًا إلى جنب. عند بدء التسجيل من صفر يظهر فرق الآيات.';
const monthName = month => date.format(new Date(month + 'T00:00:00Z'));

function delta(result) {
  const label = result.percent === null
    ? result.first.legacy || result.second.legacy ? 'مقارنة نصية' : statuses[result.state]
    : '<bdi>' + percent.format(result.percent / 100) + '</bdi>';
  return '<span class="mc-delta mc-' + result.state + '">' + label + '</span>';
}

function chart(rows, kind, interactive) {
  const totals = Object.fromEntries(Object.keys(statuses).map(key => [key, 0]));
  let maximum = 1;
  for (const row of rows) {
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
  const items = rows.map((row, index) => {
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

function table(rows, kind) {
  return `<div class="mc-table-wrap" role="region" aria-label="تفاصيل ${comparisonKinds[kind]}" tabindex="0">
    <table class="mc-table" aria-label="${comparisonKinds[kind]}">
    <thead><tr class="mc-table-title"><th colspan="5">${comparisonKinds[kind]}</th></tr>
      <tr><th scope="col">الطالب</th><th scope="col">${periods[0]}</th><th scope="col">${periods[1]}</th><th scope="col">فرق الآيات</th><th scope="col">نسبة التغيّر</th></tr></thead>
    <tbody>${rows.map(row => {
      const value = row[kind];
      return `<tr><th scope="row">${escape(row.name)}${row.className ? '<small><bdi>' + escape(row.className) + '</bdi></small>' : ''}</th>
        ${amountCell(value.first)}${amountCell(value.second)}
        <td><bdi>${value.change === null ? '—' : signed.format(value.change)}</bdi></td><td>${delta(value)}</td></tr>`;
    }).join('')}</tbody></table></div>`;
}

function metadata(teacher, months, data, interactive = false) {
  return `<div class="mc-metadata"><div><span>المعلم</span><strong>${escape(teacher.full_name)}</strong>
    <bdi>${escape(teacher.ring_name || teacher.class_name)}</bdi></div>
    ${[data.first, data.second].map((value, i) => `<div><span>${periods[i]}</span><strong>${monthName(months[i])}</strong>
      <small>${value.report ? `تقرير محفوظ · ${number.format(value.entries.length)} سجل طالب` : 'لا يوجد تقرير محفوظ'}</small>
      ${interactive && value.report ? `<button type="button" class="light-button" data-mc-report="${i}">فتح تقرير ${periods[i]}</button>` : ''}</div>`).join('')}</div>`;
}

function teacherSummary({ months, average, changes }) {
  const rate = value => value === null ? '—' : achievementPercent.format(value);
  return `<section class="mc-panel mc-summary"><h3>إنجاز المعلم خلال الشهرين</h3>
    <div class="mc-summary-grid"><div class="mc-summary-average"><span>متوسط الشهرين</span><strong>${rate(average)}</strong></div>
    ${months.map((month, i) => `<div><span>${periods[i]}</span><strong>${rate(month.rate)}</strong>
      <small>${number.format(month.completed)} من ${number.format(month.total)} طالبًا مكتملًا ومحفوظًا</small></div>`).join('')}</div>
    <p class="mc-method">نسبة كل شهر هي عدد الطلاب الذين حُفظ لهم الحفظ والمراجعة من إجمالي طلاب التقرير. المتوسط يعطي الشهرين الوزن نفسه.</p>
    <h3>التغيّر في إجمالي عدد الآيات</h3>
    <div class="mc-summary-grid mc-change-grid">${Object.entries(changes).map(([kind, value]) => `<div>
      <span>${comparisonKinds[kind]}</span><strong>${value.rate === null ? '—' : percent.format(value.rate)}</strong>
      <small>${number.format(value.compared)} من ${number.format(value.total)} طالبًا قابلًا للمقارنة</small>
      ${value.compared ? `<small>${periods[0]}: ${number.format(value.first)} آية · ${periods[1]}: ${number.format(value.second)} آية</small>` : ''}
      ${value.compared && value.rate === null ? `<small>بدأ من صفر · فرق الآيات ${signed.format(value.difference)}</small>` : ''}</div>`).join('')}</div>
    <p class="mc-method">تدخل في حساب تغيّر عدد الآيات المقادير القابلة للعد في الشهرين للطلاب أنفسهم.</p></section>`;
}

function printReport({ teacher, months, term, data, rows, summary, kind }) {
  return `<article class="report-document mc-document" lang="ar" dir="rtl">
    <header class="mc-print-header"><div class="mc-print-brand">${brandLockup()}</div>
      <div><h1>مقارنة الحفظ والمراجعة الشهرية</h1><p>${escape(term.name)}</p></div></header>
    ${metadata(teacher, months, data)}
    ${teacherSummary(summary)}
    ${chart(rows, kind, false)}
    <p class="mc-method">${explanation}</p>
    <section class="mc-panel mc-print-details"><h2>التقرير المفصّل للطلاب</h2>
      ${Object.keys(comparisonKinds).map(key => table(rows, key)).join('')}</section>
  </article>`;
}

export function createMonthlyComparison({ repo, openPdf, openMonthlyReport }) {
  let selected = '', kind = 'memorization';

  function show(host, term, teachers) {
    const months = termMonths(term).slice(0, 2);
    const options = teachers.slice().sort((a, b) => a.full_name.localeCompare(b.full_name, 'ar'));
    if (!options.some(teacher => teacher.username === selected)) selected = '';
    host.innerHTML = `<section class="mc-workspace" aria-labelledby="mc-title">
      <header class="mc-hero"><div><h2 id="mc-title">مقارنة الحفظ والمراجعة الشهرية</h2>
        <p>قارن مقدار كل طالب في الشهر الأول والثاني من التقارير المحفوظة.</p></div>
        <div class="mc-controls"><label>المعلم<select data-mc-teacher aria-label="المعلم">
          <option value="">اختر المعلم</option>${options.map(teacher => `<option value="${escape(teacher.username)}">
            ${escape([teacher.full_name, teacher.ring_name || teacher.class_name].filter(Boolean).join(' · '))}</option>`).join('')}
        </select></label><button type="button" data-mc-refresh class="light-button" disabled>تحديث</button></div>
      </header><p class="mc-status" role="status"></p><div class="mc-result"></div>
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
      if (!teacher) {
        status.textContent = options.length ? 'اختر معلمًا لعرض الرسم البياني وتفاصيل الطلاب.' : 'لا توجد حسابات معلمين متاحة.';
        return;
      }
      status.textContent = 'جارٍ تحميل التقريرين…';
      try {
        const data = await repo.monthlyComparison(teacher.username, term.id, months);
        if (ticket !== request || !workspace.isConnected) return;
        const rows = buildMonthlyComparison(data.students, data.first.entries, data.second.entries);
        const summary = summarizeMonthlyComparison(data.students, data.first.entries, data.second.entries, rows);
        snapshot = { teacher, months, term, data, rows, summary };
        status.textContent = rows.length ? '' : 'لا توجد قائمة طلاب أو سجلات محفوظة لهذه الحلقة في الشهرين.';
        result.innerHTML = metadata(teacher, months, data, true);
        if (!rows.length) return;
        result.insertAdjacentHTML('beforeend', teacherSummary(summary));
        result.insertAdjacentHTML('beforeend', `<div class="mc-actions">
          <div role="group" aria-label="نوع المقارنة">${Object.entries(comparisonKinds).map(([key, label]) =>
            `<button type="button" data-mc-kind="${key}" aria-pressed="${kind === key}">${label}</button>`).join('')}</div>
          <button type="button" class="teal-button" data-mc-pdf>معاينة وحفظ PDF</button></div>
          <div class="mc-chart-area">${chart(rows, kind, true)}</div>
          <section class="mc-panel"><h3>التقرير المفصّل للطلاب</h3>
            ${Object.keys(comparisonKinds).map(key => table(rows, key)).join('')}
          </section><p class="mc-method">${explanation}</p>`);
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
      if (button.hasAttribute('data-mc-pdf')) openPdf(printReport({ ...snapshot, kind }));
      if (button.dataset.mcKind) {
        kind = button.dataset.mcKind;
        for (const toggle of result.querySelectorAll('[data-mc-kind]')) toggle.setAttribute('aria-pressed', String(toggle === button));
        result.querySelector('.mc-chart-area').innerHTML = chart(snapshot.rows, kind, true);
      }
      if (button.hasAttribute('data-mc-student')) {
        const row = snapshot.rows[Number(button.dataset.mcStudent)];
        if (!row) return;
        dialog.querySelector('.mc-student-data').innerHTML = `<h3 id="mc-student-name">${escape(row.name)}</h3>
          ${Object.keys(comparisonKinds).map(key => table([row], key)).join('')}`;
        dialog.showModal();
      }
    });
    load();
  }

  return { show };
}
