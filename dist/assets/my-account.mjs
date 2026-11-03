export function mountMyAccount(root, account, changePassword) {
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'light-button';
  open.textContent = 'حسابي';
  open.setAttribute('aria-haspopup', 'dialog');
  root.querySelector('#dashboard-logout').before(open);

  const dialog = document.createElement('dialog');
  dialog.className = 'confirm-dialog my-account';
  dialog.setAttribute('aria-labelledby', 'my-account-title');
  dialog.innerHTML = `
    <h2 id="my-account-title">حسابي</h2>
    <dl class="my-account-details"></dl>
    <form>
      <h3>تعديل كلمة المرور</h3>
      <label>كلمة المرور الجديدة
        <input name="password" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
      </label>
      <label>تأكيد كلمة المرور الجديدة
        <input name="confirmation" type="password" autocomplete="new-password" minlength="6" maxlength="128" required>
      </label>
      <p class="my-account-status" role="status" aria-live="polite"></p>
      <div class="my-account-actions">
        <button type="button" class="light-button" data-close-account>إغلاق</button>
        <button type="submit" class="solid-button">حفظ كلمة المرور</button>
      </div>
    </form>`;
  const details = dialog.querySelector('dl');
  const admin = account.role === 'admin';
  const rows = [
    ['اسم المستخدم', admin ? account.email?.split('@')[0] : account.username],
    ['نوع الحساب', admin ? 'إدارة' : 'معلم'],
  ];
  if (!admin) {
    rows.push(['اسم المعلم', account.full_name], ['الفصل', account.class_name]);
    if (account.ring_name) rows.push(['الحلقة', account.ring_name]);
  }
  for (const [label, value] of rows) {
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value || 'غير محدد';
    description.dir = 'auto';
    details.append(term, description);
  }
  root.append(dialog);

  const form = dialog.querySelector('form');
  const save = form.querySelector('[type="submit"]');
  const close = form.querySelector('[data-close-account]');
  const status = form.querySelector('[role="status"]');
  open.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('cancel', event => {
    if (save.disabled) event.preventDefault();
  });
  dialog.addEventListener('close', () => {
    form.reset();
    status.textContent = '';
    delete status.dataset.result;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (save.disabled) return;
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
    save.disabled = close.disabled = true;
    delete status.dataset.result;
    status.textContent = 'جارٍ حفظ كلمة المرور…';
    try {
      await changePassword(password.value);
      form.reset();
      status.dataset.result = 'success';
      status.textContent = 'تم حفظ كلمة المرور الجديدة.';
    } catch (error) {
      status.dataset.result = 'error';
      const messages = {
        weak_password: 'اختر كلمة مرور أقوى تستوفي شروط الأمان.',
        same_password: 'اختر كلمة مرور مختلفة عن الحالية.',
        session_not_found: 'انتهت جلسة الدخول. سجّل الدخول مرة أخرى.',
        reauthentication_needed: 'جدّد جلسة تسجيل الدخول ثم حاول مرة أخرى.',
        current_password_required: 'إعدادات المصادقة الحالية تتطلب التحقق من كلمة المرور القديمة.',
      };
      status.textContent = messages[error?.code] || 'تعذر تأكيد حفظ كلمة المرور. تحقّق من الاتصال قبل إعادة المحاولة.';
    } finally {
      save.disabled = close.disabled = false;
    }
  });
}
