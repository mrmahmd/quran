// Presentation only: no evaluation or monthly report state is changed here.
export function mountTeacherAppearance(root, repository) {
  const shell=root.querySelector('.dashboard-shell'),content=root.querySelector('#dashboard-content');
  shell.classList.add('teacher-dashboard');
  shell.dataset.textSize='large';
  const panel=document.createElement('section');
  panel.className='teacher-appearance';
  panel.dataset.preferenceState='loading';
  panel.setAttribute('aria-label','وضوح الخط');
  panel.innerHTML='<div><strong>حجم الخط</strong><span>اختيارك يتبع حسابك على جميع أجهزتك</span></div><div class="teacher-text-options" role="group" aria-label="حجم الخط"><button type="button" data-text-size="normal" aria-pressed="false">صغير</button><button type="button" data-text-size="large" aria-pressed="true">متوسط</button><button type="button" data-text-size="xlarge" aria-pressed="false">كبير</button></div><p class="teacher-preference-state" role="status">جارٍ تحميل اختيارك…</p>';
  shell.querySelector('.welcome-banner').after(panel);
  const buttons=[...panel.querySelectorAll('[data-text-size]')],message=panel.querySelector('[role="status"]');
  let size='large',saving=false,disposed=false;
  const apply=value=>{
    size=['normal','large','xlarge'].includes(value)?value:'large';
    shell.dataset.textSize=size;
    buttons.forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.textSize===size)));
  };
  buttons.forEach(button=>button.disabled=true);
  const ready=repository.teacherAppearance().then(row=>{
    if(disposed)return;apply(row?.text_size);panel.dataset.preferenceState='ready';message.textContent='يمكنك تغيير الحجم في أي وقت.';
  }).catch(()=>{if(!disposed){panel.dataset.preferenceState='error';message.textContent='تعذر تحميل اختيارك. يمكنك اختيار الحجم ومحاولة حفظه.';}})
  .finally(()=>{if(!disposed)buttons.forEach(button=>button.disabled=false);});
  panel.addEventListener('click',async event=>{
    const button=event.target.closest('[data-text-size]');if(!button||saving||button.disabled)return;
    const next=button.dataset.textSize,previous=size;if(next===size)return;
    saving=true;buttons.forEach(b=>b.disabled=true);apply(next);panel.dataset.preferenceState='saving';message.textContent='جارٍ حفظ حجم الخط في حسابك…';
    try{
      const saved=await repository.saveTeacherAppearance(next);
      if(saved?.text_size!==next)throw new Error('Missing save acknowledgment');
      if(!disposed){panel.dataset.preferenceState='saved';message.textContent='✓ تم الحفظ على حسابك، ويُطبّق عند دخولك من أي جهاز.';}
    }catch{
      if(!disposed){apply(previous);panel.dataset.preferenceState='error';message.textContent='لم يُحفظ الاختيار. تحقق من الاتصال وحاول مرة أخرى.';}
    }finally{saving=false;if(!disposed)buttons.forEach(b=>b.disabled=false);}
  });
  const navigation=shell.querySelector('.dashboard-actions');
  const navigationHeading=document.createElement('div');navigationHeading.className='teacher-nav-heading';
  navigationHeading.innerHTML='<span>أقسام لوحتك</span><strong></strong>';navigation.before(navigationHeading);
  const main=shell.querySelector('.dashboard-main'),workspace=document.createElement('div'),sidebar=document.createElement('aside'),body=document.createElement('div');
  workspace.className='teacher-workspace';workspace.dataset.menuOpen='false';
  sidebar.className='teacher-sidebar';sidebar.id='teacher-sidebar';sidebar.setAttribute('aria-label','قائمة المعلم');
  body.className='teacher-workspace-content';
  sidebar.innerHTML='<header class="teacher-sidebar-heading"><span aria-hidden="true">✦</span><div><strong>لوحة المعلم</strong><small>أقسام واضحة.. وعمل أسهل</small></div><button type="button" class="teacher-menu-close" aria-label="إغلاق القائمة">×</button></header>';
  sidebar.append(navigationHeading,navigation);
  const extra=document.createElement('div');extra.className='teacher-sidebar-extra';
  shell.querySelectorAll('.admin-tabs').forEach(node=>extra.append(node));
  if(extra.children.length)sidebar.append(extra);
  const settings=document.createElement('details');settings.className='teacher-sidebar-settings';settings.innerHTML='<summary>◉ وضوح الخط وحجمه</summary>';settings.append(panel);sidebar.append(settings);
  const mobileMenu=document.createElement('button');mobileMenu.type='button';mobileMenu.className='teacher-menu-toggle';mobileMenu.setAttribute('aria-controls',sidebar.id);mobileMenu.setAttribute('aria-expanded','false');mobileMenu.innerHTML='<span aria-hidden="true">☰</span> أقسام لوحتك';
  const backdrop=document.createElement('button');backdrop.type='button';backdrop.className='teacher-menu-backdrop';backdrop.setAttribute('aria-label','إغلاق قائمة المعلم');backdrop.tabIndex=-1;
  [...main.children].filter(node=>!node.classList.contains('welcome-banner')).forEach(node=>body.append(node));
  workspace.append(sidebar,backdrop,body);main.append(mobileMenu,workspace);
  const closeMenu=(focus=false)=>{workspace.dataset.menuOpen='false';mobileMenu.setAttribute('aria-expanded','false');if(focus)mobileMenu.focus();};
  mobileMenu.addEventListener('click',()=>{workspace.dataset.menuOpen='true';mobileMenu.setAttribute('aria-expanded','true');sidebar.querySelector('.teacher-menu-close').focus();});
  sidebar.querySelector('.teacher-menu-close').addEventListener('click',()=>closeMenu(true));backdrop.addEventListener('click',()=>closeMenu(true));
  const menuKeys=event=>{
    if(workspace.dataset.menuOpen!=='true'||!matchMedia('(max-width:1000px)').matches||root.querySelector('dialog[open]'))return;
    if(event.key==='Escape'){event.preventDefault();closeMenu(true);}
    if(event.key==='Tab'){
      const items=[...sidebar.querySelectorAll('button:not(:disabled),summary,select,input,textarea,[tabindex="0"]')].filter(node=>node.getClientRects().length),first=items[0],last=items.at(-1);
      if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  };
  root.addEventListener('keydown',menuKeys);
  const viewNames={home:'اختر القسم المطلوب',evaluation:'التقييم الأسبوعي',knight:'فارس الأسبوع',monthly:'التقرير الشهري',honors:'التكريم الفصلي',khairkom:'ترشيحات جمعية خيركم',champions:'فرسان جميع الحلقات',setup:'إدارة قوائم الطلاب',monthlyReport:'تقارير الحلقات الشهرية',monthlyProgress:'إنجاز التقارير الشهرية',khairkomReport:'ترشيحات جميع المعلمين'};
  function setView(view){
    shell.dataset.workspace=view;navigation.dataset.compact=String(view!=='home');
    closeMenu(workspace.dataset.menuOpen==='true');
    navigationHeading.querySelector('strong').textContent=view==='home'?viewNames.home:'أنت الآن في: '+(viewNames[view]||'لوحة المعلم');
  }
  setView('home');
  const enhance=()=>{
    if(disposed)return;
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
  return {ready,setView,destroy(){disposed=true;observer.disconnect();root.removeEventListener('keydown',menuKeys);}};
}
