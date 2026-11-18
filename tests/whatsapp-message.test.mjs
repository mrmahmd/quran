import test from 'node:test';
import assert from 'node:assert/strict';
import { whatsappNumber, whatsappLink, teacherReminderText } from '../dist/assets/whatsapp-message.mjs';

test('Saudi mobile numbers become the international wa.me form', () => {
  assert.equal(whatsappNumber('0512345678'), '966512345678');
  assert.equal(whatsappNumber('٠٥١٢٣٤٥٦٧٨'), '966512345678');
  assert.equal(whatsappNumber('051 234 5678'), '966512345678');
  assert.equal(whatsappNumber('966512345678'), '966512345678');
  for (const bad of ['', null, '12345', '0632958016', '05123456781']) assert.equal(whatsappNumber(bad), '');
});

test('the link carries the edited message, encoded', () => {
  const link = whatsappLink('0512345678', '  السلام عليكم\nأستاذ جمال & ? #  ');
  assert.equal(link, `https://wa.me/966512345678?text=${encodeURIComponent('السلام عليكم\nأستاذ جمال & ? #')}`);
  assert.throws(() => whatsappLink('123', 'x'), /رقم هاتف/);
  assert.throws(() => whatsappLink('0512345678', '   '), /نص الرسالة/);
});

test('the suggested message follows the report status', () => {
  const base = { name: 'جمال عبد الرحيم', ring: '5/A', monthLabel: 'الشهر الأول' };
  assert.match(teacherReminderText({ ...base, status: 'missing' }), /نذكّركم بإعداد التقرير الشهري \(الشهر الأول\) لحلقة 5\/A/);
  assert.match(teacherReminderText({ ...base, status: 'draft', completed: 12, total: 30 }), /اكتمل 12 من 30 طالبًا/);
  assert.match(teacherReminderText({ ...base, status: 'complete' }), /جزاكم الله خيرًا على إكمال/);
  assert.match(teacherReminderText({ ...base, status: 'missing' }), /^السلام عليكم[\s\S]*أستاذ جمال عبد الرحيم[\s\S]*إدارة مدارس الأندلس الأهلية$/);
});
