const origin = 'https://mrmahmd.github.io';
const headers = {
  'Access-Control-Allow-Origin': origin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};
const reply = (status, body) => new Response(JSON.stringify(body), { status, headers });
const invalid = () => reply(403, { message: 'البيانات غير صحيحة أو المحاولات موقوفة مؤقتًا. راجع اسم المستخدم ورمز المدرسة، أو انتظر ١٥ دقيقة.' });

async function hashCode(code) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

// A teacher's self-chosen login name (teacher_accounts.login_name) maps to the unchanged quranNN account.
async function teachersByLoginName(admin, username) {
  const lookup = await admin.from('teacher_accounts').select('username, login_name, auth_user_id, active');
  if (lookup.error) throw new Error('teacher lookup failed');
  return (lookup.data || []).filter(account => account.login_name === username);
}

export function schoolAccountHandler({ admin, passwordClient }) {
  return async request => {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply(405, { message: 'الطلب غير مدعوم' });
    if (request.headers.get('origin') && request.headers.get('origin') !== origin) return reply(403, { message: 'مصدر الطلب غير مسموح' });
    let body;
    try {
      const input = await request.text();
      if (input.length > 4096) return reply(413, { message: 'البيانات أكبر من المسموح' });
      body = JSON.parse(input);
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    } catch { return reply(400, { message: 'البيانات غير صالحة' }); }
    const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(username) || password.length < 6 || password.length > 128) {
      return reply(400, { message: 'تحقق من اسم المستخدم وكلمة المرور (من ٦ إلى ١٢٨ حرفًا)' });
    }
    try {
      if (body.action === 'login') {
        // quranNN keeps the ordinary Auth flow; here: teacher login names, then admin aliases.
        if (/^quran\d{2}$/.test(username)) return invalid();
        const teachers = await teachersByLoginName(admin, username);
        if (teachers.length) {
          const [teacher] = teachers;
          if (teachers.length !== 1 || !teacher.active || !teacher.auth_user_id || !/^quran\d{2}$/.test(teacher.username)) return invalid();
          const signed = await passwordClient().auth.signInWithPassword({ email: `${teacher.username}@quran-school.invalid`, password });
          if (signed.error || !signed.data.session || signed.data.user?.id !== teacher.auth_user_id) return invalid();
          return reply(200, { access_token: signed.data.session.access_token, refresh_token: signed.data.session.refresh_token });
        }
        const lookup = await admin.from('admin_accounts').select('email, auth_user_id, active');
        if (lookup.error) return reply(503, { message: 'تعذر تسجيل الدخول الآن' });
        const matches = (lookup.data || []).filter(account => account.email.split('@')[0].toLowerCase() === username);
        if (matches.length !== 1 || !matches[0].active || !matches[0].auth_user_id) return invalid();
        const result = await passwordClient().auth.signInWithPassword({ email: matches[0].email, password });
        if (result.error || !result.data.session || result.data.user?.id !== matches[0].auth_user_id) return invalid();
        return reply(200, { access_token: result.data.session.access_token, refresh_token: result.data.session.refresh_token });
      }
      if (body.action !== 'recover') return reply(400, { message: 'الطلب غير مدعوم' });
      const code = typeof body.code === 'string' ? body.code.trim()
        .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
        .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0)) : '';
      if (!/^\d{6}$/.test(code)) return reply(400, { message: 'رمز المدرسة يجب أن يكون ٦ أرقام' });
      let account_name = username;
      if (!/^quran\d{2}$/.test(username)) {
        const teachers = await teachersByLoginName(admin, username);
        if (teachers.length > 1) return invalid();
        if (teachers.length === 1) account_name = teachers[0].username;
      }
      const check = await admin.rpc('verify_school_recovery', { p_username: account_name, p_code_hash: await hashCode(code) });
      if (check.error) return reply(503, { message: 'تعذر التحقق الآن. حاول لاحقًا.' });
      const account = check.data?.[0];
      if (!account?.account_id || account.result !== 'ok') return invalid();
      // Update only this existing user's password; never create an account or alter roles.
      const updated = await admin.auth.admin.updateUserById(account.account_id, { password });
      if (updated.error) {
        if (updated.error.code === 'same_password') return reply(400, { message: 'اختر كلمة مرور مختلفة عن السابقة.' });
        if (updated.error.code === 'weak_password') return reply(400, { message: 'اختر كلمة مرور أقوى تستوفي شروط الأمان.' });
        return reply(503, { message: 'تعذر تأكيد حفظ كلمة المرور. جرّب تسجيل الدخول بها قبل إعادة المحاولة.' });
      }
      if (updated.data.user?.id !== account.account_id) return reply(503, { message: 'تعذر تأكيد حفظ كلمة المرور.' });
      return reply(200, { recovered: true, message: 'تم حفظ كلمة المرور الجديدة' });
    } catch {
      return reply(503, { message: 'تعذر تأكيد العملية. جرّب تسجيل الدخول قبل إعادة المحاولة.' });
    }
  };
}
