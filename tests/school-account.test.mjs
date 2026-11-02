import test from 'node:test';
import assert from 'node:assert/strict';
import { schoolAccountHandler } from '../supabase/functions/school-account/handler.mjs';
import { schoolAccountRequest } from '../dist/assets/school-account.mjs';

const input = extra => ({ action: 'recover', username: 'quran99', code: '123456', password: 'example-only', ...extra });
const request = body => new Request('https://school.example', { method: 'POST', headers: { Origin: 'https://mrmahmd.github.io' }, body: JSON.stringify(body) });
const fixture = (check = { account_id: 'existing-account', result: 'ok' }) => {
  const calls = [];
  const admin = {
    rpc: async (name, args) => { calls.push(['verify', name, args]); return { data: [check] }; },
    auth: { admin: { updateUserById: async (id, attrs) => { calls.push(['update', id, attrs]); return { data: { user: { id } } }; } } },
  };
  return { calls, admin, handler: schoolAccountHandler({ admin, passwordClient: () => assert.fail() }) };
};

test('a correct school code changes only the verified existing user password', async () => {
  const { calls, handler } = fixture();
  const response = await handler(request(input({ code: '١٢٣٤٥٦', username: ' QURAN99 ' })));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { recovered: true, message: 'تم حفظ كلمة المرور الجديدة' });
  assert.equal(calls[0][1], 'verify_school_recovery');
  assert.equal(calls[0][2].p_username, 'quran99');
  assert.match(calls[0][2].p_code_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(calls[0][2].p_code_hash, '123456');
  assert.deepEqual(calls[1], ['update', 'existing-account', { password: 'example-only' }]);
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('invalid, locked and missing account checks never invoke Auth updates', async () => {
  for (const check of [{ result: 'invalid' }, { result: 'locked' }, { result: 'ok' }, { account_id: 'other', result: 'invalid' }]) {
    const { calls, handler } = fixture(check);
    assert.equal((await handler(request(input()))).status, 403);
    assert.equal(calls.length, 1);
  }
});

test('malformed recovery input, unsupported action and foreign origins never verify or update', async () => {
  const { calls, handler } = fixture();
  for (const extra of [{ username: 'email@example.com' }, { username: '../admin' }, { code: '123' }, { password: 'short' }, { password: 'x'.repeat(129) }, { action: 'delete' }]) {
    assert.equal((await handler(request(input(extra)))).status, 400);
  }
  assert.equal((await handler(new Request('https://school.example', { method: 'POST', headers: { Origin: 'https://other.example' }, body: JSON.stringify(input()) }))).status, 403);
  assert.equal((await handler(new Request('https://school.example', { method: 'POST', body: 'null' }))).status, 400);
  assert.equal((await handler(new Request('https://school.example', { method: 'POST', body: 'x'.repeat(4097) }))).status, 413);
  assert.deepEqual(calls, []);
});

test('an Auth failure or mismatched receipt never reports a successful password reset', async () => {
  for (const result of [{ error: { code: 'same_password' } }, { error: { code: 'unexpected' } }, { data: { user: { id: 'other' } } }]) {
    const { admin } = fixture();
    admin.auth.admin.updateUserById = async () => result;
    const response = await schoolAccountHandler({ admin })(request(input()));
    assert.notEqual(response.status, 200);
    assert.equal((await response.json()).recovered, undefined);
  }
});

test('admin username login resolves an unambiguous active existing account and returns only its session', async () => {
  const account = { email: 'school-admin@example.com', auth_user_id: 'admin-id', active: true };
  const calls = [];
  const admin = { from: () => ({ select: async () => ({ data: [account] }) }) };
  const passwordClient = () => ({ auth: { signInWithPassword: async attrs => {
    calls.push(attrs); return { data: { user: { id: 'admin-id' }, session: { access_token: 'access', refresh_token: 'refresh' } } };
  } } });
  const response = await schoolAccountHandler({ admin, passwordClient })(request(input({ action: 'login', username: 'school-admin' })));
  assert.equal(response.status, 200);
  assert.deepEqual(calls, [{ email: account.email, password: 'example-only' }]);
  assert.deepEqual(await response.json(), { access_token: 'access', refresh_token: 'refresh' });
});

test('inactive, missing and ambiguous admin aliases cannot sign in through the proxy', async () => {
  const base = { email: 'school-admin@example.com', auth_user_id: 'admin-id', active: true };
  for (const rows of [[], [{ ...base, active: false }], [{ ...base, auth_user_id: null }], [base, { ...base, email: 'school-admin@other.example' }]]) {
    const admin = { from: () => ({ select: async () => ({ data: rows }) }) };
    const handler = schoolAccountHandler({ admin, passwordClient: () => assert.fail() });
    assert.equal((await handler(request(input({ action: 'login', username: 'school-admin' })))).status, 403);
  }
});

test('the frontend sends only the supplied action and never retries uncertain reset requests', async () => {
  const config = { supabaseUrl: 'https://school.example', supabasePublishableKey: 'public-key' };
  let calls = 0;
  await schoolAccountRequest(config, input(), async (url, options) => {
    calls++; assert.equal(url, 'https://school.example/functions/v1/school-account');
    assert.deepEqual(JSON.parse(options.body), input());
    return new Response(JSON.stringify({ recovered: true }));
  });
  assert.equal(calls, 1);
  await assert.rejects(schoolAccountRequest(config, input(), async () => { calls++; throw new Error('network'); }));
  assert.equal(calls, 2);
  await assert.rejects(schoolAccountRequest(config, input(), async () => new Response('{}')));
  await assert.rejects(schoolAccountRequest(config, input(), async () => new Response('{')));
});
