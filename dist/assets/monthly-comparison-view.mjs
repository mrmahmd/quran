import { brandLockup } from './brand.mjs';
import { termMonths } from './monthly-model.mjs?v=monthly-finish1';
import { buildMonthlyComparison, comparisonKinds, hasRecordedComparison, summarizeMonthlyComparison } from './monthly-comparison-model.mjs?v=6';
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
      return `<tr><th scope="row">${escape(row.name)}${row.className ? '<small><bdi>' + escape(row.className) + '</bdi></small>' : ''}</th>
        ${amountCell(value.first)}${amountCell(value.second)}
        <td><bdi>${value.change === null ? '—' : signed.format(value.change)}</bdi></td><td>${delta(value)}</td></tr>`;
    }).join('') || '<tr><td colspan="5">لا توجد مقادير مسجّلة.</td></tr>'}</tbody></table></div>`;
}

function reportActions(title, months) {
  return `<header class="mc-actions"><div><h3>${escape(title)}</h3><p>${months.map(monthName).join(' · ')}</p></div>
    <button type="button" class="teal-button" data-mc-pdf>معاينة وحفظ PDF</button></header>`;
}

function teacherSummary({ months, average, changes, monthlyTotals }) {
  const rate = value => value === null ? '—' : achievementPercent.format(value);
  return `<section class="mc-panel mc-completion">
    <div><h3>متوسط اكتمال التقرير</h3><strong><bdi>${rate(average)}</bdi></strong></div>
    <div class="mc-completion-months">${months.map((month, i) => `<div><span>${periods[i]}</span><bdi>${rate(month.rate)}</bdi>
      <small>${number.format(month.completed)} من ${number.format(month.total)} طالبًا</small>
      ${month.absent ? `<small>${number.format(month.absent)} غياب مستبعد</small>` : ''}</div>`).join('')}</div>
  </section>
  <div class="mc-quantity-grid">${Object.entries(changes).map(([kind, change]) => {
    const totals = monthlyTotals[kind];
    const pairedTotals = [change.first, change.second];
    const maximum = Math.max(1, ...pairedTotals);
    const tone = change.difference > 0 ? 'up' : change.difference < 0 ? 'down' : 'same';
    return `<section class="mc-panel mc-quantity"><h3>آيات ${comparisonKinds[kind]}</h3>
      <p class="mc-method">المقارنة لنفس الطلاب · ${number.format(change.compared)} طالبًا</p>
      <div class="mc-quantity-bars">${pairedTotals.map((ayat, index) => `<div class="mc-period-${index}">
        <div class="mc-metric-line"><span>${periods[index]}</span><strong><bdi>${change.compared ? number.format(ayat) : '—'}</bdi></strong></div>
        ${meter(ayat / maximum, 'var(--mc-period)')}
        <small>إجمالي الشهر · ${totals[index].students ? number.format(totals[index].ayat) : '—'} آية · ${number.format(totals[index].students)} طالبًا</small>
      </div>`).join('')}</div>
      <div class="mc-change"><div><span>نسبة التغيّر</span><bdi class="mc-delta mc-${tone}">${change.rate === null ? '—' : percent.format(change.rate)}</bdi></div>
        <div><span>فرق الآيات</span><bdi>${change.compared ? signed.format(change.difference) : '—'}</bdi></div>
      </div>
    </section>`;
  }).join('')}</div>`;
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

function printReport({ title, months, term, summary, juz }) {
  return `<article class="report-document mc-document" lang="ar" dir="rtl">
    <header class="mc-print-header"><div class="mc-print-brand">${brandLockup()}</div>
      <div><h1>${escape(title)}</h1><p>${escape(term.name)} · ${months.map(monthName).join(' · ')}</p></div></header>
    ${summary ? teacherSummary(summary) : ''}
    ${juzSummary(juz, false)}
  </article>`;
}

export function createMonthlyComparison({ repo, openPdf, openMonthlyReport }) {
  let selected = '';

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
          const juz = buildJuzReport(school.students, ...school.entries)[2];
          snapshot = { title: 'ملخص المدرسة', months, term, juz };
          status.textContent = '';
          result.innerHTML = reportActions(snapshot.title, months) + juzSummary(juz, true);
          return;
        }
        const data = await repo.monthlyComparison(teacher.username, term.id, months);
        if (ticket !== request || !workspace.isConnected) return;
        const rows = buildMonthlyComparison(data.students, data.first.entries, data.second.entries);
        const summary = summarizeMonthlyComparison(data.students, data.first.entries, data.second.entries, rows);
        const juz = buildJuzReport(data.students, data.first.entries, data.second.entries)[2];
        const title = [teacher.full_name, teacher.ring_name || teacher.class_name].filter(Boolean).join(' · ');
        snapshot = { title, teacher, months, term, summary, juz };
        status.textContent = rows.length ? '' : 'لا توجد مقادير حفظ أو مراجعة مسجّلة لهذه الحلقة في الشهرين.';
        result.innerHTML = reportActions(title, months) + teacherSummary(summary) + juzSummary(juz, true);
        const sourceReports = [data.first, data.second].map((value, index) => value.report
          ? `<button type="button" class="light-button" data-mc-report="${index}">فتح تقرير ${periods[index]}</button>`
          : '').join('');
        if (rows.length || sourceReports) {
          result.insertAdjacentHTML('beforeend', `<details class="mc-panel mc-student-details"><summary>تفاصيل الطلاب والتقارير الشهرية</summary>
            <div class="mc-source-reports">${sourceReports}</div>
            ${rows.length ? Object.keys(comparisonKinds).map(key => table(rows, key)).join('') : ''}
          </details>`);
        }
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
