export const emptyMonthly = student_id => ({ student_id, memorization: { none: false, text: '' }, revision: { none: false, text: '' }, note: '' });
export function monthlyProblem(row) {
  for (const [key, label] of [['memorization', 'الحفظ'], ['revision', 'المراجعة']]) {
    const value = row?.[key];
    if (typeof value?.none !== 'boolean' || typeof value.text !== 'string' || value.text.length > 1000) return label;
    if (value.none ? value.text !== '' : !value.text.trim()) return label;
  }
  return typeof row.note !== 'string' || row.note.length > 500 ? 'الملاحظة' : '';
}
export function termMonths(term) {
  if (!term) return [];
  const months = [], end = term.ends_on.slice(0, 7);
  let date = new Date(`${term.starts_on.slice(0, 7)}-01T00:00:00Z`);
  while (date.toISOString().slice(0, 7) <= end && months.length < 120) {
    months.push(date.toISOString().slice(0, 10)); date.setUTCMonth(date.getUTCMonth() + 1);
  }
  return months;
}
