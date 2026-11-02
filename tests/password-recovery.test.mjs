import test from 'node:test';
import assert from 'node:assert/strict';
import { requestRecovery, verifyRecovery, updateRecoveredPassword } from '../dist/assets/password-recovery.mjs';

test('recovery email uses the exact callback and rejects synthetic teacher addresses', async () => {
  const calls = [];
  const auth = { resetPasswordForEmail: async (...args) => { calls.push(args); return {}; } };
  await requestRecovery(auth, ' Admin@school.example ', 'https://school.example/password-reset.html');
  assert.deepEqual(calls, [['admin@school.example', { redirectTo: 'https://school.example/password-reset.html' }]]);
  for (const email of ['quran07', 'quran07@quran-school.invalid', 'bad']) {
    await assert.rejects(requestRecovery(auth, email, 'https://school.example'), /real_email_required/);
  }
  assert.equal(calls.length, 1);
});

test('a URL flag alone or an unrelated saved session cannot open password reset', async () => {
  const auth = { getSession: async () => ({ data: { session: null } }), getUser: () => assert.fail() };
  assert.equal(await verifyRecovery(auth, true), null);
  auth.getSession = async () => ({ data: { session: { user: { id: 'untrusted' } } } });
  assert.equal(await verifyRecovery(auth, false), null);
});

test('recovery verifies the user against Auth and propagates expired token errors', async () => {
  const user = { id: 'admin', email: 'admin@school.example' };
  const auth = { getSession: async () => ({ data: { session: {} } }), getUser: async () => ({ data: { user } }) };
  assert.equal(await verifyRecovery(auth, true), user);
  auth.getUser = async () => ({ error: new Error('expired') });
  await assert.rejects(verifyRecovery(auth, true), /expired/);
});

test('invalid confirmation and switched or expired sessions never update a password', async () => {
  const auth = { getUser: async () => ({ data: { user: { id: 'other' } } }), updateUser: () => assert.fail() };
  await assert.rejects(updateRecoveredPassword(auth, 'admin', 'short', 'short'), /password_short/);
  await assert.rejects(updateRecoveredPassword(auth, 'admin', 'example-only', 'different'), /password_mismatch/);
  await assert.rejects(updateRecoveredPassword(auth, 'admin', 'example-only', 'example-only'), /recovery_expired/);
  auth.getUser = async () => ({ error: new Error('expired') });
  await assert.rejects(updateRecoveredPassword(auth, 'admin', 'example-only', 'example-only'), /expired/);
});

test('reset updates only the verified existing user password and surfaces Auth failure', async () => {
  const calls = [];
  const auth = {
    getUser: async () => ({ data: { user: { id: 'admin' } } }),
    updateUser: async attrs => { calls.push(attrs); return { data: { user: { id: 'admin' } } }; },
  };
  await updateRecoveredPassword(auth, 'admin', 'example-only', 'example-only');
  assert.deepEqual(calls, [{ password: 'example-only' }]);
  auth.updateUser = async () => ({ error: new Error('same_password') });
  await assert.rejects(updateRecoveredPassword(auth, 'admin', 'example-only', 'example-only'), /same_password/);
});
