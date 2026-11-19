// Arabic-Indic digits in the dashboard text, applied after each render (one place for every page).
// Latin identifiers keep their digits: usernames (quran09), class names (5/A), emails, dates written
// with dashes, anything inside dir="ltr", form fields and code.
const DIGITS = '٠١٢٣٤٥٦٧٨٩';
const NUMBER = /(^|[^A-Za-z0-9_@./\-])(\d+(?:\.\d+)?)(%?)(?![A-Za-z0-9_@/\-])/g;
const SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE', 'PRE', 'KBD']);

export function toArabicDigits(text) {
  return text.replace(NUMBER, (match, before, number, sign) =>
    before + number.replace(/\d/g, digit => DIGITS[digit]).replace('.', '٫') + (sign ? '٪' : ''));
}

function skipped(node) {
  for (let element = node.parentElement; element; element = element.parentElement) {
    if (SKIP.has(element.tagName) || element.getAttribute('dir') === 'ltr' || element.hasAttribute('data-latin-digits')) return true;
  }
  return false;
}

function convert(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    if (!/\d/.test(node.data) || skipped(node)) return;
    const next = toArabicDigits(node.data);
    if (next !== node.data) node.data = next;
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = walker.nextNode(); text; text = walker.nextNode()) convert(text);
}

// Converts now and after every change below root. Returns a function that stops observing.
export function arabicDigits(root) {
  convert(root);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') convert(record.target);
      else record.addedNodes.forEach(convert);
    }
  });
  observer.observe(root, { childList: true, subtree: true, characterData: true });
  return () => observer.disconnect();
}
