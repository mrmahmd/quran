export async function requestRecovery(auth, email, redirectTo) {
  email = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email) || email.endsWith('.invalid')) {
    throw new Error('real_email_required');
  }
  const { error } = await auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function verifyRecovery(auth, isRecoveryLink) {
  // Wait for the SDK to validate the URL session before clearing its fragment.
  const { data, error } = await auth.getSession();
  if (error) throw error;
  if (!isRecoveryLink || !data.session) return null;
  const verified = await auth.getUser();
  if (verified.error) throw verified.error;
  if (!verified.data.user) throw new Error('recovery_expired');
  return verified.data.user;
}

export async function updateRecoveredPassword(auth, expectedUserId, password, confirmation) {
  if (password.length < 6) throw new Error('password_short');
  if (password !== confirmation) throw new Error('password_mismatch');
  const verified = await auth.getUser();
  if (verified.error) throw verified.error;
  if (!expectedUserId || verified.data.user?.id !== expectedUserId) throw new Error('recovery_expired');
  const { data, error } = await auth.updateUser({ password });
  if (error) throw error;
  if (data.user?.id !== expectedUserId) throw new Error('recovery_expired');
}
