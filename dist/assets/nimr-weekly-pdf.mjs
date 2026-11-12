import { narrativeBlock, narrativePage, parseNarrative } from './nimr-weekly-model.mjs?v=1';
import { createA4ReportPdf } from './khairkom-teachers-report.mjs?v=nimr-weekly1';

export async function prepareNarrativePdf(details, value) {
  await Promise.all([400,600,800].map(weight => document.fonts.load(weight+' 24px Alexandria','التقرير الأسبوعي')));
  const blocks = parseNarrative(value);
  if (!blocks.length) throw new Error('اكتب نص التقرير أولًا.');

  const host=document.createElement('div');
  host.className='nominee-export-host';
  const pages=document.createElement('div');
  pages.className='narrative-pages';
  host.append(pages);
  document.body.append(host);
  try {
    const addPage = () => {
      pages.insertAdjacentHTML('beforeend',narrativePage(details));
      return pages.lastElementChild.querySelector('.narrative-paper-body');
    };
    let body=addPage();
    const overflows=()=>body.scrollHeight>body.clientHeight;

    for (const block of blocks) {
      let offset=0;
      while (offset<block.tokens.length) {
        body.insertAdjacentHTML('beforeend',narrativeBlock(block,block.tokens.slice(offset),offset>0));
        if (!overflows()) break;
        const blockHeight=body.lastElementChild.getBoundingClientRect().height;
        body.lastElementChild.remove();
        if (body.childElementCount && !offset && blockHeight+20<body.clientHeight) body=addPage();
        let low=1, high=block.tokens.length-offset, count=0;
        while (low<=high) {
          const middle=Math.floor((low+high)/2);
          body.insertAdjacentHTML('beforeend',narrativeBlock(block,block.tokens.slice(offset,offset+middle),offset>0));
          const fits=!overflows();
          body.lastElementChild.remove();
          if (fits) { count=middle; low=middle+1; } else high=middle-1;
        }
        if (!count) {
          if (!body.childElementCount) throw new Error('تعذر تنسيق سطر طويل في التقرير. قسّمه على أكثر من سطر.');
          body=addPage();
          continue;
        }
        body.insertAdjacentHTML('beforeend',narrativeBlock(block,block.tokens.slice(offset,offset+count),offset>0));
        offset+=count;
        if (offset<block.tokens.length) body=addPage();
      }
    }
    const arabic=new Intl.NumberFormat('ar-EG');
    [...pages.children].forEach((page,index)=>{
      page.querySelector('[data-narrative-page]').textContent='صفحة '+arabic.format(index+1)+' من '+arabic.format(pages.children.length);
    });
    const blob=await createA4ReportPdf(pages,'التقرير الأسبوعي · يسرناه');
    return {pages,blob};
  } finally {host.remove();}
}
