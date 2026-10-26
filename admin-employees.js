// ══════════════════════════════════════════════
// EMPLOYEES · PERMISSIONS · PROFILE · DUES
// Loaded by admin.html; relies on its globals ($, gs, ss, _db, initFirebase,
// _currentUser, showToast, closeModal, SAR, SESSION_KEY, getPass, init).
// ══════════════════════════════════════════════
const EMP_KEY = 'shark_employees';
const LEDGER_KEY = 'shark_emp_ledger';
const EMP_ROLES = ['موظف', 'مدير', 'محاسب'];

// Every sidebar section that can be granted. `nav` is the sidebar item id when it differs from nav-<key>.
const PERM_SECTIONS = [
  {key:'dashboard', label:'الرئيسية'},
  {key:'workspace-offers', label:'عروضنا'},
  {key:'deals', label:'الصفقات'},
  {key:'tasks', label:'المهام'},
  {key:'performance', label:'تقارير الأداء'},
  {key:'chat', label:'المحادثة'},
  {key:'finance', label:'المالية'},
  {key:'promos', label:'الإعلانات'},
  {key:'landing', label:'صفحات الهبوط'},
  {key:'promowa', label:'الرسائل الترويجية'},
  {key:'offers', label:'العروض المنشورة', nav:'nav-web-offers'},
  {key:'projects', label:'مشاريع الشركاء'},
  {key:'clients', label:'العملاء'},
  {key:'shark-docs', label:'مستندات شارك'},
  {key:'employees', label:'إدارة الموظفين'},
  {key:'settings', label:'الإعدادات'}
];
const ALL_PERMS = PERM_SECTIONS.map(p=>p.key);
const ROLE_PERMS = {
  'مدير': ALL_PERMS,
  'محاسب': ['dashboard','deals','tasks','performance','chat','finance','shark-docs'],
  'موظف': ['dashboard','workspace-offers','deals','tasks','chat','promos','landing','promowa','clients','shark-docs']
};
// Sections without their own sidebar entry inherit another section's permission.
const PERM_ALIASES = {'export':'clients'};

const LEDGER_TYPES = {
  salary:    {label:'راتب مستحق', sign:1},
  commission:{label:'عمولة', sign:1},
  bonus:     {label:'مكافأة', sign:1},
  allowance: {label:'بدل', sign:1},
  payment:   {label:'صرف / دفعة للموظف', sign:-1},
  advance:   {label:'سلفة', sign:-1},
  deduction: {label:'خصم', sign:-1}
};

