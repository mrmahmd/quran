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
    teachers: () => result(client.from('teacher_accounts').select('username, full_name, class_name, ring_name, active').eq('active', true).order('username')),
    weekStates: term => result(client.from('weekly_workflow_access').select('week_start,is_open,updated_at').eq('term_id', term).order('week_start')),
    setWeekOpen: (term, week, open) => result(client.rpc('set_week_workflow_open', {p_term:term,p_week:week,p_open:open})),
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
        allRows(() => client.from('students').select('id,full_name,source_class,teacher_username,active').order('id')),
        result(client.from('weekly_reviews').select('*').eq('term_id', term).order('week_start')),
        allRows(() => client.from('semester_honors').select('*').eq('term_id', term).order('teacher_username').order('student_id')),
      ]);
      const evaluations = reviews.length ? await allRows(() => client.from('weekly_evaluations').select('*').in('review_id', reviews.map(row=>row.id)).order('review_id').order('student_id')) : [];
      return { students, reviews, honors, evaluations };
    },
    saveWeek: args => result(client.rpc('save_weekly_evaluation', args)),
    async monthly(teacher, term, month) {
      const reports = await result(client.from('monthly_reports').select('*').eq('teacher_username', teacher).eq('term_id', term).eq('month_start', month));
      const report = reports[0] || null;
      const entries = report ? await allRows(() => client.from('monthly_entries').select('*').eq('report_id', report.id).order('student_id')) : [];
      return { report, entries };
    },
    saveMonthly: args => result(client.rpc('save_monthly_report', args)),
    async khairkom(term) {
      const sets = await allRows(() => client.from('khairkom_nomination_sets').select('*').eq('term_id', term).order('teacher_username'));
      const rows = sets.length ? await allRows(() => client.from('khairkom_nominations').select('*').in('set_id', sets.map(row => row.id)).eq('nominated', true).order('teacher_username').order('student_id')) : [];
      const students = rows.length ? await allRows(() => client.from('students').select('id,full_name,teacher_username,source_class').in('id', rows.map(row => row.student_id)).order('full_name')) : [];
      return { sets, rows, students };
    },
    saveKhairkom: args => result(client.rpc('save_khairkom_nominations', args)),
    champions: (term, week) => result(client.rpc('weekly_champions', {p_term:term,p_week:week})),
    knight: args => result(client.rpc('select_manual_weekly_knight', args)),
    honors: args => result(client.rpc('save_semester_honors', args)),
    reopen: args => result(client.rpc('reopen_weekly_evaluation', args)),
    manageStudent: args => result(client.rpc('manage_student', args)),
    addTerm: term => result(client.from('school_terms').insert(term).select().single()),
    addStudents: students => result(client.from('students').insert(students).select('id')),
  };
}
