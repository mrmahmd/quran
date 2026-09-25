import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

const projectUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(projectUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const headers = {
  'Access-Control-Allow-Origin': 'https://mrmahmd.github.io',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}
const response = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers })

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers })
  if (request.method !== 'POST') return response(405, 'الطلب غير مدعوم')
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return response(400, 'البيانات غير صالحة') }
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.trim() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^\S+@\S+\.\S+$/.test(email) || !/^\d{6}$/.test(code) || password.length < 6 || password.length > 128) {
    return response(400, 'تحقق من البريد ورمز التفعيل وكلمة المرور (٦ أحرف على الأقل)')
  }
  const codeHash = await sha256(code)
  const { data: checks, error: lookupError } = await admin.rpc('verify_admin_activation', {
    p_email: email,
    p_code_hash: codeHash,
  })
  if (lookupError) return response(503, 'تعذر التفعيل الآن، حاول لاحقًا')
  if (checks?.[0]?.result !== 'ok') return response(403, 'بيانات التفعيل غير صحيحة أو سبق استخدام الرمز')

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: 'admin' },
  })
  if (createError || !created.user) return response(503, 'تعذر إنشاء الحساب الآن، راجع الإدارة')
  const { data: claimed, error: claimError } = await admin.from('admin_accounts')
    .update({ auth_user_id: created.user.id, activated_at: new Date().toISOString() })
    .eq('email', email).eq('activation_hash', codeHash).is('auth_user_id', null)
    .select('email').maybeSingle()
  if (claimError || !claimed) {
    await admin.auth.admin.deleteUser(created.user.id)
    return response(409, 'تعذر إتمام التفعيل، راجع الإدارة')
  }
  return response(200, 'تم تفعيل حساب الإدارة. يمكنك الدخول بالبريد وكلمة المرور')
})