// ── helpers ──
function h(s){ return String(s==null?'':s).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function jsq(s){ return h(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }
function money(n){ return (Math.round((Number(n)||0)*100)/100).toLocaleString('en-US') + ' ' + SAR; }
function empName(e){ return (e && (e.name||e.username)) || ''; }
function empInitial(e){ return (empName(e).trim()[0] || '؟').toUpperCase(); }
function empTimeout(ms){ return new Promise((_,rej)=>setTimeout(()=>rej(new Error('timeout')), ms)); }
function cleanDoc(o){ return JSON.parse(JSON.stringify(o)); }
function todayISO(){ return new Date().toISOString().split('T')[0]; }

function getEmployees(){
  var stored = gs(EMP_KEY);
  if(stored && stored.length) return stored;
  return [{username:'admin', password:getPass(), role:'مدير', name:'المدير', status:'active'}];
}
function findEmployee(username){ return getEmployees().find(e=>e.username===username) || null; }
function sortEmps(list){ return list.slice().sort((a,b)=>(a._created||0)-(b._created||0)); }
function getLedger(){ return gs(LEDGER_KEY) || []; }

// ── passwords (stored as salted SHA-256, never in plain text once migrated) ──
async function hashPass(username, pass){
  if(!(window.crypto && crypto.subtle && window.TextEncoder)) return null;
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('sharek:'+username+':'+pass));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
async function setPassword(emp, pass){
  const hsh = await hashPass(emp.username, pass);
  if(hsh){ emp.passHash = hsh; delete emp.password; } else { emp.password = pass; delete emp.passHash; }
}
async function checkPassword(emp, pass){
  if(emp.passHash) return (await hashPass(emp.username, pass)) === emp.passHash;
  return emp.password === pass;
}

// ── permissions ──
function empPerms(e){
  if(!e) return [];
  if(e.username==='admin') return ALL_PERMS.slice();
  if(Array.isArray(e.perms)) return e.perms.filter(p=>ALL_PERMS.includes(p));
  return (ROLE_PERMS[e.role] || ROLE_PERMS['موظف']).slice();
}
function currentEmp(){ return _currentUser ? (findEmployee(_currentUser.username) || _currentUser) : null; }
function canAccess(section){
  if(!_currentUser) return false;
  const key = PERM_ALIASES[section] || section;
  if(!ALL_PERMS.includes(key)) return true;
  return empPerms(currentEmp()).includes(key);
}
function firstAllowedSection(){ return ALL_PERMS.find(k=>canAccess(k)) || null; }
function navFor(p){ return $(p.nav || ('nav-'+p.key)); }

function applyPermissions(){
  PERM_SECTIONS.forEach(p=>{ const el = navFor(p); if(el) el.style.display = canAccess(p.key) ? '' : 'none'; });
  // Hide sidebar headings (and their collapsible groups) once every item under them is hidden.
  document.querySelectorAll('.sidebar .sidebar-section-label').forEach(label=>{
    const parts = []; let el = label.nextElementSibling;
    while(el && !el.classList.contains('sidebar-section-label')){ parts.push(el); el = el.nextElementSibling; }
    const items = parts.flatMap(x=>x.classList.contains('sidebar-item') ? [x] : Array.from(x.querySelectorAll('.sidebar-item')));
    const any = items.some(i=>i.style.display!=='none');
    label.style.display = any ? '' : 'none';
    parts.forEach(x=>{ if(!x.classList.contains('sidebar-item')) x.style.display = any ? '' : 'none'; });
  });
  const active = document.querySelector('.section.active');
  if(active){ const name = active.id.replace(/^sec-/,''); if(!canAccess(name)){ const alt = firstAllowedSection(); if(alt) showSection(alt); } }
}

// Re-reads the logged-in user's record (role/name/permissions may have changed on another device).
// `strict` is used after a successful sync: a deleted or suspended account is signed out.
function refreshCurrentUser(strict){
  if(!_currentUser) return;
  const e = findEmployee(_currentUser.username);
  if(strict && (!e || e.status==='suspended')){
    alert(!e ? 'تم حذف حسابك — سيتم تسجيل الخروج' : 'تم إيقاف حسابك — سيتم تسجيل الخروج');
    doLogout(); return;
  }
  if(e){ _currentUser = {username:e.username, role:e.role||'موظف', name:e.name||e.username}; sessionStorage.setItem('shark_user', JSON.stringify(_currentUser)); }
  $('topbar-name').textContent = _currentUser.name || _currentUser.username;
  $('topbar-role').textContent = (e && e.jobTitle) ? (_currentUser.role+' · '+e.jobTitle) : _currentUser.role;
  $('topbar-avatar').textContent = empInitial(_currentUser);
  applyPermissions();
}

// ── Firestore sync ──
async function fetchEmployeesRemote(){
  if(!_db) initFirebase();
  const snap = await Promise.race([_db.collection('employees').get(), empTimeout(8000)]);
  return snap.docs.map(d=>({...d.data(), username:d.id}));
}
async function pushEmployee(e){
  if(e.password && !e.passHash) await setPassword(e, e.password);
  const list = getEmployees(); const i = list.findIndex(x=>x.username===e.username);
  if(i>=0) list[i] = e; else list.push(e);
  ss(EMP_KEY, list);
  if(!_db) initFirebase();
  await _db.collection('employees').doc(e.username).set(cleanDoc(e));
}
async function syncEmployees(manual){
  let ok = false;
  try{
    const remote = await fetchEmployeesRemote();
    if(remote.length){ ss(EMP_KEY, sortEmps(remote)); }
    else if(canAccess('employees')){
      // First run on Firestore: publish this device's list so every device shares it.
      for(const e of getEmployees()){ if(!e._created) e._created = Date.now(); await pushEmployee(e); }
    }
    const [ls, ds] = await Promise.race([Promise.all([_db.collection('employee_ledger').get(), _db.collection('deals').get()]), empTimeout(8000)]);
    ss(LEDGER_KEY, ls.docs.map(d=>({...d.data(), id:d.id})));
    const deals = {}; (gs('shark_deals')||[]).forEach(d=>{ deals[d.id]=d; }); ds.docs.forEach(d=>{ deals[d.id]={...d.data(), id:d.id}; });
    ss('shark_deals', Object.values(deals).sort((a,b)=>(b._ts||0)-(a._ts||0)));
    ok = true;
    if(manual) showToast('تمت مزامنة الموظفين');
  }catch(err){ console.warn('employees sync', err); if(manual) showToast('تعذّرت المزامنة — عرض البيانات المحلية'); }
  refreshCurrentUser(ok);
  if(_currentUser) renderEmployees();
}

// ── login / session ──
async function doLogin(){
  const u = ($('user-input').value||'').trim(); const p = $('pass-input').value;
  const btn = document.querySelector('.btn-login'); const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'جاري التحقق...'; $('login-err').textContent = '';
  try{ const remote = await fetchEmployeesRemote(); if(remote.length) ss(EMP_KEY, sortEmps(remote)); }catch(e){ console.warn('login: using local employees', e); }
  const emp = findEmployee(u);
  const ok = !!emp && await checkPassword(emp, p);
  btn.disabled = false; btn.textContent = label;
  if(!ok){ $('login-err').style.color=''; $('login-err').textContent='اسم المستخدم أو كلمة المرور غير صحيحة'; $('pass-input').value=''; return; }
  if(emp.status==='suspended'){ $('login-err').style.color=''; $('login-err').textContent='هذا الحساب موقوف — راجع الإدارة'; return; }
  if(!emp.passHash && emp.password){ await setPassword(emp, p); pushEmployee(emp).catch(e=>console.warn('pass migrate', e)); }
  _currentUser = {username:emp.username, role:emp.role||'موظف', name:emp.name||emp.username};
  sessionStorage.setItem(SESSION_KEY,'1'); sessionStorage.setItem('shark_user', JSON.stringify(_currentUser));
  $('login').style.display='none'; $('dashboard').style.display='block'; init();
}
window.addEventListener('load', ()=>{
  if(sessionStorage.getItem(SESSION_KEY)!=='1') return;
  _currentUser = JSON.parse(sessionStorage.getItem('shark_user')||'null');
  if(!_currentUser){ sessionStorage.removeItem(SESSION_KEY); return; }
  $('login').style.display='none'; $('dashboard').style.display='block'; init();
});

async function changePass(){
  const old=$('old-pass').value, nw=$('new-pass').value, nw2=$('new-pass2').value; const msg=$('pass-msg');
  const err = t=>{ msg.style.color='#ef4444'; msg.textContent=t; };
  const emp = findEmployee(_currentUser && _currentUser.username);
  if(!emp || !(await checkPassword(emp, old))) return err('كلمة المرور الحالية غير صحيحة');
  if(nw.length<6) return err('كلمة المرور يجب أن تكون 6 أحرف على الأقل');
  if(nw!==nw2) return err('كلمتا المرور غير متطابقتين');
  await setPassword(emp, nw);
  try{ await pushEmployee(emp); }catch(e){ return err('تعذّر الحفظ — تحقق من الاتصال'); }
  msg.style.color='#10b981'; msg.textContent='تم تغيير كلمة المرور بنجاح';
  ['old-pass','new-pass','new-pass2'].forEach(id=>$(id).value='');
}

// ── finances ──
function empFinancials(e){
  const rate = (parseFloat(e.commissionRate)||0)/100;
  const deals = (gs('shark_deals')||[]).filter(d=>d.agent && (d.agent===e.name || d.agent===e.username));
  const collected = deals.reduce((s,d)=>s+(parseFloat(d.collectedAmount)||0), 0);
  const pending = deals.reduce((s,d)=>s+Math.max(0,(parseFloat(d.commission)||0)-(parseFloat(d.collectedAmount)||0)), 0);
  const ledger = getLedger().filter(l=>l.username===e.username).sort((a,b)=>(b.date||'').localeCompare(a.date||'') || (b._ts||0)-(a._ts||0));
  let credits = 0, debits = 0;
  ledger.forEach(l=>{ const t = LEDGER_TYPES[l.type]; const a = parseFloat(l.amount)||0; if(t && t.sign>0) credits+=a; else debits+=a; });
  const dealEarn = collected*rate;
  return {deals, dealEarn, dealExpected:pending*rate, credits, debits, ledger, due:dealEarn+credits-debits};
}

// ── employees section ──
function renderEmployees(){
  const body = $('emp-body'); if(!body) return;
  const emps = getEmployees(); const me = _currentUser && _currentUser.username;
  let totalDue = 0, salaries = 0;
  body.innerHTML = emps.map(e=>{
    const f = empFinancials(e); totalDue += Math.max(0, f.due); salaries += parseFloat(e.salary)||0;
    const perms = empPerms(e); const st = e.status==='suspended' ? 'suspended' : 'active';
    const rating = Math.min(e.rating||0, 5);
    const stars = [0,1,2,3,4].map(i=>`<span style="color:${i<rating?'#f59e0b':'#d1d5db'}">★</span>`).join('');
    const canDel = e.username!==me && e.username!=='admin';
    return `<tr>
      <td><div class="emp-cell"><span class="emp-avatar">${h(empInitial(e))}</span><div><div class="en">${h(empName(e))}</div><div class="eu">@${h(e.username)}${e.jobTitle?' · '+h(e.jobTitle):''}</div></div></div></td>
      <td><span class="badge badge-gold">${h(e.role||'موظف')}</span></td>
      <td><span class="emp-status ${st}">${st==='active'?'نشط':'موقوف'}</span></td>
      <td style="font-size:12px;color:var(--sub)">${perms.length}/${ALL_PERMS.length}${Array.isArray(e.perms)&&e.username!=='admin'?' · مخصصة':''}</td>
      <td title="${e.rating||0} أوسمة">${stars}</td>
      <td style="font-weight:700;color:${f.due>0?'#b45309':'var(--sub)'}">${money(f.due)}</td>
      <td><div class="emp-actions"><button onclick="openEmployeeProfile('${jsq(e.username)}')">الملف</button><button onclick="openEmployeeEditor('${jsq(e.username)}')">تعديل</button>${canDel?`<button class="del" onclick="deleteEmployee('${jsq(e.username)}')">حذف</button>`:''}</div></td>
    </tr>`;
  }).join('');
  const active = emps.filter(e=>e.status!=='suspended').length;
  $('emp-stats').innerHTML = [
    ['عدد الموظفين', emps.length], ['الحسابات النشطة', active], ['الحسابات الموقوفة', emps.length-active],
    ['مجموع الرواتب الشهرية', money(salaries)], ['إجمالي المستحقات', money(totalDue)]
  ].map(([l,v])=>`<div class="stat-card" style="text-align:center"><div class="stat-val" style="font-size:22px">${v}</div><div class="stat-label">${l}</div></div>`).join('');
}

function renderPermGrid(perms, locked){
  const grid = $('emp-perms-grid');
  grid.classList.toggle('locked', !!locked);
  grid.innerHTML = PERM_SECTIONS.map(p=>`<label class="emp-check"><input type="checkbox" value="${p.key}" ${perms.includes(p.key)?'checked':''} ${locked?'disabled':''}> ${p.label}</label>`).join('');
}
function onEmpRoleChange(){ if(!$('emp-custom-perms').checked) renderPermGrid(ROLE_PERMS[$('emp-role').value]||[], true); }
function onEmpCustomPermsToggle(){
  const custom = $('emp-custom-perms').checked;
  const cur = Array.from($('emp-perms-grid').querySelectorAll('input:checked')).map(i=>i.value);
  renderPermGrid(custom ? cur : (ROLE_PERMS[$('emp-role').value]||[]), !custom);
}

function openEmployeeEditor(username){
  if(!canAccess('employees')) return;
  const e = username ? findEmployee(username) : null;
  $('emp-edit-id').value = e ? e.username : '';
  $('emp-modal-title').textContent = e ? 'تعديل بيانات الموظف' : 'إضافة موظف جديد';
  $('emp-username').value = e ? e.username : ''; $('emp-username').disabled = !!e;
  $('emp-pass').value = ''; $('emp-pass').placeholder = e ? 'اتركها فارغة لعدم التغيير' : '••••••••';
  $('emp-pass-label').textContent = e ? 'كلمة مرور جديدة' : 'كلمة المرور *';
  $('emp-role').innerHTML = EMP_ROLES.map(r=>`<option value="${r}">${r}</option>`).join('');
  const f = (id, v)=>{ $(id).value = v==null ? '' : v; };
  f('emp-name', e&&e.name); f('emp-email', e&&e.email); f('emp-phone', e&&e.phone); f('emp-title', e&&e.jobTitle);
  f('emp-hire', e&&e.hireDate); f('emp-idno', e&&e.idNumber); f('emp-iban', e&&e.iban); f('emp-salary', e&&e.salary);
  f('emp-commrate', e&&e.commissionRate); f('emp-notes', e&&e.notes);
  $('emp-role').value = (e&&e.role) || 'موظف'; $('emp-status').value = (e&&e.status) || 'active';
  const isAdmin = e && e.username==='admin'; const isMe = e && _currentUser && e.username===_currentUser.username;
  $('emp-status').disabled = isAdmin || isMe;
  const custom = !!(e && Array.isArray(e.perms)) && !isAdmin;
  $('emp-custom-perms').checked = custom; $('emp-custom-perms').disabled = isAdmin;
  renderPermGrid(empPerms(e || {role:'موظف'}), !custom || isAdmin);
  $('modal-emp').classList.add('open');
}

async function saveEmployee(){
  const editId = $('emp-edit-id').value;
  const username = editId || $('emp-username').value.trim();
  const name = $('emp-name').value.trim(); const pass = $('emp-pass').value;
  if(!username || !name || (!editId && !pass)){ alert('الرجاء ملء الحقول المطلوبة'); return; }
  if(!/^[A-Za-z0-9._-]+$/.test(username)){ alert('اسم المستخدم: أحرف إنجليزية وأرقام فقط'); return; }
  if(pass && pass.length<6){ alert('كلمة المرور يجب أن تكون 6 أحرف على الأقل'); return; }
  if(!editId && findEmployee(username)){ alert('اسم المستخدم موجود مسبقاً'); return; }
  const e = editId ? {...findEmployee(editId)} : {username, rating:0, _created:Date.now()};
  Object.assign(e, {
    name, role:$('emp-role').value, status:$('emp-status').value,
    email:$('emp-email').value.trim(), phone:$('emp-phone').value.trim(), jobTitle:$('emp-title').value.trim(),
    hireDate:$('emp-hire').value, idNumber:$('emp-idno').value.trim(), iban:$('emp-iban').value.trim().toUpperCase(),
    salary:parseFloat($('emp-salary').value)||0, commissionRate:parseFloat($('emp-commrate').value)||0,
    notes:$('emp-notes').value.trim(), _ts:Date.now()
  });
  if($('emp-custom-perms').checked && username!=='admin'){
    e.perms = Array.from($('emp-perms-grid').querySelectorAll('input:checked')).map(i=>i.value);
  } else { delete e.perms; }
  // Never let a manager lock themselves out of this screen.
  if(_currentUser && username===_currentUser.username && !empPerms(e).includes('employees')){ alert('لا يمكنك إزالة صلاحية "إدارة الموظفين" من حسابك'); return; }
  if(pass) await setPassword(e, pass);
  const btn = $('emp-save-btn'); btn.disabled = true;
  try{ await pushEmployee(e); showToast(editId ? 'تم تحديث بيانات الموظف' : 'تم إضافة الموظف'); }
  catch(err){ console.warn(err); showToast('تم الحفظ محلياً — تعذّرت المزامنة'); }
  btn.disabled = false;
  closeModal('modal-emp'); refreshCurrentUser(); renderEmployees();
}

async function deleteEmployee(username){
  if(!canAccess('employees') || username==='admin' || (_currentUser && username===_currentUser.username)) return;
  if(!confirm('هل تريد حذف هذا الموظف؟ سيتم إيقاف دخوله فوراً.')) return;
  ss(EMP_KEY, getEmployees().filter(e=>e.username!==username));
  try{ await _db.collection('employees').doc(username).delete(); }catch(e){ showToast('تعذّر الحذف من السحابة'); }
  renderEmployees(); showToast('تم حذف الموظف');
}

// ── profile (own profile from the topbar, or any employee for managers) ──
let _profileUser = null, _profileTab = 'info';
function openMyProfile(){ if(_currentUser) openEmployeeProfile(_currentUser.username); }
function openEmployeeProfile(username, tab){
  const isMe = _currentUser && username===_currentUser.username;
  if(!isMe && !canAccess('employees')) return;
  _profileUser = username; _profileTab = tab || 'info';
  renderEmployeeProfile();
  $('modal-emp-profile').classList.add('open');
}
function setProfileTab(t){ _profileTab = t; renderEmployeeProfile(); }

function renderEmployeeProfile(){
  const e = findEmployee(_profileUser) || (_currentUser && _currentUser.username===_profileUser ? _currentUser : null);
  if(!e) return;
  const isMe = _currentUser && e.username===_currentUser.username; const manage = canAccess('employees');
  const tabs = [['info','الحساب والبيانات'],['perms','الصلاحيات'],['fin','المالية والمستحقات'],['perf','الأداء']];
  const head = `<div class="emp-ph"><span class="emp-avatar lg">${h(empInitial(e))}</span><div style="flex:1;min-width:0"><div class="pn">${h(empName(e))}${isMe?' <span style="font-size:12px;color:var(--gold)">(أنت)</span>':''}</div>
    <div class="pm"><span dir="ltr">@${h(e.username)}</span><span>${h(e.role||'موظف')}</span>${e.jobTitle?`<span>${h(e.jobTitle)}</span>`:''}<span>${e.status==='suspended'?'⛔ موقوف':'● نشط'}</span></div></div>
    ${manage?`<button class="btn-outline" style="background:transparent" onclick="closeModal('modal-emp-profile');openEmployeeEditor('${jsq(e.username)}')">تعديل</button>`:''}</div>
    <div class="emp-tabs">${tabs.map(([k,l])=>`<button class="emp-tab ${_profileTab===k?'active':''}" onclick="setProfileTab('${k}')">${l}</button>`).join('')}</div>`;
  let pane = '';
  if(_profileTab==='info'){
    const fields = [['اسم المستخدم', e.username, true],['الاسم الكامل', e.name],['الدور', e.role||'موظف'],['المسمى الوظيفي', e.jobTitle],
      ['البريد الإلكتروني', e.email, true],['رقم الجوال', e.phone, true],['تاريخ التعيين', e.hireDate],['رقم الهوية / الإقامة', e.idNumber, true],
      ['الآيبان', e.iban, true],['الأوسمة', (e.rating||0)+' ★']];
    pane = `<div class="emp-info">${fields.map(([l,v,ltr])=>`<div><small>${l}</small><b ${ltr?'dir="ltr"':''}>${v?h(v):'—'}</b></div>`).join('')}</div>
      ${e.notes?`<div style="margin-top:12px;background:var(--bg);border-radius:10px;padding:12px;font-size:13px"><small style="color:var(--sub)">ملاحظات</small><div>${h(e.notes)}</div></div>`:''}
      ${isMe?`<div class="settings-card" style="max-width:none;margin:16px 0 0"><h4>تغيير كلمة المرور</h4><div class="form-2col"><div class="form-row"><label>الحالية</label><input id="pf-old" type="password"></div><div class="form-row"><label>الجديدة</label><input id="pf-new" type="password"></div></div><button class="btn-primary" onclick="changeMyPassFromProfile()">حفظ</button> <span id="pf-msg" style="font-size:13px;margin-right:8px"></span></div>`:''}`;
  } else if(_profileTab==='perms'){
    const perms = empPerms(e);
    pane = `<p style="font-size:13px;color:var(--sub);margin:0 0 12px">${e.username==='admin'?'حساب المدير الرئيسي يملك جميع الصلاحيات.':(Array.isArray(e.perms)?'صلاحيات مخصصة لهذا الموظف.':'صلاحيات الدور: '+h(e.role||'موظف'))}</p>
      <div class="emp-chips">${PERM_SECTIONS.map(p=>`<span class="emp-chip ${perms.includes(p.key)?'':'off'}">${p.label}</span>`).join('')}</div>`;
  } else if(_profileTab==='fin'){
    const f = empFinancials(e);
    pane = `<div class="emp-fin-cards">
        <div><small>الراتب الشهري</small><b>${money(e.salary)}</b></div>
        <div><small>نسبة العمولة</small><b>${(parseFloat(e.commissionRate)||0)}%</b></div>
        <div><small>عمولات الصفقات المحصّلة</small><b style="color:#10b981">${money(f.dealEarn)}</b></div>
        <div><small>عمولات متوقعة (غير محصّلة)</small><b style="color:var(--sub)">${money(f.dealExpected)}</b></div>
        <div><small>رواتب ومكافآت مستحقة</small><b>${money(f.credits)}</b></div>
        <div><small>المصروف للموظف</small><b style="color:#ef4444">${money(f.debits)}</b></div>
        <div class="due"><small>صافي المستحقات</small><b style="color:${f.due>=0?'#b45309':'#ef4444'}">${money(f.due)}</b></div>
      </div>
      ${manage?`<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"><button class="btn-primary" style="font-size:12px;padding:7px 14px" onclick="openLedgerModal('${jsq(e.username)}','salary')">+ راتب الشهر</button><button class="btn-outline" style="font-size:12px;padding:7px 14px" onclick="openLedgerModal('${jsq(e.username)}','payment')">+ صرف / دفعة</button><button class="btn-outline" style="font-size:12px;padding:7px 14px" onclick="openLedgerModal('${jsq(e.username)}','bonus')">+ قيد آخر</button></div>`:''}
      <h4 style="margin:8px 0 4px;font-size:14px">سجل القيود</h4>
      ${f.ledger.length ? f.ledger.map(l=>{ const t = LEDGER_TYPES[l.type]||{label:l.type,sign:-1}; return `<div class="emp-led-row"><div class="lt"><b>${h(t.label)}</b>${l.note?' — '+h(l.note):''}<small>${h(l.date||'')} · ${h(l.by||'')}</small></div><b style="color:${t.sign>0?'#10b981':'#ef4444'}">${t.sign>0?'+':'−'}${money(l.amount)}</b>${manage?`<button class="btn-del" style="padding:4px 8px;font-size:11px" onclick="deleteLedgerEntry('${jsq(l.id)}')">حذف</button>`:''}</div>`; }).join('') : '<div style="color:var(--sub);font-size:13px;padding:10px 0">لا توجد قيود بعد</div>'}
      ${f.deals.length?`<h4 style="margin:16px 0 4px;font-size:14px">صفقات الموظف (${f.deals.length})</h4>${f.deals.map(d=>`<div class="emp-led-row"><div class="lt"><b>${h(d.title||d.offerName||'صفقة')}</b><small>${h(d.date||'')} · عمولة الشركة ${money(d.commission)} · المحصّل ${money(d.collectedAmount)}</small></div><b>${money((parseFloat(d.collectedAmount)||0)*(parseFloat(e.commissionRate)||0)/100)}</b></div>`).join('')}`:''}`;
  } else {
    const n = empName(e); const tasks = (typeof _allTasksCache!=='undefined' ? _allTasksCache : []).filter(t=>t.assignedTo===n);
    const done = tasks.filter(t=>t.status==='done').length; const f = empFinancials(e);
    pane = `<div class="emp-fin-cards"><div><small>المهام المسندة</small><b>${tasks.length}</b></div><div><small>المهام المنجزة</small><b style="color:#10b981">${done}</b></div>
      <div><small>نسبة الإنجاز</small><b>${tasks.length?Math.round(done/tasks.length*100):0}%</b></div><div><small>الصفقات</small><b>${f.deals.length}</b></div><div><small>الأوسمة</small><b style="color:#f59e0b">${e.rating||0} ★</b></div></div>`;
  }
  $('emp-profile-body').innerHTML = head + `<div class="emp-pane">${pane}</div>`;
}

async function changeMyPassFromProfile(){
  const msg = $('pf-msg'); const err = t=>{ msg.style.color='#ef4444'; msg.textContent=t; };
  const emp = findEmployee(_currentUser.username);
  if(!emp || !(await checkPassword(emp, $('pf-old').value))) return err('كلمة المرور الحالية غير صحيحة');
  const nw = $('pf-new').value; if(nw.length<6) return err('6 أحرف على الأقل');
  await setPassword(emp, nw);
  try{ await pushEmployee(emp); }catch(e){ return err('تعذّر الحفظ — تحقق من الاتصال'); }
  msg.style.color='#10b981'; msg.textContent='تم التغيير'; $('pf-old').value=''; $('pf-new').value='';
}

// ── ledger ──
function openLedgerModal(username, type){
  if(!canAccess('employees')) return;
  const e = findEmployee(username); if(!e) return;
  $('led-username').value = username;
  $('led-type').innerHTML = Object.entries(LEDGER_TYPES).map(([k,t])=>`<option value="${k}">${t.label}</option>`).join('');
  $('led-type').value = type; $('led-date').value = todayISO();
  const d = new Date();
  $('led-amount').value = type==='salary' && e.salary ? e.salary : '';
  $('led-note').value = type==='salary' ? `راتب شهر ${d.getMonth()+1}/${d.getFullYear()}` : '';
  $('led-to-finance').checked = true;
  $('modal-emp-ledger').classList.add('open');
}
async function saveLedgerEntry(){
  const username = $('led-username').value; const e = findEmployee(username);
  const amount = parseFloat($('led-amount').value);
  if(!e || !(amount>0)){ showToast('أدخل مبلغاً صحيحاً'); return; }
  const type = $('led-type').value; const by = (_currentUser && (_currentUser.name||_currentUser.username)) || '';
  const entry = {id:'LED-'+Date.now(), username, type, amount, date:$('led-date').value||todayISO(), note:$('led-note').value.trim(), by, _ts:Date.now()};
  ss(LEDGER_KEY, [entry, ...getLedger()]);
  try{
    await _db.collection('employee_ledger').doc(entry.id).set(entry);
    // Money paid out to the employee is also a company expense.
    if(LEDGER_TYPES[type].sign<0 && type!=='deduction' && $('led-to-finance').checked){
      const fe = {id:'FIN-E-'+entry.id, type:'expense', desc:LEDGER_TYPES[type].label+': '+empName(e)+(entry.note?' — '+entry.note:''), amount, date:entry.date, offerRef:'', receiptImg:'', author:by, _ts:Date.now()};
      ss('shark_finance', [fe, ...(gs('shark_finance')||[])]);
      await _db.collection('finance').doc(fe.id).set(fe);
    }
    showToast('تم حفظ القيد');
  }catch(err){ console.warn(err); showToast('تم الحفظ محلياً — تعذّرت المزامنة'); }
  closeModal('modal-emp-ledger'); renderEmployeeProfile(); renderEmployees();
}
async function deleteLedgerEntry(id){
  if(!canAccess('employees') || !confirm('حذف هذا القيد؟')) return;
  ss(LEDGER_KEY, getLedger().filter(l=>l.id!==id));
  const finId = 'FIN-E-'+id; ss('shark_finance', (gs('shark_finance')||[]).filter(f=>f.id!==finId));
  try{ await _db.collection('employee_ledger').doc(id).delete(); await _db.collection('finance').doc(finId).delete(); }catch(e){ showToast('تعذّر الحذف من السحابة'); }
  renderEmployeeProfile(); renderEmployees();
}

// Called by the task "award" action so ratings sync like the rest of the record.
function awardEmployee(displayName){
  const e = getEmployees().find(x=>empName(x)===displayName); if(!e) return;
  e.rating = (e.rating||0)+1;
  pushEmployee(e).catch(err=>console.warn('award sync', err));
}
