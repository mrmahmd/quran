import { monthlyAmount, compare } from './monthly-comparison-model.mjs';

const form = document.querySelector('#lookup');
const input = document.querySelector('#iqama');
const status = document.querySelector('#status');
const report = document.querySelector('#report');
const studentName = document.querySelector('#student-name');
const tracks = document.querySelector('#tracks');
const submit = form.querySelector('button');
const isPreview = document.body.dataset.reportMode === 'preview' || ['file:', 'http:'].includes(location.protocol)
  && (location.protocol === 'file:' || ['localhost', '127.0.0.1'].includes(location.hostname));
document.querySelector('#hint').hidden = !isPreview;
if (isPreview) document.querySelector('#report-label').append(' · بيانات تجريبية');
const number = new Intl.NumberFormat('ar-SA');

const fromRange = (surah, start, end) => ({
  range: { from_surah: surah, from_ayah: start, to_surah: surah, to_ayah: end }
});
const preview = {
  name: 'أحمد محمد · نموذج تجريبي',
  months: [
    { memorization: fromRange(78, 1, 16), revision: fromRange(79, 1, 30) },
    { memorization: fromRange(78, 17, 40), revision: fromRange(79, 1, 38) },
  ],
};

function normalize(value) {
  return value.trim().replace(/[٠-٩۰-۹]/g, digit => String(digit.charCodeAt(0) & 15));
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function deltaText(change) {
  if (change === null) return 'المقارنة متاحة عند تسجيل مقدار الشهرين بالأرقام';
  if (!change) return 'نفس عدد الآيات في الشهرين';
  const direction = change > 0 ? 'زيادة' : 'انخفاض';
  return `${direction} بمقدار ${number.format(Math.abs(change))} آية في الشهر الثاني`;
}

function renderTrack(kind, title, months) {
  const amounts = months.map(month => monthlyAmount(month?.[kind]));
  const section = element('section', null, `track ${kind}`);
  const { change } = compare(...amounts);
  section.append(element('h3', title), element('p', deltaText(change), 'delta'));

  const details = element('div', null, 'months');
  amounts.forEach(({ count, label }, index) => {
    const card = element('div', null, 'month');
    const header = element('div', null, 'month-header');
    header.append(element('strong', ['الشهر الأول', 'الشهر الثاني'][index]));
    if (count !== null) header.append(element('span', `${number.format(count)} آية`));
    card.append(header, element('p', label, 'range'));
    details.append(card);
  });
  section.append(details);
  return section;
}

function showReport({ name, months }) {
  studentName.textContent = name;
  tracks.replaceChildren(
    renderTrack('memorization', 'الحفظ', months),
    renderTrack('revision', 'المراجعة', months)
  );
  report.hidden = false;
  studentName.focus();
}

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (submit.disabled) return;
  report.hidden = true;
  tracks.replaceChildren();
  studentName.textContent = '';
  status.textContent = '';
  const iqama = normalize(input.value);
  if (!/^\d{10}$/.test(iqama)) {
    status.textContent = 'أدخل رقم إقامة مكوّنًا من ١٠ أرقام.';
    return;
  }
  if (isPreview) {
    if (iqama !== '2000000000') {
      status.textContent = 'المعاينة تعمل بالرقم التجريبي الموجود أسفل الزر.';
      return;
    }
    input.value = '';
    showReport(preview);
    return;
  }

  submit.disabled = true;
  input.readOnly = true;
  status.textContent = 'جاري البحث عن التقرير…';
  try {
    const { supabaseUrl, supabasePublishableKey } = window.QURAN_PLATFORM_CONFIG;
    const response = await fetch(`${supabaseUrl}/functions/v1/parent-report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabasePublishableKey },
      body: JSON.stringify({ iqama }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) {
      status.textContent = 'لا يوجد تقرير متاح لهذا الرقم. راجع الرقم أو تواصل مع المدرسة.';
      return;
    }
    if (response.status === 429) {
      status.textContent = 'زادت محاولات البحث. جرّب مرة أخرى بعد قليل.';
      return;
    }
    if (!response.ok) throw new Error('Report request failed');
    const result = await response.json();
    if (typeof result.name !== 'string' || result.months?.length !== 2) throw new Error('Invalid report');
    input.value = '';
    status.textContent = '';
    showReport(result);
  } catch {
    status.textContent = 'تعذّر عرض التقرير الآن. جرّب مرة أخرى بعد قليل.';
  } finally {
    submit.disabled = false;
    input.readOnly = false;
  }
});

document.querySelector('#print').addEventListener('click', () => window.print());
