import { monthlyProblem, monthlyRangeText, SURAHS } from './monthly-model.mjs?v=monthly-save2';

export const comparisonKinds = { memorization: 'الحفظ', revision: 'المراجعة' };

function amount(value) {
  if (value?.absent === true) return { count: null, label: 'غائب' };
  const text = typeof value?.text === 'string' ? value.text.trim() : '';
  if (value?.none === true && !text) return { count: 0, label: 'لا يوجد' };
  const range = value?.range;
  const label = monthlyRangeText(range);
  if (value?.none === false && label && text === label) {
    const { from_surah: from, to_surah: to, from_ayah: first, to_ayah: last } = range;
    if (from === to) return { count: last - first + 1, label };
    // Surahs can be selected in either order. Ayat within each surah are read forward.
    const between = SURAHS.slice(Math.min(from, to), Math.max(from, to) - 1);
    const count = SURAHS[from - 1].verses - first + 1 + last
      + between.reduce((total, surah) => total + surah.verses, 0);
    return { count, label };
  }
  if (text && (!range || label)) return { count: null, label: text, legacy: true };
  const started = text || Object.values(range ?? {}).some(part => part != null && part !== '');
  return { count: null, label: started ? 'مقدار غير مكتمل' : 'غير مسجّل' };
}

function compare(firstValue, secondValue) {
  const first = amount(firstValue), second = amount(secondValue);
  if (first.count === null || second.count === null) {
    return { first, second, change: null, percent: null, state: 'unavailable' };
  }
  const change = second.count - first.count;
  if (!first.count && change > 0) return { first, second, change, percent: null, state: 'new' };
  const percent = first.count ? change * 100 / first.count : 0;
  const state = change > 0 ? 'up' : change < 0 ? 'down' : 'same';
  return { first, second, change, percent, state };
}

export function buildMonthlyComparison(students, firstEntries, secondEntries) {
  const first = new Map(firstEntries.map(row => [row.student_id, row]));
  const second = new Map(secondEntries.map(row => [row.student_id, row]));
  const known = new Map(students.map(student => [student.id, student]));
  const included = new Set([...students.filter(student => student.active).map(student => student.id), ...first.keys(), ...second.keys()]);
  return [...included].map(id => ({
    id,
    name: known.get(id)?.full_name || 'طالب من السجلات السابقة',
    className: known.get(id)?.source_class,
    memorization: compare(first.get(id)?.memorization, second.get(id)?.memorization),
    revision: compare(first.get(id)?.revision, second.get(id)?.revision),
  })).sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
}

export function summarizeMonthlyComparison(students, firstEntries, secondEntries, rows) {
  const active = students.filter(student => student.active).map(student => student.id);
  const months = [firstEntries, secondEntries].map(entries => {
    const total = new Set([...active, ...entries.map(entry => entry.student_id)]).size;
    const completed = entries.filter(entry => entry.is_complete ?? !monthlyProblem(entry)).length;
    return { total, completed, rate: total ? completed / total : null };
  });
  const average = months.every(month => month.rate !== null)
    ? (months[0].rate + months[1].rate) / 2
    : null;

  const changes = Object.fromEntries(Object.keys(comparisonKinds).map(kind => {
    const pairs = rows.map(row => row[kind]).filter(row => row.first.count !== null && row.second.count !== null);
    const first = pairs.reduce((sum, pair) => sum + pair.first.count, 0);
    const second = pairs.reduce((sum, pair) => sum + pair.second.count, 0);
    const difference = second - first;
    const rate = first ? difference / first : pairs.length && second === 0 ? 0 : null;
    return [kind, { compared: pairs.length, total: rows.length, first, second, difference, rate }];
  }));
  return { months, average, changes };
}
