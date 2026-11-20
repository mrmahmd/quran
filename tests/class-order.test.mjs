import test from 'node:test';
import assert from 'node:assert/strict';
import { sortByClass } from '../dist/assets/class-order.mjs';

test('rings are listed by class, then accounts without a class, then by name', () => {
  const teachers = [['quran09', '7B'], ['quran17', 'إجازة'], ['quran16', '10A'], ['quran12', '1B'], ['quran01', '1A'], ['quran03', '6B'], ['quran18', '10B'], ['quran08', '2/A'], ['quran19', '9b']]
    .map(([username, class_name]) => ({ username, class_name, full_name: username }));
  assert.deepEqual(sortByClass(teachers).map(t => t.class_name), ['1A', '1B', '2/A', '6B', '7B', '9b', '10A', '10B', 'إجازة']);
  assert.deepEqual(sortByClass([{ class_name: '', full_name: 'ب' }, { class_name: '', full_name: 'أ' }]).map(t => t.full_name), ['أ', 'ب']);
  assert.deepEqual(sortByClass(null), []);
});
