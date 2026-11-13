import { monthlyAbsent, monthlyProblem, monthlyRangeText } from './monthly-model.mjs?v=monthly-save2';
import { recordedAyahRanges } from './quran-juz.mjs';

export const comparisonKinds = { memorization: 'الحفظ', revision: 'المراجعة' };

function amount(value) {
  if (value?.absent === true) return { count: null, label: 'غائب' };
  const text = typeof value?.text === 'string' ? value.text.trim() : '';
  if (value?.none === true && !text) return { count: 0, label: 'لا يوجد' };
  const range = value?.range;
  const label = monthlyRangeText(range);
  const intervals = recordedAyahRanges(value);
  if (intervals) return { count: intervals.reduce((sum, [start, end]) => sum + end - start + 1, 0), label };
  if (text && (!range || label)) return { count: null, label: text, legacy: true };
  const started = text || Object.values(range ?? {}).some(part => part != null && part !== '');
  return { count: null, label: started ? 'مقدار غير مكتمل' : 'غير مسجّل' };
}

const isRecorded = detail => detail.count !== null || detail.legacy === true;
export const hasRecordedComparison = ({ first, second }) => isRecorded(first) || isRecorded(second);

function compare(first, second) {
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
  const included = new Set([...first.keys(), ...second.keys()]);
  return [...included].flatMap(id => {
    const firstEntry = first.get(id), secondEntry = second.get(id);
    // The inputs are persisted entries. is_complete describes the whole row,
    // so it must not gate either of the two amounts.
    const memorization = compare(amount(firstEntry?.memorization), amount(secondEntry?.memorization));
    const revision = compare(amount(firstEntry?.revision), amount(secondEntry?.revision));
    if (!hasRecordedComparison(memorization) && !hasRecordedComparison(revision)) return [];
    return [{
      id,
      name: known.get(id)?.full_name || 'طالب من السجلات السابقة',
      className: known.get(id)?.source_class,
      memorization,
      revision,
    }];
  }).sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
}

export function summarizeMonthlyComparison(students, firstEntries, secondEntries, rows) {
  const active = students.filter(student => student.active).map(student => student.id);
  const months = [firstEntries, secondEntries].map(entries => {
    const roster = new Set([...active, ...entries.map(entry => entry.student_id)]);
    const absent = new Set(entries.filter(monthlyAbsent).map(entry => entry.student_id));
    const total = roster.size - absent.size;
    const completed = entries.filter(entry => !absent.has(entry.student_id)
      && (entry.is_complete ?? !monthlyProblem(entry))).length;
    return { total, completed, absent: absent.size, rate: total ? completed / total : null };
  });
  const average = months.every(month => month.rate !== null)
    ? (months[0].rate + months[1].rate) / 2
    : null;

  const changes = Object.fromEntries(Object.keys(comparisonKinds).map(kind => {
    const registeredInBoth = rows.map(row => row[kind]).filter(({ first, second }) => isRecorded(first) && isRecorded(second));
    const pairs = registeredInBoth.filter(({ first, second }) => first.count !== null && second.count !== null);
    const first = pairs.reduce((sum, pair) => sum + pair.first.count, 0);
    const second = pairs.reduce((sum, pair) => sum + pair.second.count, 0);
    const difference = second - first;
    const rate = first ? difference / first : pairs.length && second === 0 ? 0 : null;
    return [kind, { compared: pairs.length, total: registeredInBoth.length, first, second, difference, rate }];
  }));
  const monthlyTotals = Object.fromEntries(Object.keys(comparisonKinds).map(kind => [kind,
    ['first', 'second'].map(month => {
      const counted = rows.map(row => row[kind][month].count).filter(count => count !== null);
      return { ayat: counted.reduce((sum, count) => sum + count, 0), students: counted.length };
    }),
  ]));
  return { months, average, changes, monthlyTotals };
}
