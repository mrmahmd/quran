// Presentation only: no evaluation or monthly report state is changed here.
export function mountTeacherAppearance(root, repository) {
  const shell=root.querySelector('.dashboard-shell'),content=root.querySelector('#dashboard-content');
  shell.classList.add('teacher-dashboard');
  shell.dataset.textSize='normal';
  const panel=document.createElement('section');
  panel.className='teacher-appearance';
  panel.setAttribute('aria-label','وضوح الخط');
  panel.innerHTML='<div><strong>لوحتك.. أوضح وأسهل</strong><span>حجم الخط محفوظ على حسابك في جميع أجهزتك</span></div><div class="teacher-text-options" role="group" aria-label="حجم الخط"><button type="button" data-text-size="normal" aria-pressed="true">عادي</button><button type="button" data-text-size="large" aria-pressed="false">كبير</button><button type="button" data-text-size="xlarge" aria-pressed="false">أكبر</button></div><p class="teacher-preference-state" role="status">جارٍ تحميل اختيارك…</p>';
  shell.querySelector('.welcome-banner').after(panel);
  const buttons=[...panel.querySelectorAll('[data-text-size]')],message=panel.querySelector('[role="status"]');
  let size='normal',saving=false,disposed=false;
  const apply=value=>{
    size=['normal','large','xlarge'].includes(value)?value:'normal';
    shell.dataset.textSize=size;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.textSize===size)));
  };
  buttons.forEach(button=>button.disabled=true);
  const ready=repository.teacherAppearance().then(row=>{
    if(disposed)return;apply(row?.text_size);message.textContent='يمكنك تغيير الحجم في أي وقت.';
  }).catch(()=>{if(!disposed)message.textContent='تعذر تحميل اختيارك. يمكنك اختيار الحجم ومحاولة حفظه.';})
  .finally(()=>{if(!disposed)buttons.forEach(button=>button.disabled=false);});
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-text-size]');if(!button||saving||button.disabled)return;
    const next=button.dataset.textSize,previous=size;if(next===size)return;
    saving=true;buttons.forEach(b=>b.disabled=true);apply(next);message.textContent='جارٍ حفظ حجم الخط في حسابك…';
    try{
      const saved=await repository.saveTeacherAppearance(next);
      if(saved?.text_size!==next)throw new Error('Missing save acknowledgment');
      if(!disposed)message.textContent='✓ تم الحفظ على حسابك — يُطبّق عند دخولك من أي جهاز.';
    }catch{
      if(!disposed){apply(previous);message.textContent='لم يُحفظ الاختيار. تحقق من الاتصال وحاول مرة أخرى.';}
    }finally{saving=false;if(!disposed)buttons.forEach(b=>b.disabled=false);}
  });
  const enhance=()=>{
    if(disposed)return;
    // Keep the task title visible and put only its explanatory paragraph in Help.
    content.querySelectorAll('.section-heading>div').forEach(heading=>{
      if(heading.querySelector('.teacher-help'))return;
      const paragraphs=[...heading.children].filter(el=>el.tagName==='P'&&!el.classList.contains('section-kicker'));
      if(!paragraphs.length)return;
      const details=document.createElement('details');details.className='teacher-help';
      const summary=document.createElement('summary');summary.textContent='طريقة الاستخدام';details.append(summary,...paragraphs);heading.append(details);
    });
    content.querySelectorAll('.student-score-card').forEach(card=>{
      const groups=[...card.querySelectorAll('.score-group [role="group"]')];
      const filled=groups.filter(group=>group.querySelector('[aria-pressed="true"]')).length;
      const state=filled===groups.length?'ready':filled?'partial':'pending';
      let badge=card.querySelector('.teacher-score-status');
      if(!badge){badge=document.createElement('span');badge.className='teacher-score-status';card.querySelector('header>div').append(badge);}
      const label=state==='ready'?'✓ اكتمل إدخال النقاط':state==='partial'?'◷ تقييم غير مكتمل':'○ لم يبدأ التقييم';
      if(badge.textContent!==label)badge.textContent=label;
      if(card.dataset.entryState!==state)card.dataset.entryState=state;
    });
  };
  const observer=new MutationObserver(enhance);
  observer.observe(content,{subtree:true,childList:true,attributes:true,attributeFilter:['aria-pressed']});enhance();
  return {ready,destroy(){disposed=true;observer.disconnect();}};
}
