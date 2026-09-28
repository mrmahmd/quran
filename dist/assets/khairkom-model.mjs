const arabicNumber = value => new Intl.NumberFormat('ar-EG').format(value);

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
