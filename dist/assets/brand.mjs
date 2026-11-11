export const platformName = 'يسرناه';
export const schoolName = 'مدارس الأندلس الأهلية';
export const schoolBranch = 'المسار المصري · فرع الحمدانية';

export function brandLockup() {
  return `<span class="brand-marks"><img class="brand-platform-logo" src="assets/yassarnahu-1448.png" alt="شعار يسرناه 1448"><img class="brand-school-logo" src="assets/alandalus-logo.png" alt="شعار ${schoolName}"></span><span class="brand-copy"><strong>${schoolName}</strong><small>${schoolBranch}</small></span>`;
}
