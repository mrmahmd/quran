const tabs = document.querySelectorAll('.role-tab');
const form = document.querySelector('#login-form');
const password = document.querySelector('#password');
const passwordButton = document.querySelector('.show-password');
const toast = document.querySelector('#toast');
let selectedRole = 'معلم';
let toastTimer;

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((item) => {
      item.classList.remove('active');
      item.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    selectedRole = tab.dataset.role;
  });
});

passwordButton.addEventListener('click', () => {
  const reveal = password.type === 'password';
  password.type = reveal ? 'text' : 'password';
  passwordButton.setAttribute('aria-label', reveal ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور');
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  toast.textContent = `واجهة تسجيل دخول ${selectedRole} جاهزة — سيتم ربط الحسابات في المرحلة التالية`;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
});

document.querySelector('#year').textContent = new Date().getFullYear();
