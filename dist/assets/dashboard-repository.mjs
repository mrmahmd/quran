import { sortByClass } from './class-order.mjs?v=1';

async function result(query) {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}
// Teachers asked by the school to record start and end verses for a given month.
async function rangeRules(client, term, month, teacher) {
  let query = client.from('monthly_range_requirements').select('teacher_username,month_start').eq('term_id', term).eq('month_start', month);
  if (teacher) query = query.eq('teacher_username', teacher);
  const { data, error } = await query;
  // Until the migration is applied the table is missing; the database rule is still the final check.
  if (error) { if (['42P01', 'PGRST205'].includes(error.code)) return []; throw error; }
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
async function monthlyEntries(client, reports) {
  const entries = [];
  for (let start = 0; start < reports.length; start += 100) {
    const ids = reports.slice(start, start + 100).map(report => report.id);
    entries.push(...await allRows(() => client.from('monthly_entries').select('*')
      .in('report_id', ids).order('report_id').order('student_id')));
  }
  return entries;
}
async function loadKhairkom(client, term, period = 1) {
  const sets = await allRows(() => client.from('khairkom_nomination_sets').select('*').eq('term_id', term).eq('period_no', period).order('teacher_username'));
  const rows = sets.length ? await allRows(() => client.from('khairkom_nominations').select('*').in('set_id', sets.map(row => row.id)).eq('nominated', true).order('teacher_username').order('student_id')) : [];
  const students = rows.length ? await allRows(() => client.from('students').select('id,full_name,teacher_username,source_class').in('id', rows.map(row => row.student_id)).order('full_name')) : [];
  return { sets, rows, students };
}
export function createDashboardRepository(client, { readOnly = false } = {}) {
  const viewerReport = (kind, term, filters) => result(client.rpc(
    'dashboard_viewer_report', { p_kind: kind, p_term: term, ...filters }, { get: true },
  ));
  const champions = (term, week) => readOnly
    ? viewerReport('champions', term, { p_week: week })
    : result(client.rpc('weekly_champions', { p_term: term, p_week: week }));
  const repository = {
    teacherAppearance: () => result(client.from('teacher_preferences').select('text_size').maybeSingle()),
    async saveTeacherAppearance(text_size) {
      const {data,error}=await client.auth.getUser();if(error)throw error;
      if(!data.user)throw new Error('تعذر التحقق من تسجيل الدخول.');
      return result(client.from('teacher_preferences').upsert({user_id:data.user.id,text_size}).select('text_size').single());
    },
    terms: () => result(client.from('school_terms').select('*').order('starts_on', { ascending: false })),
    nimrWeeklyReport: (term, week) => result(client.from('nimr_weekly_reports')
      .select('body,revision').eq('term_id',term).eq('week_start',week).maybeSingle()),
    saveNimrWeeklyReport(term, week, body, revision) {
      const reports = client.from('nimr_weekly_reports');
      const write = revision
        ? reports.update({body}).eq('term_id',term).eq('week_start',week).eq('revision',revision)
        : reports.insert({term_id:term,week_start:week,body});
      return result(write.select('body,revision').maybeSingle());
    },
    khairkomSecondMonthState: term => result(client.from('school_terms').select('khairkom_second_month_open').eq('id',term).single()).then(row => row.khairkom_second_month_open === true),
    setKhairkomSecondMonthOpen: (term, open) => result(client.rpc('set_khairkom_second_month_open', {p_term:term,p_open:open})),
    khairkomRoundState: term => result(client.from('school_terms').select('*').eq('id',term).single()).then(row => ({
      2: row.khairkom_second_month_open === true,
      3: row.khairkom_third_round_open,
    })),
    setKhairkomThirdRoundOpen: (term, open) => result(client.rpc('set_khairkom_third_round_open', {p_term:term,p_open:open})),
    // Rings are shown by class (1A, 1B … 10B) everywhere in the administration.
    teachers: () => result(client.from('teacher_accounts').select('username, full_name, class_name, ring_name, active').eq('active', true).order('username')).then(sortByClass),
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
    async teacherProgress(term, week) {
      const [teachers, reviews, champions, nominations] = await Promise.all([
        result(client.from('teacher_accounts').select('username,full_name,class_name,ring_name,active').eq('active', true).order('username')).then(sortByClass),
        allRows(() => client.from('weekly_reviews').select('teacher_username,week_start,status,knight_student_id').eq('term_id', term).eq('week_start', week).order('teacher_username')),
        champions(term, week),
        loadKhairkom(client, term),
      ]);
      return { teachers, reviews, champions, nominations };
    },
    saveWeek: args => result(client.rpc('save_weekly_evaluation', args)),
    myProfile: async () => (await result(client.rpc('my_teacher_profile')))?.[0] || null,
    setLoginName: name => result(client.rpc('set_my_login_name', { p_login: name })),
    // Admin only. Before teacher-profile.sql is applied the function is missing: no phone numbers.
    async teacherContacts() {
      const { data, error } = await client.rpc('teacher_contacts');
      if (error) { if (error.code === 'PGRST202') return []; throw error; }
      return data || [];
    },
    // Class changes (class-changes.sql): the teacher reads his own, the administration all.
    // Notices only, so a missing table or a failed read shows no notice instead of an error.
    async classChanges() {
      const { data, error } = await client.from('class_changes').select('*').order('changed_on');
      if (error) { if (['42P01', 'PGRST205'].includes(error.code)) return []; throw error; }
      return data || [];
    },
    async monthly(teacher, term, month) {
      const reports = await result(client.from('monthly_reports').select('*').eq('teacher_username', teacher).eq('term_id', term).eq('month_start', month));
      const report = reports[0] || null;
      if (report && (report.teacher_username !== teacher || report.term_id !== term || report.month_start !== month)) {
        throw new Error('تعذّر مطابقة التقرير مع الشهر والحلقة المختارين. حدّث البيانات وأعد المحاولة.');
      }
      const [entries, rules] = await Promise.all([
        report ? allRows(() => client.from('monthly_entries').select('*').eq('report_id', report.id).order('student_id')) : [],
        rangeRules(client, term, month, teacher),
      ]);
      return { report, entries, rangeRequired: rules.length > 0 };
    },
    async monthlyComparison(teacher, term, [firstMonth, secondMonth]) {
      const [first, second, roster] = await Promise.all([
        this.monthly(teacher, term, firstMonth),
        this.monthly(teacher, term, secondMonth),
        allRows(() => client.from('students').select('id,full_name,source_class,teacher_username,student_code,active')
          .eq('teacher_username', teacher).order('id')),
      ]);
      const rosterIds = new Set(roster.map(student => student.id));
      const historicalIds = [...new Set([...first.entries, ...second.entries]
        .map(entry => entry.student_id).filter(id => !rosterIds.has(id)))];
      const historical = [];
      for (let start = 0; start < historicalIds.length; start += 100) {
        historical.push(...await result(client.from('students').select('id,full_name,source_class,teacher_username,student_code')
          .in('id', historicalIds.slice(start, start + 100))));
      }
      return { first, second, students: [...roster, ...historical] };
    },
    // Saved entries of one teacher for each month of the term (admin comparison trend chart).
    async monthlyTrend(teacher, term, months) {
      const monthly = await Promise.all(months.map(month => this.monthly(teacher, term, month)));
      return monthly.map(({ report, entries }) => ({ report, entries }));
    },
    async monthlySchoolComparison(term, months) {
      const [reports, students] = await Promise.all([
        allRows(() => client.from('monthly_reports').select('id,month_start')
          .eq('term_id', term).in('month_start', months).order('id')),
        allRows(() => client.from('students').select('id,full_name,source_class,teacher_username,student_code,active').order('id')),
      ]);
      const periodByReport = new Map(reports.map(report => [report.id, report.month_start]));
      const entries = await monthlyEntries(client, reports);
      return { students, entries: months.map(month => entries.filter(entry => periodByReport.get(entry.report_id) === month)) };
    },
    monthStates: term => result(client.from('monthly_workflow_access').select('month_start,is_open,updated_at').eq('term_id',term).order('month_start')),
    setMonthOpen: (term,month,open) => result(client.rpc('set_month_workflow_open',{p_term:term,p_month:month,p_open:open})),
    async monthlyOverview(term,month) {
      const [reports,students]=await Promise.all([
        allRows(()=>client.from('monthly_reports').select('*').eq('term_id',term).eq('month_start',month).order('teacher_username')),
        allRows(()=>client.from('students').select('id,full_name,source_class,teacher_username,active').order('id')),
      ]);
      const [entries,rules]=await Promise.all([monthlyEntries(client, reports),rangeRules(client,term,month)]);
      return {reports,students,entries,rangeRules:rules};
    },
    async saveMonthly(args) {
      const saved = await result(client.rpc('save_monthly_report', args));
      if (!saved?.id || saved.teacher_username !== args.p_teacher || saved.term_id !== args.p_term ||
          saved.month_start !== args.p_month || saved.version !== args.p_version + 1) {
        throw new Error('تعذّر تأكيد حفظ التقرير للشهر المختار. حدّث البيانات قبل إعادة المحاولة.');
      }
      return saved;
    },
    khairkom: (term,period=1) => loadKhairkom(client, term,period),
    khairkomReport: (term,period=1) => readOnly ? viewerReport('khairkom', term, { p_period: period })
      : result(client.rpc('khairkom_report_snapshot_period', {p_term:term,p_period:period})),
    khairkomCandidates: (term,period=1) => result(client.rpc('khairkom_nomination_candidates_period', {p_term:term,p_period:period})),
    addKhairkomNomination: args => result(client.rpc('add_khairkom_nomination_period', args)),
    updateKhairkomNominee: args => result(client.rpc('update_khairkom_nominee', args)),
    updateKhairkomIdentity: args => result(client.rpc('update_khairkom_identity', args)),
    saveKhairkom: args => result(client.rpc('save_khairkom_nominations_period', args)),
    champions,
    knight: args => result(client.rpc('select_manual_weekly_knight', args)),
    honors: args => result(client.rpc('save_semester_honors', args)),
    reopen: args => result(client.rpc('reopen_weekly_evaluation', args)),
    manageStudent: args => result(client.rpc('manage_student', args)),
    manageOwnStudent: args => result(client.rpc('manage_own_student', args)),
    addOwnStudents: students => result(client.rpc('add_own_students', {p_rows:students.map(({full_name,student_code})=>({full_name,student_code:student_code||null}))})),
    rosterRequests: () => allRows(()=>client.from('roster_change_requests').select('*').order('created_at',{ascending:false}).order('id')),
    requestRosterAdditions: (students,teacher) => result(client.rpc('request_roster_additions',{p_rows:students.map(({full_name,student_code})=>({full_name,student_code:student_code||null})),p_teacher:teacher})),
    requestRosterStatus: (student,active) => result(client.rpc('request_roster_status',{p_student:student,p_active:active})),
    decideRosterRequest: (id,approve,note) => result(client.rpc('decide_roster_request',{p_request:id,p_approve:approve,p_note:note})),
    addTerm: term => result(client.from('school_terms').insert(term).select().single()),
    addStudents: students => result(client.from('students').insert(students).select('id')),
  };
  if (!readOnly) return repository;
  const reads = new Set([
    'teacherAppearance', 'terms', 'nimrWeeklyReport', 'khairkomSecondMonthState',
    'khairkomRoundState', 'teachers', 'weekStates', 'context', 'overview',
    'teacherProgress', 'monthly', 'monthlyComparison', 'monthlyTrend', 'monthlySchoolComparison',
    'monthStates', 'monthlyOverview', 'khairkom', 'khairkomReport', 'champions',
    'rosterRequests',
  ]);
  for (const name of Object.keys(repository)) {
    if (!reads.has(name)) repository[name] = async () => {
      throw { code: '42501', message: 'هذا الحساب للاطلاع فقط.' };
    };
  }
  return repository;
}
