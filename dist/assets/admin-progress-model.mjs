export function summarizeTeacherProgress(teachers, reviews, champions, nominationSets, week) {
  const reviewByTeacher = new Map(reviews.filter(row => row.week_start === week).map(row => [row.teacher_username, row]));
  const championByTeacher = new Map(champions.map(row => [row.teacher_username, row]));
  const nominated = new Set(nominationSets.map(row => row.teacher_username));
  const rows = teachers.map(teacher => {
    const review = reviewByTeacher.get(teacher.username);
    const evaluation = review?.status === 'submitted';
    const champion = Boolean(championByTeacher.get(teacher.username)?.student_name || review?.knight_student_id);
    const khairkom = nominated.has(teacher.username);
    return { ...teacher, evaluation, champion, khairkom, weeklyDone: Number(evaluation) + Number(champion) };
  });
  const total = rows.length;
  const count = key => rows.filter(row => row[key]).length;
  const completed = { evaluation: count('evaluation'), champion: count('champion'), khairkom: count('khairkom'), weekly: rows.filter(row => row.weeklyDone === 2).length };
  const percent = value => total ? Math.round(value * 100 / total) : 0;
  return { rows, total, completed, percent: { evaluation: percent(completed.evaluation), champion: percent(completed.champion), khairkom: percent(completed.khairkom), weekly: percent(completed.weekly) } };
}
