export function summarizeTeacherProgress(teachers, reviews, champions, nominationRows, week, selectedWeekNumber) {
  const khairkomRequired = selectedWeekNumber === 4;
  const requiredTasks = khairkomRequired ? 3 : 2;
  const reviewByTeacher = new Map(reviews.filter(row => row.week_start === week).map(row => [row.teacher_username, row]));
  const championByTeacher = new Map(champions.map(row => [row.teacher_username, row]));
  const nominationsByTeacher = new Map();
  for (const row of nominationRows.filter(row => row.nominated !== false)) {
    nominationsByTeacher.set(row.teacher_username, (nominationsByTeacher.get(row.teacher_username) || 0) + 1);
  }
  const rows = teachers.map(teacher => {
    const review = reviewByTeacher.get(teacher.username);
    const evaluation = review?.status === 'submitted';
    const champion = Boolean(championByTeacher.get(teacher.username)?.student_name || review?.knight_student_id);
    const nominations = nominationsByTeacher.get(teacher.username) || 0;
    const khairkom = nominations > 0;
    const weeklyDone = Number(evaluation) + Number(champion) + (khairkomRequired ? Number(khairkom) : 0);
    return { ...teacher, evaluation, champion, khairkom, nominations, weeklyDone,
      weeklyComplete: weeklyDone === requiredTasks, completionPercent: Math.round(weeklyDone * 100 / requiredTasks) };
  });
  const total = rows.length;
  const count = key => rows.filter(row => row[key]).length;
  const completed = { evaluation: count('evaluation'), champion: count('champion'), khairkom: count('khairkom'), weekly: count('weeklyComplete') };
  const percent = value => total ? Math.round(value * 100 / total) : 0;
  const doneTasks = rows.reduce((sum, row) => sum + row.weeklyDone, 0);
  return { rows, total, completed, khairkomRequired, requiredTasks, doneTasks,
    taskPercent: total ? Math.round(doneTasks * 100 / (total * requiredTasks)) : 0,
    percent: { evaluation: percent(completed.evaluation), champion: percent(completed.champion), khairkom: percent(completed.khairkom), weekly: percent(completed.weekly) } };
}
