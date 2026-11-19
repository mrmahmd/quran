// Weekly evaluation insights for one ring (administration view).
// Averages use approved (submitted) weeks only and the stored total out of 12 (bonus included).
// "Past" means approved weeks before the selected week; the selected week itself is shown as it is saved.

export const WEEKLY_MAX = 12;
export const CRITERIA = [
  { key: 'memorization', label: 'الحفظ والتسميع', max: 4 },
  { key: 'revision', label: 'المراجعة', max: 2 },
  { key: 'improvement', label: 'التقدم والتحسن', max: 2 },
  { key: 'commitment', label: 'الحضور والالتزام', max: 2 },
];
// A drop of this many points below the student's own past average asks for follow-up.
export const FOLLOW_UP_DROP = 3;

const mean = values => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
const scored = row => row && Number.isFinite(row.total) ? row : null;

// weeks: the term's week list in order (dates); week: the selected week.
export function weeklyInsights({ students, reviews, evaluations, weeks, week }) {
  const reviewByWeek = new Map(reviews.map(review => [review.week_start, review]));
  const rowsByReview = new Map();
  for (const row of evaluations) if (scored(row)) (rowsByReview.get(row.review_id) || rowsByReview.set(row.review_id, []).get(row.review_id)).push(row);
  const position = weeks.indexOf(week);
  const upToSelected = position < 0 ? weeks : weeks.slice(0, position + 1);
  const approvedWeeks = upToSelected.filter(day => reviewByWeek.get(day)?.status === 'submitted');
  const pastWeeks = approvedWeeks.filter(day => day !== week);

  const ringAverage = day => mean((rowsByReview.get(reviewByWeek.get(day)?.id) || []).map(row => row.total));
  const trend = upToSelected.map(day => ({ week: day, approved: reviewByWeek.get(day)?.status === 'submitted', average: reviewByWeek.has(day) ? ringAverage(day) : null }));

  const current = reviewByWeek.get(week);
  const currentRows = new Map((rowsByReview.get(current?.id) || []).map(row => [row.student_id, row]));
  const previousWeek = pastWeeks.at(-1) || null;

  const totalsFor = (studentId, days) => days.flatMap(day => (rowsByReview.get(reviewByWeek.get(day)?.id) || []).filter(row => row.student_id === studentId).map(row => row.total));
  const roster = students.filter(student => student.active || currentRows.has(student.id));
  const perStudent = roster.map(student => {
    const past = totalsFor(student.id, pastWeeks);
    const history = upToSelected.map(day => {
      const row = (rowsByReview.get(reviewByWeek.get(day)?.id) || []).find(item => item.student_id === student.id);
      return reviewByWeek.get(day)?.status === 'submitted' || day === week ? row?.total ?? null : null;
    });
    const thisWeek = currentRows.get(student.id)?.total ?? null;
    const pastAverage = mean(past);
    const change = thisWeek !== null && pastAverage !== null ? thisWeek - pastAverage : null;
    return { id: student.id, name: student.full_name, thisWeek, pastAverage, pastWeeks: past.length, change, history,
      state: thisWeek === null ? 'missing' : change === null ? 'first' : change > 0 ? 'up' : change <= -FOLLOW_UP_DROP ? 'drop' : change < 0 ? 'down' : 'same' };
  });

  const criteria = CRITERIA.map(({ key, label, max }) => {
    const selected = mean([...currentRows.values()].map(row => row[key]));
    const term = mean(approvedWeeks.flatMap(day => (rowsByReview.get(reviewByWeek.get(day)?.id) || []).map(row => row[key])));
    return { key, label, max, week: selected === null ? null : selected / max, term: term === null ? null : term / max };
  });

  const weekAverage = current ? ringAverage(week) : null;
  const previousAverage = previousWeek ? ringAverage(previousWeek) : null;
  return {
    week, status: current?.status || null, weekAverage, evaluated: currentRows.size, rosterSize: roster.length,
    previousWeek, previousAverage, weekChange: weekAverage !== null && previousAverage !== null ? weekAverage - previousAverage : null,
    termAverage: mean(approvedWeeks.flatMap(day => (rowsByReview.get(reviewByWeek.get(day)?.id) || []).map(row => row.total))),
    approvedWeeks: approvedWeeks.length,
    improved: perStudent.filter(row => row.state === 'up').length,
    followUp: perStudent.filter(row => row.state === 'drop' || row.state === 'missing').length,
    dropped: perStudent.filter(row => row.state === 'drop').length,
    missing: perStudent.filter(row => row.state === 'missing').length,
    trend, perStudent, criteria,
  };
}

// A signature of the saved data, to tell whether a background refresh brought anything new.
export const evaluationSignature = ({ reviews, evaluations }) => JSON.stringify([
  reviews.map(review => [review.id, review.status, review.version, review.updated_at]).sort(),
  evaluations.map(row => [row.review_id, row.student_id, row.total]).sort(),
]);
