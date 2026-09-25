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

function showForm(form) {
  loginForm.hidden = form !== 'login';
  activationForm.hidden = form !== 'activation';
  accountPanel.hidden = form !== 'account';
  document.querySelector('#login-error').classList.remove('show');
  document.querySelector('#activation-error').classList.remove('show');
  document.querySelector('#login-title').textContent = form === 'activation' ? 'تفعيل حساب المعلم' : 'مرحبًا بعودتك';
  document.querySelector('.card-heading p').textContent = form === 'activation'
    ? 'أنشئ كلمة مرورك لأول مرة'
    : 'ادخل باسم المستخدم وكلمة المرور';
}

async function showAccount(user) {
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
  if (!/^quran\d{2}$/.test(username)) {
    showMessage(document.querySelector('#login-error'), 'اكتب اسم المستخدم بالشكل quran01.');
    return;
  }
  button.disabled = true;
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: `${username}@quran-school.invalid`,
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
  button.disabled = true;
  try {
    const response = await fetch(`${config.supabaseUrl}/functions/v1/activate-teacher`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        username: document.querySelector('#activation-username').value,
        code: document.querySelector('#activation-code').value,
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
