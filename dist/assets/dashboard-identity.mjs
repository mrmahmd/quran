// Shared presentation for teachers, supervisors and administrators.
// This module never reads or changes report data or account permissions.
export function mountDashboardIdentity(root) {
  const content = root.querySelector('#dashboard-content');
  function enhance() {
    content.querySelectorAll('.section-heading > div').forEach(heading => {
      if (heading.querySelector('.teacher-help,.dashboard-help')) return;
      const paragraphs = [...heading.children].filter(node => node.tagName === 'P' && !node.classList.contains('section-kicker'));
      if (!paragraphs.length) return;
      const details = document.createElement('details');
      details.className = 'dashboard-help';
      const summary = document.createElement('summary');
      summary.textContent = 'طريقة الاستخدام';
      details.append(summary, ...paragraphs);
      heading.append(details);
    });
    content.querySelectorAll('.monthly-table-wrap').forEach(wrap => {
      wrap.setAttribute('tabindex', '0');
      wrap.setAttribute('role', 'region');
      wrap.setAttribute('aria-label', 'جدول التقرير · يمكن التمرير أفقيًا لعرض جميع الأعمدة');
    });
  }
  const observer = new MutationObserver(enhance);
  observer.observe(content, {subtree:true, childList:true});
  enhance();
  return {destroy() { observer.disconnect(); }};
}
