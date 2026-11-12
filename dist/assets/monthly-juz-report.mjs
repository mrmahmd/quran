import { completedJuz, recordedAyahRanges } from './quran-juz.mjs';
import { monthlyAbsent } from './monthly-model.mjs?v=monthly-save2';
import { hasSavedMonthlyAmounts } from './monthly-comparison-record.mjs';

export const juzCategories = {
  one: 'جزء واحد بالضبط',
  two: 'جزآن بالضبط',
  many: '٣ أجزاء فأكثر',
  zero: 'دون جزء كامل',
  unresolved: 'بيانات تحتاج استكمالًا',
  absent: 'غياب مسجّل',
  missing: 'بلا سجل حفظ',
};

function studentIdentities(students) {
  const links = new Map(students.map(student => [student.id,
    /^TRANSFER-([\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12})$/i.exec(student.student_code || '')?.[1].toLowerCase(),
  ]));
  return new Map(students.map(({ id }) => {
    const visited = new Set();
    let identity = id;
    while (links.get(identity) && !visited.has(identity)) {
      visited.add(identity);
      identity = links.get(identity);
    }
    // A malformed cycle must not merge unrelated students.
    return [id, visited.has(identity) ? id : identity];
  }));
}

function describePeriod(entries) {
  const recorded = entries.filter(entry => !monthlyAbsent(entry));
  const ranges = recorded.map(entry => hasSavedMonthlyAmounts(entry) ? recordedAyahRanges(entry.memorization) : null);
  return {
    ranges: ranges.flatMap(value => value || []),
    numeric: ranges.some(value => value !== null),
    unresolved: ranges.some(value => value === null),
    absent: entries.length > 0 && recorded.length === 0,
  };
}

function categorize(juz, { numeric, unresolved, absent }) {
  if (unresolved) return 'unresolved';
  if (!numeric) return absent ? 'absent' : 'missing';
  if (juz.length > 2) return 'many';
  return ['zero', 'one', 'two'][juz.length];
}

export function buildJuzReport(students, firstEntries, secondEntries) {
  const identities = studentIdentities(students);
  const profiles = new Map();
  const profileFor = id => {
    const identity = identities.get(id) || id;
    if (!profiles.has(identity)) profiles.set(identity, { student: {}, entries: [[], []] });
    return profiles.get(identity);
  };
  for (const student of students) {
    const profile = profileFor(student.id);
    if (student.active || !profile.student.id) profile.student = student;
  }
  for (const [month, entries] of [firstEntries, secondEntries].entries()) {
    for (const entry of entries) profileFor(entry.student_id).entries[month].push(entry);
  }

  const periods = Array.from({ length: 3 }, () => ({
    buckets: Object.fromEntries(Object.keys(juzCategories).map(key => [key, []])), total: 0, measurable: 0,
  }));
  const add = (index, student, entries, data) => {
    const juz = completedJuz(data.ranges);
    const category = categorize(juz, data);
    const period = periods[index];
    period.total++;
    if (data.numeric && !data.unresolved) period.measurable++;
    const teachers = entries.length ? entries.map(row => row.teacher_username || student.teacher_username) : [student.teacher_username];
    period.buckets[category].push({
      name: student.full_name || 'طالب من السجلات السابقة',
      className: student.source_class,
      teachers: [...new Set(teachers.filter(Boolean))],
      juz,
    });
  };

  for (const { student, entries } of profiles.values()) {
    if (!student.active && !entries.some(month => month.length)) continue;
    const monthly = entries.map(describePeriod);
    for (const [index, data] of monthly.entries()) {
      if (student.active || entries[index].length) add(index, student, entries[index], data);
    }
    const numeric = monthly.some(data => data.numeric);
    add(2, student, entries.flat(), {
      ranges: monthly.flatMap(data => data.ranges), numeric,
      unresolved: monthly.some((data, index) => data.unresolved || (numeric && student.active && !entries[index].length)),
      absent: monthly.some(data => data.absent),
    });
  }
  for (const { buckets } of periods) {
    for (const rows of Object.values(buckets)) rows.sort((a, b) => a.name.localeCompare(b.name, 'ar', { numeric: true }));
  }
  return periods;
}
