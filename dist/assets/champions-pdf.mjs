const library = (file, ready) => {
  if (ready()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL(`./vendor/${file}`, import.meta.url).href;
    script.onload = () => ready() ? resolve() : reject(new Error('تعذر تجهيز تحميل التقرير.'));
    script.onerror = () => { script.remove(); reject(new Error('تعذر تحميل أدوات PDF. تحقق من الاتصال وحاول مجددًا.')); };
    document.head.append(script);
  });
};

export function pagePlacement(width, height) {
  // A3 landscape: leave an 8mm safe margin, fit the entire report once.
  const ratio = Math.min(404 / width, 281 / height);
  return { width: width * ratio, height: height * ratio, x: (420 - width * ratio) / 2, y: (297 - height * ratio) / 2 };
}

export async function downloadChampionsPdf(source) {
  await Promise.all([
    library('html2canvas-1.4.1.min.js', () => !!window.html2canvas),
    library('jspdf-4.2.1.umd.min.js', () => !!window.jspdf?.jsPDF),
    document.fonts.ready,
  ]);
  const host = document.createElement('div');
  host.className = 'champions-export-host';
  const report = source.cloneNode(true);
  report.classList.add('champions-pdf-sheet');
  host.append(report); document.body.append(host);
  try {
    await Promise.all([...report.querySelectorAll('img')].map(img => img.decode()));
    const width = 1180, height = Math.ceil(report.getBoundingClientRect().height);
    // Keep below 3 megapixels on older iPhones; never use the phone's devicePixelRatio.
    const scale = Math.min(1.6, Math.sqrt(2800000 / (width * height)));
    const canvas = await window.html2canvas(report, { scale, width, height, windowWidth: 1280, windowHeight: height, scrollX: 0, scrollY: 0, backgroundColor: '#ffffff', logging: false });
    const pdf = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a3', compress: true });
    const box = pagePlacement(canvas.width, canvas.height);
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.96), 'JPEG', box.x, box.y, box.width, box.height);
    pdf.setProperties({title:'فرسان الأسبوع - المدرسة القرآنية',author:'مدارس الأندلس الأهلية'});
    const name = `فرسان-الأسبوع-${new Date().toISOString().slice(0,10)}.pdf`;
    await pdf.save(name, { returnPromise: true });
    canvas.width = canvas.height = 0;
  } finally { host.remove(); }
}
