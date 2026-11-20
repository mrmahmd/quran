// Display order of the rings: by class (1A, 1B, 2A … 10B), then accounts without a class
// (such as «إجازة»), then by teacher name. Accepts 1A, 1/A, 1 a.
const CLASS = /^(\d{1,2})\s*\/?\s*([A-Za-z])$/;

export function classKey(className) {
  const match = CLASS.exec(String(className ?? '').trim());
  return match ? [Number(match[1]), match[2].toUpperCase()] : [Infinity, ''];
}

export function compareByClass(a, b) {
  const [gradeA, sectionA] = classKey(a?.class_name), [gradeB, sectionB] = classKey(b?.class_name);
  if (gradeA !== gradeB) return gradeA < gradeB ? -1 : 1;
  return sectionA.localeCompare(sectionB) || String(a?.full_name ?? '').localeCompare(String(b?.full_name ?? ''), 'ar');
}

export const sortByClass = list => [...(list || [])].sort(compareByClass);
