export async function restoreAccount(client, showAccount) {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  if (!data.session) return false;
  const verified = await client.auth.getUser();
  if (verified.error) throw verified.error;
  if (!verified.data.user) return false;
  await showAccount(verified.data.user);
  return true;
}
