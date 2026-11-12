import { restoreAccount } from './session-restore.mjs?v=session3';
import { schoolAccountRequest } from './school-account.mjs?v=1';
const config = window.QURAN_PLATFORM_CONFIG;
const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } });
const loginForm = document.querySelector('#login-form');
const activationForm = document.querySelector('#activation-form');
const recoveryForm = document.querySelector('#recovery-form');
const accountPanel = document.querySelector('#account-panel');
const password = document.querySelector('#password');

function showMessage(element, message, success = false) {
  element.textContent = message;
  element.classList.toggle('success', success);
  element.classList.add('show');
}

function normalizeDigits(value) {
  return value.trim()
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
}

function showForm(form) {
  loginForm.hidden = form !== 'login';
  activationForm.hidden = form !== 'activation';
  recoveryForm.hidden = form !== 'recovery';
  accountPanel.hidden = form !== 'account';
  document.querySelector('#login-error').classList.remove('show');
  document.querySelector('#activation-error').classList.remove('show');
  document.querySelector('#recovery-error').classList.remove('show');
  if (form !== 'recovery') recoveryForm.reset();
  const heading = {
    activation: ['تفعيل الحساب', 'أنشئ كلمة مرورك لأول مرة'],
    recovery: ['استعادة كلمة المرور', 'اسم المستخدم ورمز المدرسة'],
  }[form] || ['تسجيل الدخول', 'ادخل باسم المستخدم وكلمة المرور'];
  document.querySelector('#login-title').textContent = heading[0];
  document.querySelector('.card-heading p').textContent = heading[1];
}

async function showAccount(user) {
  const { data: adminAccount, error: adminError } = await client.from('admin_accounts')
    .select('email, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (adminError) throw adminError;
  if (adminAccount?.active) {
    await openDashboard({ role: 'admin', email: adminAccount.email }, user.id);
    return;
  }
  const { data, error } = await client.from('teacher_accounts')
    .select('username, full_name, class_name, ring_name, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !data.active) {
    // An account lookup must never destroy a persisted session.
    showForm('login');
    showMessage(document.querySelector('#login-error'), 'الحساب غير مرتبط بمعلم نشط. تواصل مع الإدارة.');
    return;
  }
  const { data: managesRosters, error: managerError } = await client.rpc('is_roster_manager');
  if (managerError) throw managerError;
  const { data: nominationAccess, error: nominationError } = await client.rpc('khairkom_permissions');
  if (nominationError && nominationError.code !== 'PGRST202') throw nominationError;
  await openDashboard({ ...data, role: 'teacher', roster_manager: managesRosters === true, khairkom_viewer: nominationAccess?.view === true, khairkom_identity_editor: nominationAccess?.edit_identity === true, khairkom_nomination_adder: nominationAccess?.add_nomination === true }, user.id);
}

async function openDashboard(account, userId) {
  const [{ mountDashboard }, { createDashboardRepository }] = await Promise.all([
    import('./dashboard.mjs?v=nas-duha'), import('./dashboard-repository.mjs?v=round3'),
  ]);
  const previousRoot = document.querySelector('#dashboard-root');
  const root = previousRoot.cloneNode(false);
  previousRoot.replaceWith(root);
  document.querySelector('.page-shell').hidden = true;
  root.hidden = false;
  await mountDashboard(root, {
    account, repository: createDashboardRepository(client),
    onChangePassword: async password => {
      const { data: sessionUser, error: sessionError } = await client.auth.getUser();
      if (sessionError) throw sessionError;
      if (sessionUser.user?.id !== userId) throw { code: 'session_not_found' };
      const { error } = await client.auth.updateUser({ password });
      if (error) throw error;
    },
    onLogout: async () => {
      const { error } = await client.auth.signOut();
      if (error) throw error;
      root.hidden = true; root.replaceChildren();
      document.querySelector('.page-shell').hidden = false;
      showForm('login');
    },
  });
}

document.querySelector('.show-password').addEventListener('click', (event) => {
  const reveal = password.type === 'password';
  password.type = reveal ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-label', reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
});

document.querySelector('#show-activation').addEventListener('click', () => showForm('activation'));
document.querySelector('#show-login').addEventListener('click', () => showForm('login'));
document.querySelector('#show-recovery').addEventListener('click', () => {
  showForm('recovery');
  const username = document.querySelector('#username').value.trim().toLowerCase();
  document.querySelector('#recovery-username').value = username.includes('@') ? username.split('@')[0] : username;
});
document.querySelector('#recovery-show-login').addEventListener('click', () => showForm('login'));
if (window.location.hash === '#recover') showForm('recovery');
document.querySelector('#logout-button').addEventListener('click', async () => {
  await client.auth.signOut();
  showForm('login');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('.submit-button');
  const username = document.querySelector('#username').value.trim().toLowerCase();
  const isEmail = username.includes('@');
  if ((!isEmail && !/^[a-z][a-z0-9._-]{1,63}$/.test(username)) || (isEmail && !/^\S+@\S+\.\S+$/.test(username))) {
    showMessage(document.querySelector('#login-error'), 'اكتب اسم المستخدم بشكل صحيح.');
    return;
  }
  button.disabled = true;
  try {
    let result;
    if (!isEmail && !/^quran\d{2}$/.test(username)) {
      const session = await schoolAccountRequest(config, { action: 'login', username, password: password.value });
      result = await client.auth.setSession(session);
    } else {
      result = await client.auth.signInWithPassword({
        email: isEmail ? username : `${username}@quran-school.invalid`, password: password.value,
      });
    }
    const { data, error } = result;
    if (error || !data.user) throw error || new Error('login_failed');
    await showAccount(data.user);
  } catch {
    showMessage(document.querySelector('#login-error'), 'اسم المستخدم أو كلمة المرور غير صحيحة.');
  } finally {
    button.disabled = false;
  }
});

recoveryForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = recoveryForm.querySelector('.submit-button');
  const status = document.querySelector('#recovery-error');
  const username = document.querySelector('#recovery-username').value.trim().toLowerCase();
  const code = normalizeDigits(document.querySelector('#recovery-code').value);
  const newPassword = document.querySelector('#recovery-password').value;
  if (!/^[a-z][a-z0-9._-]{1,63}$/.test(username) || !/^\d{6}$/.test(code)) {
    showMessage(status, 'اكتب اسم المستخدم ورمز المدرسة المكوّن من ٦ أرقام.');
    return;
  }
  if (newPassword !== document.querySelector('#recovery-confirm').value) {
    showMessage(status, 'تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.');
    return;
  }
  button.disabled = true;
  status.classList.remove('show');
  try {
    await schoolAccountRequest(config, { action: 'recover', username, code, password: newPassword });
    recoveryForm.reset();
    document.querySelector('#username').value = username;
    password.value = '';
    showForm('login');
    if (window.location.hash === '#recover') window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#login`);
    showMessage(document.querySelector('#login-error'), 'تم حفظ كلمة المرور الجديدة. سجّل الدخول باسم المستخدم وكلمة المرور الجديدة.', true);
  } catch (error) {
    showMessage(status, error.message || 'تعذر تأكيد تغيير كلمة المرور. جرب تسجيل الدخول قبل إعادة المحاولة.');
  } finally {
    button.disabled = false;
  }
});

activationForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = activationForm.querySelector('.submit-button');
  const status = document.querySelector('#activation-error');
  const code = normalizeDigits(document.querySelector('#activation-code').value);
  if (!/^\d{6}$/.test(code)) {
    showMessage(status, 'رمز التفعيل يجب أن يكون ٦ أرقام.');
    return;
  }
  button.disabled = true;
  try {
    const identifier = document.querySelector('#activation-username').value.trim().toLowerCase();
    const isAdmin = identifier.includes('@');
    const response = await fetch(`${config.supabaseUrl}/functions/v1/${isAdmin ? 'activate-admin' : 'activate-teacher'}`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...(isAdmin ? { email: identifier } : { username: identifier }),
        code,
        password: document.querySelector('#activation-password').value,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'تعذر تفعيل الحساب');
    activationForm.reset();
    showForm('login');
    showMessage(document.querySelector('#login-error'), 'تم تفعيل حسابك. سجّل الدخول بكلمة المرور التي اخترتها.', true);
  } catch (error) {
    showMessage(status, error.message || 'تعذر الاتصال بالخدمة، حاول مرة أخرى.');
  } finally {
    button.disabled = false;
  }
});

restoreAccount(client, user => recoveryForm.hidden ? showAccount(user) : undefined).catch(() => {
  if (!recoveryForm.hidden) return;
  showForm('login');
  showMessage(document.querySelector('#login-error'), 'تعذر استعادة لوحة التحكم الآن. جلستك محفوظة؛ أعد تحديث الصفحة أو حاول عند عودة الاتصال.');
});

document.querySelector('#year').textContent = new Date().getFullYear();
