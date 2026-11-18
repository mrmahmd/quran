// "حسابي": account details, the teacher's own login name, and the password.
// Teachers get a full page in their dashboard (renderMyAccountPage); the administration keeps a dialog.
// loadProfile/changeLoginName are given for teacher accounts only.

const passwordMessages = {
  weak_password: 'اختر كلمة مرور أقوى تستوفي شروط الأمان.',
  same_password: 'اختر كلمة مرور مختلفة عن الحالية.',
  session_not_found: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
  reauthentication_needed: 'جدّد جلسة تسجيل الدخول ثم حاول مرة أخرى.',
  current_password_required: 'إعدادات المصادقة الحالية تتطلب التحقق من كلمة المرور القديمة.',
};

function buildAccount({ account, changePassword, loadProfile, changeLoginName, page, onClose }) {
  const admin = account.role === 'admin';
  const teacherTools = !admin && typeof loadProfile === 'function' && typeof changeLoginName === 'function';
  const node = document.createElement(page ? 'section' : 'div');
  node.className = page ? 'my-account my-account-page' : 'my-account-body';
  node.innerHTML = `
    ${page ? `<div class="section-heading"><div><p class="section-kicker teal-text">بيانات الحساب</p><h2 id="my-account-title">حسابي</h2>
      <p>بياناتك في المنصة، ومنها تغيّر اسم المستخدم الذي تدخل به وكلمة المرور.</p></div></div>` : '<h2 id="my-account-title">حسابي</h2>'}
    <div class="my-account-cards">
      <section class="my-account-card my-account-info" aria-labelledby="my-account-info-title">
        <h3 id="my-account-info-title">بياناتي</h3>
        <dl class="my-account-details"></dl>
        ${teacherTools ? '<p class="my-account-hint">لتعديل الاسم أو رقم الهاتف تواصل مع إدارة المدرسة.</p>' : ''}
      </section>
      ${teacherTools ? `<form class="my-account-card" data-account-login novalidate>
        <h3>تعديل اسم المستخدم</h3>
        <p class="my-account-hint">اسم تدخل به بدل <bdi dir="ltr" data-original-username></bdi>: حروف إنجليزية صغيرة وأرقام ويبدأ بحرف (مثال: <bdi dir="ltr">ahmed.salem</bdi>). يظل اسمك الأصلي صالحًا للدخول أيضًا، ولا يتغير طلابك أو تقاريرك.</p>
        <label>اسم المستخدم الجديد
          <input name="login" type="text" dir="ltr" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="32" required>
        </label>
        <p class="my-account-status" role="status" aria-live="polite"></p>
        <div class="my-account-actions"><button type="submit" class="solid-button">حفظ اسم المستخدم</button></div>
      </form>` : ''}
      <form class="my-account-card" data-account-password>
        <h3>تعديل كلمة المرور</h3>
        <label>كلمة المرور الجديدة
          <input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
        </label>
        <label>تأكيد كلمة المرور الجديدة
          <input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
        </label>
        <p class="my-account-status" role="status" aria-live="polite"></p>
        <div class="my-account-actions">
          ${page ? '' : '<button type="button" class="light-button" data-close-account>إغلاق</button>'}
          <button type="submit" class="solid-button">حفظ كلمة المرور</button>
        </div>
      </form>
    </div>`;

  const details = node.querySelector('dl');
  let profile = null;
  function renderDetails() {
    const rows = [
      ['اسم المستخدم', admin ? account.email?.split('@')[0] : profile?.login_name || account.username],
      ['نوع الحساب', admin ? 'إدارة' : 'معلم'],
    ];
    if (!admin) {
      rows.unshift(['اسم المعلم', profile?.full_name || account.full_name]);
      if (teacherTools) rows.push(['رقم الهاتف', profile ? profile.phone || 'غير مسجّل — تواصل مع الإدارة' : 'جارٍ التحميل…']);
      rows.push(['الفصل', account.class_name]);
      if (account.ring_name) rows.push(['الحلقة', account.ring_name]);
    }
    details.replaceChildren();
    for (const [label, value] of rows) {
      const term = document.createElement('dt');
      const description = document.createElement('dd');
      term.textContent = label;
      description.textContent = value || 'غير محدد';
      description.dir = label === 'رقم الهاتف' || label === 'اسم المستخدم' ? 'ltr' : 'auto';
      details.append(term, description);
    }
  }
  renderDetails();

  const form = node.querySelector('[data-account-password]');
  const save = form.querySelector('[type="submit"]');
  const close = form.querySelector('[data-close-account]');
  const status = form.querySelector('[role="status"]');
  const loginForm = node.querySelector('[data-account-login]');
  const loginSave = loginForm?.querySelector('[type="submit"]');
  const loginStatus = loginForm?.querySelector('[role="status"]');
  const busy = () => save.disabled || loginSave?.disabled;
  const lock = value => { save.disabled = value; if (loginSave) loginSave.disabled = value; if (close) close.disabled = value; };
  close?.addEventListener('click', () => onClose?.());

  async function refresh() {
    if (!teacherTools) return;
    try {
      profile = await loadProfile();
      if (!node.isConnected) return;
      renderDetails();
      loginForm.querySelector('[data-original-username]').textContent = profile?.username || account.username;
      loginForm.elements.login.value = profile?.login_name || account.username;
    } catch {
      profile = null;
      loginStatus.dataset.result = 'error';
      loginStatus.textContent = 'تعذر تحميل بيانات الحساب. حدّث الصفحة وحاول مرة أخرى.';
    }
  }
  function reset() {
    form.reset();
    for (const element of [status, loginStatus].filter(Boolean)) {
      element.textContent = '';
      delete element.dataset.result;
    }
  }

  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy()) return;
    const value = loginForm.elements.login.value.trim().toLowerCase();
    loginStatus.dataset.result = 'error';
    if (!/^[a-z][a-z0-9._-]{2,31}$/.test(value)) {
      loginStatus.textContent = 'اكتب من ٣ إلى ٣٢ حرفًا: حروف إنجليزية صغيرة وأرقام و . _ - ويبدأ بحرف.';
      loginForm.elements.login.focus();
      return;
    }
    if (value === (profile?.login_name || account.username)) {
      loginStatus.textContent = 'هذا هو اسم المستخدم الحالي.';
      return;
    }
    lock(true);
    delete loginStatus.dataset.result;
    loginStatus.textContent = 'جارٍ حفظ اسم المستخدم…';
    try {
      const saved = await changeLoginName(value);
      profile = { ...(profile || {}), login_name: saved };
      loginForm.elements.login.value = saved;
      renderDetails();
      loginStatus.dataset.result = 'success';
      loginStatus.textContent = `تم الحفظ. ادخل من الآن باسم «${saved}» وكلمة مرورك نفسها.`;
    } catch (error) {
      loginStatus.dataset.result = 'error';
      loginStatus.textContent = /[؀-ۿ]/.test(error?.message || '') ? error.message : 'تعذر حفظ اسم المستخدم. تحقّق من الاتصال وحاول مرة أخرى.';
    } finally {
      lock(false);
    }
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy()) return;
    const { password, confirmation } = form.elements;
    status.dataset.result = 'error';
    if (password.value !== confirmation.value) {
      status.textContent = 'كلمتا المرور غير متطابقتين.';
      confirmation.focus();
      return;
    }
    if (password.value.length < 6 || password.value.length > 128) {
      status.textContent = 'اكتب كلمة مرور من ٦ إلى ١٢٨ حرفًا.';
      password.focus();
      return;
    }
    lock(true);
    delete status.dataset.result;
    status.textContent = 'جارٍ حفظ كلمة المرور…';
    try {
      await changePassword(password.value);
      form.reset();
      status.dataset.result = 'success';
      status.textContent = 'تم حفظ كلمة المرور الجديدة.';
    } catch (error) {
      status.dataset.result = 'error';
      status.textContent = passwordMessages[error?.code] || 'تعذر تأكيد حفظ كلمة المرور. تحقّق من الاتصال قبل إعادة المحاولة.';
    } finally {
      lock(false);
    }
  });

  return { node, refresh, reset, busy };
}

// Teacher dashboard page: shown in the dashboard content when the "حسابي" section is chosen.
export function renderMyAccountPage(container, account, changePassword, { loadProfile = null, changeLoginName = null } = {}) {
  const view = buildAccount({ account, changePassword, loadProfile, changeLoginName, page: true });
  container.replaceChildren(view.node);
  view.refresh();
  return view;
}

// Header button. With openPage (teachers) it opens the dashboard page; otherwise a dialog.
export function mountMyAccount(root, account, changePassword, { loadProfile = null, changeLoginName = null, openPage = null } = {}) {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'light-button';
  open.textContent = 'حسابي';
  root.querySelector('#dashboard-logout').before(open);
  if (typeof openPage === 'function') {
    open.dataset.view = 'account';
    return;
  }
  open.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog my-account';
  dialog.setAttribute('aria-labelledby', 'my-account-title');
  const view = buildAccount({ account, changePassword, loadProfile, changeLoginName, page: false, onClose: () => dialog.close() });
  dialog.append(view.node);
  root.append(dialog);
  open.addEventListener('click', () => { dialog.showModal(); view.refresh(); });
  dialog.addEventListener('cancel', event => { if (view.busy()) event.preventDefault(); });
  dialog.addEventListener('close', () => view.reset());
}
