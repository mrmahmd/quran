import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.0'

const projectUrl = Deno.env.get('SUPABASE_URL')!
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const admin = createClient(projectUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const allowedOrigin = 'https://mrmahmd.github.io'
const corsHeaders = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json; charset=utf-8',
}

const response = (status: number, message: string) =>
  new Response(JSON.stringify({ message }), { status, headers: corsHeaders })

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  if (request.method !== 'POST') return response(405, 'الطلب غير مدعوم')

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return response(400, 'البيانات غير صالحة')
  }

  const username = typeof body.username === 'string' ? body.username.trim().toLowerCase() : ''
  const code = typeof body.code === 'string' ? body.code.trim().toUpperCase() : ''
  const password = typeof body.password === 'string' ? body.password : ''
  if (!/^quran\d{2}$/.test(username) || !/^[A-F0-9]{32}$/.test(code) || password.length < 12 || password.length > 128) {
    return response(400, 'تحقق من اسم المستخدم ورمز التفعيل وكلمة المرور (12 حرفًا على الأقل)')
  }

  const { data: account, error: lookupError } = await admin
    .from('teacher_accounts')
    .select('username, full_name, activation_hash, auth_user_id, active')
    .eq('username', username)
    .maybeSingle()
  if (lookupError) return response(503, 'تعذر التفعيل الآن، حاول لاحقًا')
  if (!account || !account.active || account.auth_user_id || account.activation_hash !== await sha256(code)) {
    return response(403, 'بيانات التفعيل غير صحيحة أو سبق استخدام الرمز')
  }

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: `${username}@quran-school.invalid`,
    password,
    email_confirm: true,
    user_metadata: { full_name: account.full_name },
    app_metadata: { role: 'teacher' },
  })
  if (createError || !created.user) return response(503, 'تعذر إنشاء الحساب الآن، راجع الإدارة')

  const { data: claimed, error: claimError } = await admin
    .from('teacher_accounts')
    .update({ auth_user_id: created.user.id, activated_at: new Date().toISOString() })
    .eq('username', username)
    .eq('activation_hash', await sha256(code))
    .is('auth_user_id', null)
    .select('username')
    .maybeSingle()
  if (claimError || !claimed) {
    await admin.auth.admin.deleteUser(created.user.id)
    return response(409, 'تعذر إتمام التفعيل، راجع الإدارة')
  }
  return response(200, 'تم تفعيل الحساب. يمكنك الدخول باسم المستخدم وكلمة المرور')
})
