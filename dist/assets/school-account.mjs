export async function schoolAccountRequest(config, payload, fetcher = fetch) {
  let response;
  try {
    response = await fetcher(`${config.supabaseUrl}/functions/v1/school-account`, {
      method: 'POST',
      headers: {
        apikey: config.supabasePublishableKey,
        Authorization: `Bearer ${config.supabasePublishableKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('تعذر الاتصال بالخدمة. إن كنت تحفظ كلمة مرور جديدة، جرّب تسجيل الدخول بها قبل إعادة المحاولة.');
  }
  let result;
  try { result = await response.json(); } catch { throw new Error('تعذر تأكيد النتيجة. جرّب تسجيل الدخول قبل إعادة المحاولة.'); }
  if (!response.ok) throw new Error(result.message || 'تعذر إكمال الطلب الآن. حاول لاحقًا.');
  if (payload.action === 'login') {
    if (!result.access_token || !result.refresh_token) throw new Error('تعذر تسجيل الدخول.');
    return { access_token: result.access_token, refresh_token: result.refresh_token };
  }
  if (result.recovered !== true) throw new Error('تعذر تأكيد تغيير كلمة المرور. جرّب تسجيل الدخول قبل إعادة المحاولة.');
}
