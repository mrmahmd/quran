const arabicNumber = value => new Intl.NumberFormat('ar-EG').format(value);

// The RPC commits the entire batch in one transaction and returns its saved set.
// Keep the acknowledged rows visible without reloading unrelated dashboard data.
export function applySavedNominations(data, saved, teacher, term, rows) {
  if (!saved?.id || saved.teacher_username !== teacher || saved.term_id !== term || !Number.isInteger(saved.version) || saved.version < 1) {
    throw new Error('لم يصل تأكيد واضح للحفظ. اضغط تحديث البيانات للتحقق قبل إعادة المحاولة.');
  }
  return {
    ...data,
    sets: [...data.sets.filter(s=>s.teacher_username!==teacher || data.rows.some(r=>r.external && r.set_id===s.id)), {...saved}],
    rows: [...data.rows.filter(r=>r.teacher_username!==teacher || r.external), ...rows.map(r=>({...r,test_parts:[...r.test_parts],set_id:saved.id,teacher_username:teacher,nominated:true}))],
  };
}

export function normalizeIdentityNumber(value) {
  return String(value ?? '')
    .replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[\s-]/g, '');
}

export function validIdentityNumber(value) {
  return /^[0-9]{6,20}$/.test(normalizeIdentityNumber(value));
}

export function validTestParts(parts) {
  return Array.isArray(parts) && parts.length > 0 && parts.length <= 30
    && parts.every(part => Number.isInteger(part) && part >= 1 && part <= 30)
    && new Set(parts).size === parts.length;
}

export function formatTestParts(parts) {
  if (!validTestParts(parts)) return 'لم تُحدَّد أجزاء الاختبار بعد';
  const ordered = [...parts].sort((a, b) => a - b);
  const ranges = [];
  for (const part of ordered) {
    const last = ranges.at(-1);
    if (last && part === last[1] + 1) last[1] = part;
    else ranges.push([part, part]);
  }
  return ranges.map(([start, end]) => start === end
    ? `الجزء ${arabicNumber(start)}`
    : `من الجزء ${arabicNumber(start)} إلى ${arabicNumber(end)}`).join('، ');
}

export function filterNominations(data, teachers, filters = {}) {
  const students = new Map((data.students || []).map(s => [s.id, s]));
  const owners = new Map(teachers.map(t => [t.username, t]));
  const parts = [...new Set((filters.parts || []).map(Number))].filter(p => Number.isInteger(p) && p >= 1 && p <= 30);
  return (data.rows || []).filter(row => {
    if (filters.teacher && row.teacher_username !== filters.teacher) return false;
    const className = students.get(row.student_id)?.source_class || owners.get(row.teacher_username)?.class_name || '';
    if (filters.className && className !== filters.className) return false;
    if (!parts.length) return true;
    const selected = row.test_parts || [];
    return filters.mode === 'any' ? parts.some(p => selected.includes(p)) : parts.every(p => selected.includes(p));
  }).sort((a,b) => (a.teacher_username || '').localeCompare(b.teacher_username || '') || (students.get(a.student_id)?.full_name || '').localeCompare(students.get(b.student_id)?.full_name || '', 'ar'));
}

export function nominationFilterLabel(filters, teachers) {
  const labels = [];
  if (filters.teacher) labels.push('المعلم: ' + (teachers.find(t=>t.username===filters.teacher)?.full_name || filters.teacher));
  if (filters.className) labels.push('الفصل: ' + filters.className);
  if (filters.parts?.length) labels.push((filters.mode === 'any' ? 'أي جزء من: ' : 'جميع الأجزاء معًا: ') + formatTestParts(filters.parts));
  return labels.length ? labels.join(' · ') : 'جميع المرشحين · دون فلترة';
}
