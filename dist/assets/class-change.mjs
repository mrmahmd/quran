// Notices for history recorded before a ring changed class (table class_changes).
// Saved work stays with the teacher who wrote it, so after a class swap the pages before the
// change show the previous class's students; these notices say so and point to the right history.

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const dateLabel = day => new Intl.DateTimeFormat('ar-EG', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));

// The latest change of a teacher's class, or null.
export function classChangeFor(changes, username) {
  return (changes || []).filter(change => change.teacher_username === username).sort((a, b) => b.changed_on.localeCompare(a.changed_on))[0] || null;
}

// A week (its Sunday) is before the change if it starts before the change day.
export const weekBeforeChange = (change, week) => !!change && !!week && week < change.changed_on;
// A monthly report is before the change only if its whole month is (November 2026 is the first month after 20 Nov).
export const monthBeforeChange = (change, month) => !!change && !!month && month < `${change.changed_on.slice(0, 7)}-01`;

// Months (first days) that fall before the change.
export const monthsBeforeChange = (change, months) => (months || []).filter(month => monthBeforeChange(change, month));

// period: 'week' | 'month' | 'months' (two compared months) | 'trend' (charts that span the change).
// admin: written about the teacher (administration, readers); otherwise to the teacher himself.
// canSwitch adds a button carrying switchAttr="<username>" that opens the saved history of the current class.
// print: a plain box with inline styles, for PDF documents.
export function classChangeBanner({ change, teacherName, admin = false, canSwitch = admin, switchAttr = 'data-switch-teacher', period = 'week', compact = false, print = false }) {
  if (!change) return '';
  const before = `<bdi>${escape(change.class_before)}</bdi>`, after = `<bdi>${escape(change.class_after)}</bdi>`;
  const nowWith = escape(change.students_now_with_name), historyName = escape(change.history_of_class_after_name);
  const when = dateLabel(change.changed_on);
  const periodText = { week: 'هذا الأسبوع', month: 'هذا الشهر', months: 'الشهران المعروضان', trend: 'الأسابيع السابقة' }[period] || 'هذه الفترة';
  const chips = `<span class="cc-chips"><span class="cc-chip before">قبل: ${before}</span><span class="cc-arrow" aria-hidden="true">←</span><span class="cc-chip after">بعد: ${after}</span></span>`;
  let title, body;
  if (compact) {
    title = `تغيّر فصل الحلقة في ${when}`;
    body = `الرسوم ومتوسطات الأسابيع قبل هذا التاريخ تخص طلاب الفصل السابق ${before}${admin && historyName ? `؛ وسجل طلاب ${after} قبل التبديل محفوظ باسم الأستاذ ${historyName}` : ''}.`;
  } else if (admin) {
    title = `تنبيه: بيانات ما قبل تبديل الفصول (${when})`;
    body = `في ${periodText} كان الأستاذ ${escape(teacherName)} يدرّس الفصل ${before}؛ فالتقييمات والتقارير هنا <b>لطلاب ${before}</b>، وقد انتقلوا إلى الأستاذ ${nowWith}. أما السجل السابق لطلاب ${after} الحاليين فمحفوظ باسم الأستاذ <b>${historyName}</b>.`;
  } else {
    title = `تنبيه: ${periodText} قبل تبديل الفصول (${when})`;
    body = `البيانات هنا <b>لطلاب فصلك السابق ${before}</b>، وقد انتقلوا إلى الأستاذ ${nowWith}. طلاب فصلك الحالي ${after} يبدأ سجلهم معك بعد التبديل.`;
  }
  if (print) return `<aside class="cc-print" style="margin:0 0 12px;padding:10px 14px;border:1.5px solid #e0a526;border-inline-start:6px solid #6250d6;border-radius:12px;background:#fff8e6;color:#3a2a00;font-size:12.5px;line-height:1.7">
    <strong style="display:block;color:#4b3aa8">⇆ ${title}</strong>${body}</aside>`;
  const action = canSwitch && change.history_of_class_after && !compact
    ? `<button type="button" class="cc-button" ${switchAttr}="${escape(change.history_of_class_after)}">عرض السجل السابق لفصل ${after} ←</button>` : '';
  return `<aside class="cc-banner${compact ? ' compact' : ''}" role="note"><span class="cc-icon" aria-hidden="true">⇆</span>
    <div class="cc-text"><div class="cc-title"><strong>${title}</strong>${compact ? '' : chips}</div><p>${body}</p></div>${action}</aside>`;
}

// School-wide pages (all teachers): one line naming every ring whose class changed after the first shown month.
export function classChangeSchoolNote(changes, teacherNames, months) {
  const first = (months || [])[0];
  const rows = (changes || []).filter(change => first && monthBeforeChange(change, first));
  if (!rows.length) return '';
  const items = rows.map(change => `<li><b>${escape(teacherNames.get(change.teacher_username)?.full_name || change.teacher_username)}</b>: أرقامه في هذه الفترة لطلاب <bdi>${escape(change.class_before)}</bdi> (فصله الآن <bdi>${escape(change.class_after)}</bdi>)</li>`).join('');
  return `<aside class="cc-banner compact" role="note"><span class="cc-icon" aria-hidden="true">⇆</span><div class="cc-text"><div class="cc-title"><strong>تنبيه: تبديل فصول في ${dateLabel(rows[0].changed_on)}</strong></div><ul class="cc-list">${items}</ul></div></aside>`;
}
