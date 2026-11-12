import assert from 'node:assert/strict';
import test from 'node:test';
import { createDashboardRepository } from '../dist/assets/dashboard-repository.mjs';

const args = { p_teacher: 'teacher', p_term: 'term', p_month: '2026-10-01', p_version: 1, p_rows: [] };
const receipt = { id: 'second', teacher_username: 'teacher', term_id: 'term', month_start: '2026-10-01', version: 2 };

test('monthly read rejects a report from a different month before fetching its students', async () => {
  const query = {
    select: () => query,
    eq: () => query,
    then: accept => accept({ data: [{ ...receipt, month_start: '2026-09-01' }], error: null }),
  };
  const repo = createDashboardRepository({ from: table => {
    assert.equal(table, 'monthly_reports');
    return query;
  } });
  await assert.rejects(repo.monthly(args.p_teacher, args.p_term, args.p_month), /تعذّر مطابقة التقرير/);
});

test('monthly save accepts only a receipt scoped to the teacher, term, month and next version', async () => {
  const repo = data => createDashboardRepository({ rpc: async (method, payload) => {
    assert.equal(method, 'save_monthly_report');
    assert.deepEqual(payload, args);
    return { data, error: null };
  } });
  assert.equal(await repo(receipt).saveMonthly(args), receipt);
  for (const changes of [
    { month_start: '2026-09-01' }, { term_id: 'other' }, { teacher_username: 'other' }, { version: 1 },
  ]) {
    await assert.rejects(repo({ ...receipt, ...changes }).saveMonthly(args), /تعذّر تأكيد حفظ التقرير للشهر المختار/);
  }
});
