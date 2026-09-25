const config = window.QURAN_PLATFORM_CONFIG;
const client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey);
const loginForm = document.querySelector('#login-form');
const activationForm = document.querySelector('#activation-form');
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
  accountPanel.hidden = form !== 'account';
  document.querySelector('#login-error').classList.remove('show');
  document.querySelector('#activation-error').classList.remove('show');
  document.querySelector('#login-title').textContent = form === 'activation' ? 'تفعيل الحساب' : 'مرحبًا بعودتك';
  document.querySelector('.card-heading p').textContent = form === 'activation'
    ? 'أنشئ كلمة مرورك لأول مرة'
    : 'ادخل باسم المستخدم وكلمة المرور';
}

async function showAccount(user) {
  const { data: adminAccount } = await client.from('admin_accounts')
    .select('email, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (adminAccount?.active) {
    document.querySelector('#account-name').textContent = `إدارة المدرسة القرآنية: ${adminAccount.email}`;
    document.querySelector('#account-class').textContent = 'الصلاحية: مدير عام للمنصة';
    showForm('account');
    return;
  }
  const { data, error } = await client.from('teacher_accounts')
    .select('full_name, class_name, active')
    .eq('auth_user_id', user.id)
    .maybeSingle();
  if (error || !data || !data.active) {
    await client.auth.signOut();
    showForm('login');
    showMessage(document.querySelector('#login-error'), 'الحساب غير مرتبط بمعلم نشط. تواصل مع الإدارة.');
    return;
  }
  document.querySelector('#account-name').textContent = `المعلم: ${data.full_name}`;
  document.querySelector('#account-class').textContent = `الفصل: ${data.class_name}`;
  showForm('account');
}

document.querySelector('.show-password').addEventListener('click', (event) => {
  const reveal = password.type === 'password';
  password.type = reveal ? 'text' : 'password';
  event.currentTarget.setAttribute('aria-label', reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
});

document.querySelector('#show-activation').addEventListener('click', () => showForm('activation'));
document.querySelector('#show-login').addEventListener('click', () => showForm('login'));
document.querySelector('#logout-button').addEventListener('click', async () => {
  await client.auth.signOut();
  showForm('login');
});

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = loginForm.querySelector('.submit-button');
  const username = document.querySelector('#username').value.trim().toLowerCase();
  const isEmail = username.includes('@');
  if ((!isEmail && !/^quran\d{2}$/.test(username)) || (isEmail && !/^\S+@\S+\.\S+$/.test(username))) {
    showMessage(document.querySelector('#login-error'), 'اكتب اسم مستخدم المعلم أو بريد الإدارة بشكل صحيح.');
    return;
  }
  button.disabled = true;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: isEmail ? username : `${username}@quran-school.invalid`,
      password: password.value,
    });
    if (error || !data.user) throw error || new Error('login_failed');
    await showAccount(data.user);
  } catch {
    showMessage(document.querySelector('#login-error'), 'اسم المستخدم أو كلمة المرور غير صحيحة.');
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

client.auth.getUser().then(({ data }) => {
  if (data.user) showAccount(data.user);
});

document.querySelector('#year').textContent = new Date().getFullYear();
