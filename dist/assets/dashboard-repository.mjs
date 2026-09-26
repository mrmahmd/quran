async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
async function allRows(build) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const data = await result(build().range(offset, offset + 499));
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}
export function createDashboardRepository(client) {
  return {
    terms: () => result(client.from('school_terms').select('*').order('starts_on', { ascending: false })),
    teachers: () => result(client.from('teacher_accounts').select('username, full_name, class_name, active').eq('active', true).order('username')),
    async context(teacher, term) {
      const [students, reviews, honors] = await Promise.all([
        allRows(() => client.from('students').select('*').eq('teacher_username', teacher).order('full_name').order('id')),
        term ? result(client.from('weekly_reviews').select('*').eq('teacher_username', teacher).eq('term_id', term).order('week_start')) : Promise.resolve([]),
        term ? result(client.from('semester_honors').select('*').eq('teacher_username', teacher).eq('term_id', term)) : Promise.resolve([]),
      ]);
      const evaluations = reviews.length ? await allRows(() => client.from('weekly_evaluations').select('*').eq('teacher_username', teacher).in('review_id', reviews.map(row => row.id)).order('review_id').order('student_id')) : [];
      return { students, reviews, evaluations, honors };
    },
    async overview(term) {
      const [students, reviews, honors] = await Promise.all([
        allRows(() => client.from('students').select('id,teacher_username,active').eq('active', true).order('id')),
        result(client.from('weekly_reviews').select('*').eq('term_id', term).order('week_start')),
        allRows(() => client.from('semester_honors').select('*').eq('term_id', term).order('teacher_username').order('student_id')),
      ]);
      return { students, reviews, honors };
    },
    saveWeek: args => result(client.rpc('save_weekly_evaluation', args)),
    knight: args => result(client.rpc('choose_weekly_knight', args)),
    honors: args => result(client.rpc('save_semester_honors', args)),
    reopen: args => result(client.rpc('reopen_weekly_evaluation', args)),
    addTerm: term => result(client.from('school_terms').insert(term).select().single()),
    addStudents: students => result(client.from('students').insert(students).select('id')),
  };
}
