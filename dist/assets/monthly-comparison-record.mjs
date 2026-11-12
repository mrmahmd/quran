import { monthlyProblem } from './monthly-model.mjs?v=monthly-save2';

export function hasSavedMonthlyAmounts(entry) {
  return !!entry && entry.is_complete !== false && !entry.memorization?.absent
    && !entry.revision?.absent && !monthlyProblem(entry);
}
