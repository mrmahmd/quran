import { brandLockup, platformName } from './brand.mjs';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,
  character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[character]);
const number = value => new Intl.NumberFormat('ar-EG').format(value);
export const narrativeDate = date => new Intl.DateTimeFormat('ar-EG', {
  dateStyle:'long', timeZone:'UTC', calendar:'gregory'
}).format(new Date(date+'T00:00:00Z'));

const marker = /^(?:#{1,2}\s+|[-•]\s+|[0-9٠-٩۰-۹]+\s*[.)]\s+)/u;
const ordered = /^[0-9٠-٩۰-۹]+\s*[.)]\s*/u;

export function formatSelection(value, start, end, mode) {
  if (mode === 'bold') {
    const selected = value.slice(start,end) || 'نص عريض';
    if (!selected.includes('\n') && value.slice(start-2,start)==='**' && value.slice(end,end+2)==='**') {
      return {from:start-2,to:end+2,text:selected,selectFrom:start-2,selectTo:end-2};
    }
    const startsAtLine = start===0 || value[start-1]==='\n';
    const text=selected.split('\n').map((line,index)=>{
      const prefix = index || startsAtLine ? line.match(marker)?.[0] || '' : '';
      const remainder=line.slice(prefix.length);
      return remainder.trim() ? prefix+'**'+remainder+'**' : line;
    }).join('\n');
    if (!selected.includes('\n') && text!==selected) {
      const prefixLength=startsAtLine ? selected.match(marker)?.[0].length || 0 : 0;
      return {from:start,to:end,text,selectFrom:start+prefixLength+2,selectTo:start+text.length-2};
    }
    return {from:start,to:end,text,selectFrom:start,selectTo:start+text.length};
  }
  const from = start ? value.lastIndexOf('\n',start-1)+1 : 0;
  const nextBreak = value.indexOf('\n',Math.max(start,end-1));
  const to = nextBreak<0 ? value.length : nextBreak;
  const lineTemplate = {heading:'عنوان',bullet:'بند',numbered:'بند'};
  const prefixes = {heading:()=> '## ',bullet:()=> '- ',numbered:i=> (i+1)+'. ',paragraph:()=> ''};
  const sourceLines = value.slice(from,to).split('\n');
  const lines = sourceLines.map((line,index) => prefixes[mode](index)+
    (line.trim().replace(marker,'') || lineTemplate[mode] || ''));
  const text=lines.join('\n');
  const insertion = sourceLines.length===1 && !sourceLines[0].trim() && mode!=='paragraph';
  return {from,to,text,selectFrom:insertion ? from+prefixes[mode](0).length : from,selectTo:from+text.length};
}

export function parseNarrative(body) {
  let listIndex=0;
  return body.split(/\r?\n/u).flatMap(line => {
    const text=line.trim();
    if (!text) { listIndex=0; return []; }
    const isNumbered=ordered.test(text);
    listIndex=isNumbered ? listIndex+1 : 0;
    const kind=isNumbered?'numbered':/^#{1,2}\s/u.test(text)?'heading':/^[-•]\s/u.test(text)?'bullet':'paragraph';
    const tokens=text.replace(marker,'').split(/(\*\*[^*\n]+\*\*)/u).flatMap(segment => {
      const bold=segment.startsWith('**')&&segment.endsWith('**')&&segment.length>4;
      return (bold?segment.slice(2,-2):segment).split(/(\s+)/u).filter(Boolean).map(value=>({value,bold}));
    });
    return tokens.length?[{kind,index:listIndex,tokens}]:[];
  });
}

export function narrativeBlock(block, tokens=block.tokens, continued=false) {
  const content=tokens.map(({value,bold})=>bold?'<strong>'+escapeHtml(value)+'</strong>':escapeHtml(value)).join('');
  if(block.kind==='heading' && !continued) return '<h2>'+content+'</h2>';
  if ((block.kind==='bullet'||block.kind==='numbered') && !continued) {
    const orderedList = block.kind==='numbered';
    const markerText = orderedList ? number(block.index)+'.' : '•';
    const listItem = '<li><b class="narrative-marker" dir="ltr" aria-hidden="true">'+markerText+'</b><span>'+content+'</span></li>';
    return orderedList ? '<ol start="'+block.index+'">'+listItem+'</ol>' : '<ul>'+listItem+'</ul>';
  }
  return '<p'+(continued?' class="narrative-continuation"':'')+'>'+content+'</p>';
}

export function narrativePage({term,week,end,weekNumber,author}) {
  return `<article class="narrative-sheet" dir="rtl">
    <header class="narrative-paper-header">
      <div class="narrative-paper-brand">${brandLockup()}</div>
      <div><h1>التقرير الأسبوعي</h1><p>إعداد المعلم ${escapeHtml(author)}</p></div>
    </header>
    <table class="narrative-paper-dates" aria-label="الأسبوع والتاريخ">
      <thead><tr><th scope="col">الأسبوع</th><th scope="col">من</th><th scope="col">إلى</th></tr></thead>
      <tbody><tr><td>${number(weekNumber)}</td><td>${narrativeDate(week)}</td><td>${narrativeDate(end)}</td></tr></tbody>
    </table>
    <div class="narrative-paper-body"></div>
    <footer class="narrative-paper-footer"><span>${platformName} · ${escapeHtml(term.name)}</span><b data-narrative-page></b></footer>
  </article>`;
}
