export const SCORE_FIELDS = [
  { key: 'memorization', label: 'الحفظ والتسميع', max: 4 },
  { key: 'revision', label: 'المراجعة', max: 2 },
  { key: 'improvement', label: 'التقدم والتحسن', max: 2 },
  { key: 'commitment', label: 'الحضور والالتزام', max: 2 },
];
export function emptyScores(studentId) {
  return { student_id: studentId, memorization: null, revision: null, improvement: null, commitment: null, bonus_memorization: 0, bonus_revision: 0 };
}
export function scoreTotal(row) {
  if (!SCORE_FIELDS.every(field => Number.isInteger(row[field.key]))) return null;
  return SCORE_FIELDS.reduce((sum, field) => sum + row[field.key], 0) + row.bonus_memorization + row.bonus_revision;
}
export function validateScores(row, complete = false) {
  return SCORE_FIELDS.every(({ key, max }) => (row[key] === null && !complete) || (Number.isInteger(row[key]) && row[key] >= 0 && row[key] <= max))
    && ['bonus_memorization', 'bonus_revision'].every(key => row[key] === 0 || row[key] === 1);
}
export function termWeeks(term) {
  const start = new Date(`${term.starts_on}T00:00:00Z`);
  const end = new Date(`${term.ends_on}T00:00:00Z`);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || start > end) return [];
  start.setUTCDate(start.getUTCDate() - start.getUTCDay());
  const weeks = [];
  while (start <= end && weeks.length < 105) {
    weeks.push(start.toISOString().slice(0, 10));
    start.setUTCDate(start.getUTCDate() + 7);
  }
  return weeks;
}
export function rankWeekly(rows) {
  return rows.filter(row => scoreTotal(row) !== null).slice().sort((a, b) => scoreTotal(b) - scoreTotal(a) || b.improvement - a.improvement || a.full_name.localeCompare(b.full_name, 'ar'));
}
export function weekNumber(term, index) { return (Number.isInteger(term?.first_week_number) ? term.first_week_number : 1) + index; }
export function weekEnd(day) { const end = new Date(`${day}T00:00:00Z`); end.setUTCDate(end.getUTCDate() + 4); return end.toISOString().slice(0,10); }
export function semesterSummary(students, reviews, evaluations) {
  const approved = new Set(reviews.filter(row => row.status === 'submitted').map(row => row.id));
  return students.map(student => {
    const rows = evaluations.filter(row => row.student_id === student.id && approved.has(row.review_id) && scoreTotal(row) !== null);
    return { ...student, total: rows.reduce((n, row) => n + scoreTotal(row), 0), weeks: rows.length,
      improvement: rows.reduce((n, row) => n + row.improvement, 0),
      commitment: rows.reduce((n, row) => n + row.commitment, 0),
      memorization_revision: rows.reduce((n, row) => n + row.memorization + row.revision, 0) };
  }).sort((a, b) => b.total - a.total || a.full_name.localeCompare(b.full_name, 'ar'));
}
