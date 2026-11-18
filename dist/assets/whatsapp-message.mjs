// WhatsApp messages from the administration to a teacher (monthly report progress).
// Saudi mobile numbers are stored as 05XXXXXXXX; wa.me needs the international form 9665XXXXXXXX.
export function whatsappNumber(phone) {
  const digits = String(phone ?? '').replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x0660)).replace(/\D/g, '');
  if (/^05\d{8}$/.test(digits)) return `966${digits.slice(1)}`;
  if (/^9665\d{8}$/.test(digits)) return digits;
  return '';
}

export function whatsappLink(phone, text) {
  const number = whatsappNumber(phone);
  if (!number) throw new Error('رقم هاتف المعلم غير صالح.');
  if (!String(text ?? '').trim()) throw new Error('اكتب نص الرسالة أولًا.');
  if (String(text).includes(notePlaceholder)) throw new Error('اكتب ملاحظتك مكان «[اكتب ملاحظتك هنا]» قبل الإرسال.');
  return `https://wa.me/${number}?text=${encodeURIComponent(String(text).trim())}`;
}

// Opened from the monthly comparison page; the administration writes its note in the marked line.
export const notePlaceholder = '[اكتب ملاحظتك هنا]';
export function teacherComparisonText({ name, ring, months = [] }) {
  const where = ring ? ` لحلقة ${ring}` : '';
  const period = months.length ? ` (${months.join(' و')})` : '';
  return `السلام عليكم ورحمة الله وبركاته\nأستاذ ${name} حفظكم الله،\nبخصوص مقارنة الحفظ والمراجعة${period}${where} على منصة يسرناه:\n${notePlaceholder}\nإدارة مدارس الأندلس الأهلية`;
}

export function teacherReminderText({ name, ring, monthLabel, status, completed = 0, total = 0 }) {
  const greeting = `السلام عليكم ورحمة الله وبركاته\nأستاذ ${name} حفظكم الله،`;
  const where = ring ? ` لحلقة ${ring}` : '';
  const body = status === 'complete'
    ? `جزاكم الله خيرًا على إكمال التقرير الشهري (${monthLabel})${where} على منصة يسرناه، بارك الله في جهودكم.`
    : status === 'draft'
      ? `التقرير الشهري (${monthLabel})${where} محفوظ جزئيًا: اكتمل ${completed} من ${total} طالبًا.\nنرجو استكمال بيانات بقية الطلاب وحفظها على منصة يسرناه في أقرب وقت.`
      : `نذكّركم بإعداد التقرير الشهري (${monthLabel})${where} وحفظه على منصة يسرناه في أقرب وقت.`;
  return `${greeting}\n${body}\nإدارة مدارس الأندلس الأهلية`;
}
