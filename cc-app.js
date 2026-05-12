const SB='https://uvddmeefxbqdqiltugiz.supabase.co';
const KEY='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InV2ZGRtZWVmeGJxZHFpbHR1Z2l6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc5MzY5MTgsImV4cCI6MjA5MzUxMjkxOH0.zAzOlv_vH7BQpN8DobXbOKA_SS0fwTWtZVlx0mkBINo';
const H={'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY};
const SYS='2025-08-01',SYE='2026-05-31';

async function get(t,p=''){const r=await fetch(`${SB}/rest/v1/${t}?${p}`,{headers:H});return r.json();}
async function patch(t,f,b){await fetch(`${SB}/rest/v1/${t}?${f}`,{method:'PATCH',headers:{...H,'Prefer':'return=minimal'},body:JSON.stringify(b)});}
function ld(d=new Date()){return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function mon(d=new Date()){const m=new Date(d);m.setDate(d.getDate()-((d.getDay()+6)%7));return m;}
function sun(d=new Date()){const s=new Date(mon(d));s.setDate(s.getDate()+6);return s;}

// Clock
function tick(){
  const n=new Date();
  const h=String(n.getHours()%12||12);
  const m=String(n.getMinutes()).padStart(2,'0');
  const s=String(n.getSeconds()).padStart(2,'0');
  const ap=n.getHours()>=12?'PM':'AM';
  document.getElementById('clock').textContent=`${h}:${m}:${s} ${ap}`;
  document.getElementById('clockDate').textContent=n.toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'});
}
setInterval(tick,1000);tick();

// Refresh timer
let cd=3600,tmr;
function startTimer(){
  clearInterval(tmr);cd=3600;
  tmr=setInterval(()=>{
    cd--;
    const m=String(Math.floor(cd/60)).padStart(2,'0'),s=String(cd%60).padStart(2,'0');
    document.getElementById('nextRefresh').textContent=`↻ ${m}:${s}`;
    if(cd<=0)refreshAll();
  },1000);
}

// Impact stats
async function loadImpact(){
  try{
    const [packs,si,vols]=await Promise.all([
      get('pack_events',`event_date=gte.${SYS}&event_date=lte.${SYE}&cancelled=eq.false&select=bags_packed`),
      get('sign_ins',`signed_in_at=gte.${SYS}T00:00:00&select=hours_credited`),
      get('volunteers','select=id&status=eq.Active')
    ]);
    const bags=packs.reduce((a,p)=>a+(p.bags_packed||0),0);
    document.getElementById('impactBags').textContent=bags.toLocaleString();
    document.getElementById('impactMeals').textContent=(bags*7).toLocaleString();
    document.getElementById('impactPacks').textContent=packs.filter(p=>p.bags_packed>0).length;
    document.getElementById('impactVols').textContent=vols.length;
    document.getElementById('impactHours').textContent=Math.round(si.reduce((a,s)=>a+(s.hours_credited||0),0)).toLocaleString();
  }catch(e){console.error(e);}
}

// This week's packs
async function loadPacks(){
  const m=mon(),s=sun();
  const ms=ld(m),ss=ld(s);
  document.getElementById('packWeekLabel').textContent=
    m.toLocaleDateString('en-US',{month:'short',day:'numeric'})+' – '+
    s.toLocaleDateString('en-US',{month:'short',day:'numeric'});
  try{
    const [evts,sups]=await Promise.all([
      get('pack_events',`event_date=gte.${ms}&event_date=lte.${ss}&cancelled=eq.false&order=event_date.asc,event_time.asc`),
      get('pack_signups','select=*,volunteers(name),staff(display_name)')
    ]);
    const el=document.getElementById('packList');
    if(!evts.length){el.innerHTML='<div class="cc-empty">✌️ No packs this week — enjoy the break!</div>';return;}
    el.innerHTML=evts.map(e=>{
      const d=new Date(e.event_date+'T12:00:00');
      const day=d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'});
      const es=sups.filter(x=>x.pack_event_id===e.id);
      const lead=es.find(x=>x.role==='Pack Lead');
      const hosts=es.filter(x=>x.role==='Pack Host');
      const lines=e.lines||1;
      const nm=x=>x.staff?.display_name||x.volunteers?.name||'?';
      function slotPair(x,openLabel){
        if(!x) return `<span class="slot-pill slot-open">${openLabel}</span>`;
        const isStaff=!!x.staff?.display_name;
        const vid=x.volunteer_id||'';
        const vn=nm(x).replace(/'/g,"\\'");
        const vt=x.role==='Pack Lead'?'Pack Lead':'Pack Host';
        const already=vid&&_todaySignIns.has(vid);
        if(isStaff) return `<div class="slot-si-pair"><span class="slot-pill slot-filled">✓ ${nm(x)}</span></div>`;
        return `<div class="slot-si-pair">
          <span class="slot-pill slot-filled">✓ ${nm(x)}</span>
          <button class="pack-si-btn${already?' signed-in':''}" ${already?'disabled':''} onclick="openSignIn('${vid}','${vn}','${vt}',this)">${already?'✓':'Sign In'}</button>
        </div>`;
      }
      const lp=slotPair(lead,'Lead: Open');
      const hp=Array.from({length:lines}).map((_,i)=>slotPair(hosts[i],`Host${lines>1?' '+(i+1):'+'}: Open`)).join('');
      const done=e.completed||(e.bags_packed>0);
      const cls=done?'completed':(!e.bags_packed&&new Date(e.event_date+'T23:59')<new Date()?'needs-update':'');
      return `<div class="pack-item ${cls}">
        <div class="pack-name">${e.name}</div>
        <div class="pack-meta">${day}${e.event_time?' · '+e.event_time:''} · ${lines} line${lines>1?'s':''}</div>
        <div class="pack-bottom">
          <div class="pack-slots">${lp}${hp}</div>
          <div class="bags-row">
            <div class="bags-inputs">
              <div class="bags-wrap"><span class="bags-lbl">Bags</span><input class="bags-inp" type="number" id="bags-${e.id}" value="${e.bags_packed||''}" placeholder="0" min="0" readonly onfocus="this.blur()" onclick="openKeypad(this,'Bags Packed')"></div>
              <div class="bags-wrap"><span class="bags-lbl">Vols</span><input class="bags-inp" type="number" id="vols-${e.id}" value="${e.total_volunteers||''}" placeholder="0" min="0" readonly onfocus="this.blur()" onclick="openKeypad(this,'Volunteers')"></div>
            </div>
            ${done?'<span class="done-pill">✓ Done!</span>':`<button class="save-btn" onclick="savePack('${e.id}')">Save</button>`}
          </div>
        </div>
      </div>`;
    }).join('');
  }catch(e){console.error(e);}
}

async function savePack(id){
  const bags=parseInt(document.getElementById('bags-'+id).value)||null;
  const vols=parseInt(document.getElementById('vols-'+id).value)||null;
  try{
    await patch('pack_events','id=eq.'+id,{bags_packed:bags,total_volunteers:vols,completed:bags>0});
    loadPacks();loadImpact();
  }catch(e){alert('Oops! '+e.message);}
}

// Deliveries
async function loadDeliveries(){
  const now=new Date();
  const fom=new Date(now.getFullYear(),now.getMonth(),1);
  function nth(day,d){let n=0;const c=new Date(fom);while(c<=d){if(c.getDay()===day)n++;c.setDate(c.getDate()+1);}return Math.min(n,4);}
  const mo=nth(1,now),tu=nth(2,now),we=nth(3,now);
  const weekStart=ld(mon(now));

  let slots=[],confs=[];
  try{ slots=await get('delivery_slots','role=eq.Driver&select=day_of_week,week_of_month,volunteer_id,volunteers(name)'); }catch(e){}
  try{ confs=await get('delivery_confirmations',`week_start_date=eq.${weekStart}&select=confirmed_name,confirmed_volunteer_id,notes`); }catch(e){}

  function getDriver(day,wk){
    return slots.find(s=>s.day_of_week===day&&s.week_of_month===wk)||null;
  }
  function getAsst(day){
    return confs.find(c=>c.notes===day)||null;
  }

  function siBtn(vid,name,type){
    const already=vid&&_todaySignIns.has(vid);
    const esc=(name||'').replace(/'/g,"\\'");
    return `<button class="deliv-si-btn${already?' signed-in':''}" ${already?'disabled':''} onclick="openSignIn('${vid||''}','${esc}','${type}',this)">${already?'✓':'Sign In'}</button>`;
  }

  document.getElementById('delivList').innerHTML=
    [{d:'Monday',n:mo},{d:'Tuesday',n:tu},{d:'Wednesday',n:we}].map(({d,n})=>{
      const drv=getDriver(d,n);
      const ast=getAsst(d);
      const drvName=drv?.volunteers?.name||'—';
      const drvId=drv?.volunteer_id||'';
      const astName=ast?.confirmed_name||null;
      const astId=ast?.confirmed_volunteer_id||'';
      return `<div class="day-block">
        <div class="day-label">${d}</div>
        <div class="person-row"><div class="person-dot" style="background:var(--orange);"></div><div class="person-name">${drvName}</div><span class="role-pill driver-pill">🚐 Driver</span>${drvName!=='—'?siBtn(drvId,drvName,'Delivery Driver'):''}</div>
        ${astName?`<div class="person-row"><div class="person-dot" style="background:var(--blue);"></div><div class="person-name">${astName}</div><span class="role-pill asst-pill">👐 Assistant</span>${siBtn(astId,astName,'Delivery Assistant')}</div>`:''}
      </div>`;
    }).join('');
}

// Schedule
async function loadSchedule(){
  const now=new Date();
  const ms=ld(mon(now)),ss=ld(sun(now));

  let schedRows=[],timeOff=[];
  try{ schedRows=await get('volunteer_schedules','select=volunteer_id,day_of_week,shift_time,volunteer_types(name),volunteers(name)&order=created_at.asc'); }catch(e){}
  try{ timeOff=await get('volunteer_time_off',`start_date=lte.${ss}&end_date=gte.${ms}&select=volunteer_id,start_date,end_date`); }catch(e){}

  const typeMap={
    'Warehouse AM':{cls:'wh-am',label:'WH AM'},
    'Warehouse PM':{cls:'wh-pm',label:'WH PM'},
    'Processing':  {cls:'proc', label:'Processing'},
    'Admin':       {cls:'adm',  label:'Admin'},
  };

  function isOff(vid,day){
    const dm={Tuesday:2,Wednesday:3,Thursday:4};
    const td=dm[day];if(!td)return false;
    const d=new Date(mon(now));
    while(d.getDay()!==td)d.setDate(d.getDate()+1);
    const ds=ld(d);
    return timeOff.some(t=>t.volunteer_id===vid&&t.start_date<=ds&&t.end_date>=ds);
  }

  function startHour(t){
    if(!t)return 99;
    const m=t.match(/(\d+):(\d+)\s*(am|pm)/i);
    if(!m)return 99;
    let h=parseInt(m[1]);
    if(m[3].toLowerCase()==='pm'&&h<12)h+=12;
    if(m[3].toLowerCase()==='am'&&h===12)h=0;
    return h;
  }
  const byDay={Tuesday:[],Wednesday:[],Thursday:[]};
  schedRows.forEach(r=>{ if(byDay[r.day_of_week]) byDay[r.day_of_week].push(r); });
  Object.keys(byDay).forEach(day=>byDay[day].sort((a,b)=>startHour(a.shift_time)-startHour(b.shift_time)));

  document.getElementById('schedList').innerHTML=Object.entries(byDay).map(([day,rows])=>`
    <div class="sched-day-block">
      <div class="sched-day-label">${day}</div>
      ${rows.map(r=>{
        const off=isOff(r.volunteer_id,day);
        const t=typeMap[r.volunteer_types?.name]||{cls:'proc',label:r.volunteer_types?.name||''};
        const vid=r.volunteer_id||'';
        const vname=(r.volunteers?.name||'').replace(/'/g,"\\'");
        const vtype=(r.volunteer_types?.name||'').replace(/'/g,"\\'");
        return `<div class="sched-row ${off?'out':''}">
          <div class="sched-time">${r.shift_time||''}</div>
          <div class="sched-name">${r.volunteers?.name||''}${off?'<span class="out-badge">OUT</span>':''}</div>
          <span class="sched-type ${t.cls}">${t.label}</span>
          ${vid?`<button class="sched-si-btn${_todaySignIns.has(vid)?' signed-in':''}" ${_todaySignIns.has(vid)?'disabled':''} onclick="openSignIn('${vid}','${vname}','${vtype}',this)">${_todaySignIns.has(vid)?'✓':'Sign In'}</button>`:''}
        </div>`;
      }).join('')}
    </div>`).join('');
}

// Tasks
async function loadTasks(){
  const el=document.getElementById('taskList');
  try{
    const tasks=await get('volunteer_tasks','select=id,title,completed&order=completed.asc,created_at.asc');
    if(!tasks.length){el.innerHTML='<div style="font-size:11px;color:var(--text-faint);text-align:center;padding:8px 0;">No tasks yet — add one above!</div>';return;}
    el.innerHTML=tasks.map(t=>`
      <div class="task-item${t.completed?' done':''}" id="task-${t.id}">
        <div class="task-cb${t.completed?' checked':''}" onclick="toggleTask('${t.id}',${!t.completed})"></div>
        <span class="task-text${t.completed?' done':''}">${t.title.replace(/</g,'&lt;')}</span>
        <button class="task-del" onclick="deleteTask('${t.id}')" title="Remove">✕</button>
      </div>`).join('');
  }catch(e){console.error(e);}
}
async function toggleTask(id, completed){
  const item=document.getElementById('task-'+id);
  const cb=item?.querySelector('.task-cb');
  const txt=item?.querySelector('.task-text');
  if(item) item.classList.toggle('done', completed);
  if(cb)   cb.classList.toggle('checked', completed);
  if(txt)  txt.classList.toggle('done', completed);
  try{
    await fetch(`${SB}/rest/v1/volunteer_tasks?id=eq.${id}`,{
      method:'PATCH',headers:{...H,'Prefer':'return=minimal'},
      body:JSON.stringify({completed})
    });
  }catch(e){console.error(e);}
}
async function addTask(){
  const inp=document.getElementById('taskInput');
  const title=inp.value.trim();
  if(!title)return;
  inp.value='';
  try{
    await fetch(`${SB}/rest/v1/volunteer_tasks`,{
      method:'POST',
      headers:{...H,'Prefer':'return=minimal'},
      body:JSON.stringify({title,completed:false})
    });
    loadTasks();
  }catch(e){console.error(e);}
}
async function deleteTask(id){
  try{
    await fetch(`${SB}/rest/v1/volunteer_tasks?id=eq.${id}`,{method:'DELETE',headers:H});
    document.getElementById('task-'+id)?.remove();
  }catch(e){console.error(e);}
}

let _todaySignIns=new Set();
async function loadTodaySignIns(){
  const today=new Date().toISOString().slice(0,10);
  try{
    const rows=await get('sign_ins',`signed_in_at=gte.${today}T00:00:00&select=volunteer_id`);
    _todaySignIns=new Set(rows.map(r=>r.volunteer_id).filter(Boolean));
  }catch(e){}
}
async function refreshAll(){
  startTimer();
  await Promise.all([loadTodaySignIns(),loadImpact(),loadPacks(),loadDeliveries(),loadSchedule(),loadTasks()]);
}
window.addEventListener('DOMContentLoaded',()=>{refreshAll();startTimer();});

// Sign-in modal
const SCHOOL_YEAR_START='2025-08-01';
let _siVid=null,_siVName='',_siTypeName='',_siBtn=null;

function siLevel(hrs){
  if(hrs>=1500)return'Icon';if(hrs>=1000)return'Legend';
  if(hrs>=750)return'Champion';if(hrs>=500)return'Pillar';
  if(hrs>=250)return'Anchor';if(hrs>=100)return'Rising';
  return'Seedling';
}
function siNextMs(hrs){return[100,250,500,750,1000,1500].find(m=>m>hrs)||null;}

function openSignIn(vid,name,typeName,btnEl){
  if(btnEl?.classList.contains('signed-in'))return;
  _siVid=vid;_siVName=name;_siTypeName=typeName;_siBtn=btnEl||null;
  document.getElementById('siModalName').textContent=name;
  document.getElementById('siModalType').textContent='Signing in as '+typeName;
  document.getElementById('si-step1').style.display='block';
  document.getElementById('si-step2').style.display='none';
  document.getElementById('siOverlay').classList.remove('hidden');
}

async function doSignIn(){
  const btn=document.querySelector('.si-confirm-btn');
  btn.disabled=true;btn.textContent='Signing in…';
  try{
    let vid=_siVid;
    if(!vid){
      const vols=await get('volunteers',`name=eq.${encodeURIComponent(_siVName)}&select=id`);
      vid=vols[0]?.id;
    }
    if(!vid){btn.disabled=false;btn.textContent='✓ Sign In';return;}
    _siVid=vid;

    const types=await get('volunteer_types',`name=eq.${encodeURIComponent(_siTypeName)}&select=id,hours_per_signin`);
    const typeRec=types[0];
    if(!typeRec){btn.disabled=false;btn.textContent='✓ Sign In';return;}
    const hrs=typeRec.hours_per_signin||0;

    await fetch(`${SB}/rest/v1/sign_ins`,{
      method:'POST',
      headers:{...H,'Prefer':'return=minimal'},
      body:JSON.stringify({volunteer_id:_siVid,type_id:typeRec.id,
        signed_in_at:new Date().toISOString(),hours_credited:hrs})
    });

    const [updated]=await get('volunteer_levels',`id=eq.${_siVid}&select=lifetime_hours`);
    const lifetime=updated?.lifetime_hours||0;
    const lv=siLevel(lifetime);
    const next=siNextMs(lifetime);

    const allSI=await get('sign_ins',`signed_in_at=gte.${SCHOOL_YEAR_START}&select=hours_credited`);
    const totalHrs=allSI.reduce((a,s)=>a+(s.hours_credited||0),0)||1;
    const bags=document.getElementById('impactBags');
    const totalBags=bags?parseInt(bags.textContent.replace(/,/g,''))||0:0;
    const volBags=totalHrs>0?Math.round((lifetime/totalHrs)*totalBags):0;

    document.getElementById('siStatName').textContent=_siVName;
    document.getElementById('siStatHrs').textContent='+'+hrs;
    document.getElementById('siStatLevel').textContent=lv;
    document.getElementById('siStatLifetime').textContent=lifetime.toFixed(1);
    document.getElementById('siStatBackpacks').textContent=volBags.toLocaleString();
    if(next){
      const pct=Math.min(100,(lifetime/next)*100);
      document.getElementById('siStatBar').innerHTML=
        `<div style="background:rgba(255,255,255,0.12);border-radius:8px;height:7px;overflow:hidden;">
          <div style="background:var(--orange);width:${pct}%;height:100%;border-radius:8px;transition:width .6s;"></div>
        </div>
        <div style="font-size:10px;color:var(--text-faint);margin-top:4px;">${(next-lifetime).toFixed(1)} hrs to ${siLevel(next)}</div>`;
    } else {
      document.getElementById('siStatBar').innerHTML='<div style="font-size:12px;color:var(--yellow);">🏆 Maximum Level Achieved!</div>';
    }

    if(_siBtn){_siBtn.textContent='✓';_siBtn.classList.add('signed-in');_siBtn.disabled=true;}
    if(_siVid) _todaySignIns.add(_siVid);
    document.getElementById('si-step1').style.display='none';
    document.getElementById('si-step2').style.display='block';
  }catch(e){console.error(e);}
  btn.disabled=false;btn.textContent='✓ Sign In';
}

function closeSignIn(){
  document.getElementById('siOverlay').classList.add('hidden');
  _siVid=null;
}
function siOverlayClick(e){if(e.target===document.getElementById('siOverlay'))closeSignIn();}

// 10-key keypad
let _kpTarget=null, _kpVal='';
function openKeypad(inputEl, label){
  _kpTarget=inputEl;
  _kpVal=inputEl.value||'';
  document.getElementById('keypadLabel').textContent=label;
  document.getElementById('keypadDisplay').textContent=_kpVal||'—';
  document.getElementById('keypadOverlay').classList.remove('hidden');
}
function kp(n){
  if(_kpVal.length>=4)return;
  _kpVal+=String(n);
  document.getElementById('keypadDisplay').textContent=_kpVal;
}
function kpBack(){
  _kpVal=_kpVal.slice(0,-1);
  document.getElementById('keypadDisplay').textContent=_kpVal||'—';
}
function kpDone(){
  if(_kpTarget){_kpTarget.value=_kpVal;_kpTarget=null;}
  document.getElementById('keypadOverlay').classList.add('hidden');
}
function kpCancel(){
  _kpTarget=null;
  document.getElementById('keypadOverlay').classList.add('hidden');
}
function keypadCancel(e){if(e.target===document.getElementById('keypadOverlay'))kpCancel();}