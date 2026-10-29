// Keep the existing administrator RPC as the sole authority for each decision.
export async function reviewRosterRequests(requests, approve, decide, onProgress = () => {}) {
  if (typeof approve !== 'boolean') throw new TypeError('A decision is required');
  const pending = [...new Map(requests.filter(row => row.status === 'pending').map(row => [row.id, row])).values()];
  const result = { succeeded: [], failed: [], remaining: [], uncertain: false };
  for (let index = 0; index < pending.length; index++) {
    const request = pending[index];
    try {
      const saved = await decide(request.id, approve, request.note || '');
      if (saved?.id !== request.id || saved.status !== (approve ? 'approved' : 'rejected')) {
        throw new Error('تعذر تأكيد حفظ القرار. حدّث القائمة قبل إعادة المحاولة.');
      }
      result.succeeded.push(request.id);
    } catch (error) {
      result.failed.push({ id: request.id, name: request.student_name, error });
      // Data conflicts affect one request. Unknown outcomes or lost permissions
      // stop the batch so the administrator can refresh before retrying.
      if (!['23514', '23505', '40001', 'P0001'].includes(error?.code)) {
        result.uncertain = true;
        result.remaining = pending.slice(index + 1).map(row => row.id);
        onProgress(index + 1, pending.length);
        break;
      }
    }
    onProgress(index + 1, pending.length);
  }
  return result;
}
