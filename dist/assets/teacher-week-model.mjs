import { termWeeks, weekNumber, validateScores } from './evaluation-model.mjs?v=rosters2';

// Summaries use persisted context only. Unsaved point/knight selections never count.
export function teacherWeeks(term, context, nominations, username, today) {
  if (!term) return [];
  const calendar = termWeeks(term);
  const starts = [...new Set([...calendar,...context.reviews.filter(r=>r.teacher_username===username).map(r=>r.week_start)])].sort();
  return starts.map(start => {
    const index = calendar.indexOf(start);
    const review = context.reviews.find(r => r.week_start === start && r.teacher_username === username);
    const saved = context.evaluations.filter(r => review && r.review_id === review.id);
    const byStudent = new Map(saved.map(r => [r.student_id, r]));
    // Submitted reviews keep their saved roster; later additions must not rewrite history.
    const ids = review?.status === 'submitted' ? [...byStudent.keys()] : context.students.filter(s => s.active).map(s => s.id);
    const rated = ids.filter(id => byStudent.has(id) && validateScores(byStudent.get(id), true)).length;
    const evaluation = review?.status === 'submitted' && ids.length > 0 && rated === ids.length;
    const championId = review?.knight_student_id || '';
    const champion = Boolean(championId);
    const championName = context.students.find(s => s.id === championId)?.full_name || (champion ? 'فارس الحلقة المحفوظ' : '');
    const number = index < 0 ? null : weekNumber(term, index), khairkomRequired = number === 4;
    const khairkom = nominations.some(r => r.teacher_username === username && r.nominated !== false);
    const taskCount = khairkomRequired ? 3 : 2;
    const done = Number(evaluation) + Number(champion) + (khairkomRequired ? Number(khairkom) : 0);
    return {start,number,label:number===null?'سجل سابق':`الأسبوع ${number}`,rated,total:ids.length,remaining:ids.length-rated,evaluation,champion,championName,
      championNote:review?.knight_note || '',khairkomRequired,khairkom,done,taskCount,
      percent:Math.round(done*100/taskCount),complete:done===taskCount,future:start>today};
  });
}
