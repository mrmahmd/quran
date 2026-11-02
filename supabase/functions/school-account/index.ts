import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.117.1'
import { schoolAccountHandler } from './handler.mjs'

const url = Deno.env.get('SUPABASE_URL')!
const options = { auth: { autoRefreshToken: false, persistSession: false } }
const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, options)
Deno.serve(schoolAccountHandler({
  admin,
  passwordClient: () => createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, options),
}))
