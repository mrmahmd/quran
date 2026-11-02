import { requestRecovery, verifyRecovery, updateRecoveredPassword } from './password-recovery.mjs?v=1';

const hash = new URLSearchParams(window.location.hash.slice(1));
const isRecoveryLink = hash.get('type') === 'recovery';
const hasLinkError = hash.has('error') || hash.has('error_code');
const config = window.QURAN_PLATFORM_CONFIG;
const requestForm = document.querySelector('#recovery-request');
const updateForm = document.querySelector('#recovery-update');
const status = document.querySelector('#recovery-status');
let recoveryUser = null;
let client;

function message(text, success = false) {
  status.textContent = text;
  status.classList.toggle('success', success);
  status.classList.add('show');
}

function errorMessage(error) {
  const code = error.code || error.message;
  if (code === 'real_email_required') return 'اكتب بريد الحساب الحقيقي. حسابات المعلمين بأسماء quran تستعيدها إدارة المدرسة.';
  if (code === 'password_short') return 'كلمة المرور يجب أن تكون ٦ أحرف على الأقل.';
  if (code === 'password_mismatch') return 'تأكيد كلمة المرور لا يطابق كلمة المرور الجديدة.';
  if (code === 'same_password') return 'اختر كلمة مرور مختلفة عن كلمة المرور السابقة.';
  if (code === 'weak_password') return 'كلمة المرور لا تستوفي شروط الأمان. اختر كلمة مرور أقوى.';
  if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit') return 'تم تجاوز عدد المحاولات المتاح. انتظر قليلًا ثم حاول مجددًا.';
  if (code === 'email_address_not_authorized') return 'خدمة البريد لا تسمح بالإرسال لهذا العنوان حاليًا. تواصل مع مسؤول المنصة لإعداد خدمة البريد.';
  if (['recovery_expired', 'session_not_found', 'refresh_token_not_found', 'otp_expired'].includes(code)) return 'رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.';
  return 'تعذر إكمال الطلب. تحقق من الاتصال وحاول مجددًا، أو تواصل مع مسؤول المنصة.';
}

async function initialize() {
  try {
    // Keep the recovery session in memory and separate from any open school dashboard.
    client = window.supabase.createClient(config.supabaseUrl, config.supabasePublishableKey, {
      auth: { storageKey: 'quran-password-recovery', persistSession: false, autoRefreshToken: false, detectSessionInUrl: true, flowType: 'implicit' },
    });
    recoveryUser = await verifyRecovery(client.auth, isRecoveryLink);
    window.history.replaceState(null, '', window.location.pathname);
    if (recoveryUser) {
      document.querySelector('#recovery-account').textContent = recoveryUser.email || '';
      document.querySelector('#recovery-title').textContent = 'كلمة مرور جديدة';
      document.querySelector('#recovery-subtitle').textContent = 'تم التحقق من رابط الاستعادة';
      updateForm.hidden = false;
    } else {
      requestForm.hidden = false;
      if (isRecoveryLink || hasLinkError) message('رابط الاستعادة غير صالح أو انتهت صلاحيته. اطلب رابطًا جديدًا.');
    }
  } catch {
    window.history.replaceState(null, '', window.location.pathname);
    requestForm.hidden = false;
    message(isRecoveryLink || hasLinkError ? 'تعذر التحقق من رابط الاستعادة. اطلب رابطًا جديدًا.' : 'تعذر الاتصال بالخدمة. أعد تحميل الصفحة ثم حاول مجددًا.');
  } finally {
    document.querySelector('#recovery-loading').hidden = true;
  }
}

requestForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = requestForm.querySelector('button');
  button.disabled = true;
  status.classList.remove('show');
  try {
    const redirect = new URL('password-reset.html', window.location.href).href;
    await requestRecovery(client.auth, document.querySelector('#recovery-email').value, redirect);
    message('إذا كان البريد مرتبطًا بحساب، ستصلك رسالة استعادة. افتح أحدث رسالة وتحقق من مجلد البريد غير المرغوب فيه.', true);
  } catch (error) {
    message(errorMessage(error));
  } finally {
    button.disabled = false;
  }
});

updateForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = updateForm.querySelector('button');
  button.disabled = true;
  status.classList.remove('show');
  try {
    await updateRecoveredPassword(client.auth, recoveryUser?.id,
      document.querySelector('#recovery-password').value, document.querySelector('#recovery-confirm').value);
    updateForm.reset();
    updateForm.hidden = true;
    recoveryUser = null;
    message('تم حفظ كلمة المرور الجديدة. يمكنك الآن العودة لتسجيل الدخول.', true);
    // A cleanup failure must not report a successful password change as failed.
    await client.auth.signOut({ scope: 'local' }).catch(() => {});
  } catch (error) {
    message(errorMessage(error));
  } finally {
    button.disabled = false;
  }
});

initialize();
