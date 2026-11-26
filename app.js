const STORAGE_KEY = 'district-desk-demo-v1';
const SESSION_KEY = 'district-desk-session-v1';
const app = document.querySelector('#app');
let state = loadState();
let session = readSession();

function loadState() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || freshState(); }
  catch { return freshState(); }
}
function freshState() { return { owner: null, admins: [], applications: [], roles: [], staff: [], tasks: [], services: [] }; }
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function readSession() { try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; } }
function setSession(user) { session = user; sessionStorage.setItem(SESSION_KEY, JSON.stringify(user)); }
function clearSession() { session = null; sessionStorage.removeItem(SESSION_KEY); }
function id() { return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`; }
function esc(value = '') { return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function date(value) { return new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function currentUser() {
  if (!session) return null;
  if (session.type === 'owner') return state.owner?.email === session.email ? state.owner : null;
  if (session.type === 'admin') return state.admins.find(x => x.email === session.email) || null;
  if (session.type === 'staff') return state.staff.find(x => x.email === session.email) || null;
  return null;
}
function roleNames(user) { return (user?.roleIds || []).map(roleId => state.roles.find(r => r.id === roleId)?.name).filter(Boolean); }
function badge(text, kind = '') { return `<span class="badge ${kind}">${esc(text)}</span>`; }
function logo() { return '<div class="brand-mark">D</div><div><strong>District Desk</strong><small>Operations portal</small></div>'; }
function layout(content, active = '') {
  const user = currentUser();
  const role = session?.type === 'owner' ? 'Platform owner' : session?.type === 'admin' ? 'District admin' : 'Staff member';
  app.innerHTML = `<header class="topbar"><a class="brand" href="#" data-action="home">${logo()}</a><div class="topbar-right"><span class="user-chip"><span class="avatar">${esc((user?.name || 'U').slice(0,1).toUpperCase())}</span><span><b>${esc(user?.name || 'User')}</b><small>${role}</small></span></span><button class="button button-quiet button-small" data-action="logout">Sign out</button></div></header><main class="workspace"><aside class="sidebar"><div class="side-label">WORKSPACE</div>${(session?.type === 'owner' ? [['overview','Overview'],['applications','Applications'],['admins','District admins']] : session?.type === 'admin' ? [['overview','Overview'],['tasks','Tasks'],['staff','Staff accounts'],['roles','Roles'],['services','Service forms']] : [['overview','My tasks'],['services','Services']]).map(([key,label]) => `<button class="nav-item ${active===key?'active':''}" data-view="${key}"><span class="nav-icon">${navIcon(key)}</span>${label}${key==='applications'&&state.applications.some(a=>a.status==='Pending')?`<span class="nav-count">${state.applications.filter(a=>a.status==='Pending').length}</span>`:''}</button>`).join('')}<div class="sidebar-note"><span class="note-icon">ⓘ</span><p>This is a local demo. Data is saved only in this browser.</p></div></aside><section class="main-content">${content}</section></main>`;
}
function navIcon(key) { return ({overview:'⌂',applications:'▤',admins:'♙',tasks:'☑',staff:'♧',roles:'◈',services:'▣'})[key] || '•'; }
function heading(eyebrow, title, text, action='') { return `<div class="page-heading"><div><div class="eyebrow">${esc(eyebrow)}</div><h1>${esc(title)}</h1><p>${esc(text)}</p></div>${action}</div>`; }
function ownerSetup() {
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><div class="brand auth-brand">${logo()}</div><div class="eyebrow">FIRST-TIME SETUP</div><h1>Create owner account</h1><p class="muted">Set up the account that reviews district admin applications. This demo stores data in this browser only.</p><form id="owner-form" class="form-stack"><label>Owner name<input name="name" required autocomplete="name" placeholder="Your name"></label><label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@district.org"></label><label>Password<input name="password" type="password" required minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></label><button class="button button-primary" type="submit">Set up owner account <span>→</span></button></form><div class="security-note">For real multi-user use, connect a secure server and authentication provider. Browser storage is not production security.</div></section></main>`;
  document.querySelector('#owner-form').addEventListener('submit', async e => { e.preventDefault(); const f = new FormData(e.currentTarget); const account = await makeAccount(f.get('name'), f.get('email'), f.get('password')); state.owner = account; save(); setSession({type:'owner',email:account.email}); render(); });
}
async function makeAccount(name,email,password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2',salt,iterations:120000,hash:'SHA-256'},key,256);
  return { id:id(), name:String(name).trim(), email:String(email).trim().toLowerCase(), salt:Array.from(salt), hash:Array.from(new Uint8Array(bits)) };
}
async function verify(account,password) {
  if (!account?.salt || !account?.hash) return false;
  const key = await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:new Uint8Array(account.salt),iterations:120000,hash:'SHA-256'},key,256));
  return account.hash.length === bits.length && account.hash.every((v,i)=>v===bits[i]);
}
function authPage(tab='login', message='') {
  const signup = tab === 'apply';
  app.innerHTML = `<main class="auth-page"><section class="auth-card"><a class="brand auth-brand" href="#" data-action="home">${logo()}</a><div class="eyebrow">WELCOME TO YOUR WORKSPACE</div><h1>${signup?'Apply as a district admin':'Sign in'}</h1><p class="muted">${signup?'Send an application to the platform owner for approval.':'Sign in to your district workspace.'}</p>${message?`<div class="alert">${esc(message)}</div>`:''}<div class="auth-tabs"><button class="${!signup?'selected':''}" data-auth="login">Sign in</button><button class="${signup?'selected':''}" data-auth="apply">Admin application</button></div>${signup?`<form id="apply-form" class="form-stack"><label>Full name<input name="name" required autocomplete="name" placeholder="Your name"></label><label>Email address<input name="email" type="email" required autocomplete="email" placeholder="you@district.org"></label><label>Create password<input name="password" type="password" minlength="8" required autocomplete="new-password" placeholder="At least 8 characters"></label><label>District / organization<input name="district" required placeholder="District name"></label><label>Why are you applying?<textarea name="reason" rows="3" required placeholder="Tell the owner a little about your request"></textarea></label><button class="button button-primary" type="submit">Submit application <span>→</span></button></form>`:`<form id="login-form" class="form-stack"><label>Email address<input name="email" type="email" required autocomplete="username" placeholder="you@district.org"></label><label>Password<input name="password" type="password" required autocomplete="current-password" placeholder="Your password"></label><button class="button button-primary" type="submit">Sign in <span>→</span></button></form><button class="text-link" data-auth="apply">Need district admin access? Apply here</button>`}<div class="security-note">Demo mode: accounts and workflows are stored in this browser, not shared across devices. Do not use real or sensitive information.</div></section></main>`;
  document.querySelector('[data-auth="login"]')?.addEventListener('click',()=>authPage('login'));
  document.querySelectorAll('[data-auth="apply"]').forEach(b=>b.addEventListener('click',()=>authPage('apply')));
  document.querySelector('#apply-form')?.addEventListener('submit',submitApplication);
  document.querySelector('#login-form')?.addEventListener('submit',login);
}
async function submitApplication(e) {
  e.preventDefault(); const f=new FormData(e.currentTarget), email=String(f.get('email')).trim().toLowerCase();
  if ([state.owner,...state.admins,...state.staff].some(x=>x?.email===email) || state.applications.some(a=>a.email===email&&a.status==='Pending')) { authPage('apply','That email already has an account or a pending application.'); return; }
  const account=await makeAccount(f.get('name'),email,f.get('password'));
  state.applications.unshift({id:id(),name:account.name,email,district:String(f.get('district')).trim(),reason:String(f.get('reason')).trim(),account,status:'Pending',createdAt:new Date().toISOString()}); save();
  authPage('login','Application submitted. The platform owner can now review it.');
}
async function login(e) {
  e.preventDefault(); const f=new FormData(e.currentTarget), email=String(f.get('email')).trim().toLowerCase(), password=String(f.get('password'));
  const accounts=[['owner',state.owner],...state.admins.map(a=>['admin',a]),...state.staff.map(a=>['staff',a])];
  const match=accounts.find(([,a])=>a?.email===email);
  if(match&&await verify(match[1],password)){setSession({type:match[0],email});render();return;}
  const pending=state.applications.some(a=>a.email===email&&a.status==='Pending'); authPage('login',pending?'Your application is awaiting owner approval.':'Email or password not recognized.');
}
function render() {
  if (!state.owner) return ownerSetup();
  const user=currentUser(); if (!user) { clearSession(); return authPage(); }
  const view=new URLSearchParams(location.hash.slice(1)).get('view')||'overview';
  if(session.type==='owner') return renderOwner(view);
  if(session.type==='admin') return renderAdmin(view);
  return renderStaff(view);
}
function metrics(items,label,icon,color) { return `<div class="metric-card"><div class="metric-top"><span>${esc(label)}</span><span class="metric-icon ${color}">${icon}</span></div><strong>${items}</strong></div>`; }
function renderOwner(view) {
  if(!['overview','applications','admins'].includes(view)) view='overview';
  if(view==='applications') {
    const pending=state.applications.filter(a=>a.status==='Pending');
    const body=pending.length?pending.map(a=>`<article class="request-card"><div class="request-head"><div><h3>${esc(a.name)}</h3><span class="muted">${esc(a.email)} · ${esc(a.district)}</span></div>${badge('Pending','badge-pending')}</div><p>${esc(a.reason)}</p><div class="request-foot"><span class="muted">Submitted ${date(a.createdAt)}</span><div class="button-row"><button class="button button-secondary" data-decision="deny" data-id="${a.id}">Deny</button><button class="button button-primary" data-decision="approve" data-id="${a.id}">Approve application</button></div></div></article>`).join(''):'<div class="empty-state"><span>✓</span><h3>All caught up</h3><p>No pending applications to review.</p></div>';
    return layout(`${heading('OWNER CONSOLE','Admin applications','Review requests for district admin access.')}${body}`,'applications');
  }
  if(view==='admins') return layout(`${heading('OWNER CONSOLE','District admins','Approved district administrators.')}<div class="panel">${state.admins.length?`<div class="table-wrap"><table><thead><tr><th>NAME</th><th>EMAIL</th><th>APPROVED</th></tr></thead><tbody>${state.admins.map(a=>`<tr><td><b>${esc(a.name)}</b></td><td>${esc(a.email)}</td><td>${date(a.approvedAt)}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><span>♙</span><h3>No district admins yet</h3><p>Approved applications will appear here.</p></div>'}</div>`,'admins');
  return layout(`${heading('OWNER CONSOLE','Good ${esc(userFirst(state.owner.name))}, welcome back','Manage district access and review new applications.')}<div class="metrics">${metrics(state.applications.filter(a=>a.status==='Pending').length,'Pending applications','▤','purple')}${metrics(state.admins.length,'District admins','♙','blue')}${metrics(state.applications.filter(a=>a.status==='Denied').length,'Declined requests','↘','orange')}</div><div class="section-heading"><div><h2>Needs your attention</h2><p>District admin applications awaiting a decision.</p></div><button class="button button-secondary" data-view="applications">View applications <span>→</span></button></div>${state.applications.filter(a=>a.status==='Pending').length?state.applications.filter(a=>a.status==='Pending').slice(0,3).map(a=>`<article class="compact-card"><span class="avatar avatar-purple">${esc(a.name.slice(0,1).toUpperCase())}</span><div class="compact-main"><b>${esc(a.name)}</b><small>${esc(a.district)} · ${esc(a.email)}</small></div>${badge('Pending','badge-pending')}<button class="button button-small button-secondary" data-view="applications">Review</button></article>`).join(''):'<div class="empty-state"><span>✓</span><h3>No pending requests</h3><p>New applications will show up here.</p></div>'}`,'overview');
}
function userFirst(name){return String(name||'').split(' ')[0];}
function renderAdmin(view) {
  if(!['overview','tasks','staff','roles','services'].includes(view)) view='overview';
  const admin=currentUser();
  if(view==='staff') return layout(`${heading('TEAM MANAGEMENT','Staff accounts','Create sign-in accounts and assign each person to roles.','<button class="button button-primary" data-modal="staff">＋ Add staff</button>')}<div class="panel">${state.staff.length?`<div class="table-wrap"><table><thead><tr><th>STAFF MEMBER</th><th>EMAIL</th><th>ASSIGNED ROLES</th></tr></thead><tbody>${state.staff.map(s=>`<tr><td><b>${esc(s.name)}</b></td><td>${esc(s.email)}</td><td>${roleNames(s).map(r=>badge(r)).join(' ')||'<span class="muted">No role assigned</span>'}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty-state"><span>♧</span><h3>No staff accounts yet</h3><p>Create a staff login and assign one or more roles.</p><button class="button button-primary" data-modal="staff">Add staff account</button></div>'}</div>`,'staff');
  if(view==='roles') return layout(`${heading('TEAM MANAGEMENT','Roles','Create roles to organize staff and target tasks or services.','<button class="button button-primary" data-modal="role">＋ Create role</button>')}<div class="role-grid">${state.roles.map(r=>`<article class="role-card"><div class="role-icon">◈</div><h3>${esc(r.name)}</h3><p>${esc(r.description||'No description added.')}</p><div class="role-foot"><span class="muted">${state.staff.filter(s=>s.roleIds.includes(r.id)).length} staff</span><span class="role-dot"></span></div></article>`).join('')||'<div class="empty-state full-span"><span>◈</span><h3>No roles created</h3><p>Create roles such as Reception, Maintenance, or Teaching.</p><button class="button button-primary" data-modal="role">Create first role</button></div>'}</div>`,'roles');
  if(view==='tasks') return layout(`${heading('WORK QUEUE','Tasks','Create tasks for a specific team role.','<button class="button button-primary" data-modal="task">＋ Create task</button>')}${taskList(state.tasks, null, true)}`,'tasks');
  if(view==='services') return layout(`${heading('STAFF TOOLS','Service forms','Create forms staff can open. Submissions become role-targeted tasks.','<button class="button button-primary" data-modal="service">＋ Create service</button>')}<div class="service-grid">${state.services.map(s=>`<article class="service-card"><div class="service-icon">▣</div><div class="service-content"><h3>${esc(s.name)}</h3><p>${esc(s.description||'Staff service form')}</p><div>${s.roleIds.map(r=>state.roles.find(x=>x.id===r)?.name).filter(Boolean).map(n=>badge(n)).join(' ')||badge('All staff')}</div></div><button class="button button-small button-secondary" data-service-edit="${s.id}">Edit form</button></article>`).join('')||'<div class="empty-state full-span"><span>▣</span><h3>No service forms yet</h3><p>Create a simple form staff can submit as a task.</p><button class="button button-primary" data-modal="service">Create a service</button></div>'}</div>`,'services');
  return layout(`${heading('DISTRICT WORKSPACE',`Welcome, ${userFirst(admin.name)}`,'Here is what is happening across your team.','<button class="button button-primary" data-modal="task">＋ Create task</button>')}<div class="metrics">${metrics(state.staff.length,'Staff accounts','♧','blue')}${metrics(state.roles.length,'Team roles','◈','purple')}${metrics(state.tasks.filter(t=>t.status!=='Done').length,'Open tasks','☑','orange')}${metrics(state.services.length,'Service forms','▣','green')}</div><div class="section-heading"><div><h2>Recent tasks</h2><p>Work created for your staff teams.</p></div><button class="button button-secondary" data-view="tasks">All tasks <span>→</span></button></div>${taskList(state.tasks.slice(0,4),null,false)}`,'overview');
}
function taskList(tasks,staff,canManage) {
  const visible=staff?tasks.filter(t=>!t.roleIds.length||t.roleIds.some(r=>staff.roleIds.includes(r))):tasks;
  if(!visible.length)return '<div class="empty-state"><span>☑</span><h3>No tasks here</h3><p>Tasks assigned to your roles will appear here.</p></div>';
  return `<div class="task-list">${visible.map(t=>`<article class="task-card"><div class="task-check ${t.status==='Done'?'is-done':''}" ${staff?`data-toggle-task="${t.id}"`:''}>${t.status==='Done'?'✓':''}</div><div class="task-info"><div class="task-title-row"><h3>${esc(t.title)}</h3>${badge(t.status,t.status==='Done'?'badge-done':'badge-open')}</div><p>${esc(t.description)}</p><div class="task-meta"><span>◷ ${date(t.createdAt)}</span><span>◈ ${t.roleIds.map(r=>state.roles.find(x=>x.id===r)?.name).filter(Boolean).map(esc).join(', ')||'All staff'}</span>${t.kind==='service'?badge('Service request','badge-service'):''}</div></div>${canManage?`<button class="icon-button" title="Delete task" data-delete-task="${t.id}">×</button>`:''}</article>`).join('')}</div>`;
}
function renderStaff(view) {
  const staff=currentUser();
  if(view==='services') return layout(`${heading('STAFF TOOLS','Available services','Open a service form to submit a request.')}<div class="service-grid">${state.services.filter(s=>!s.roleIds.length||s.roleIds.some(r=>staff.roleIds.includes(r))).map(s=>`<article class="service-card"><div class="service-icon">▣</div><div class="service-content"><h3>${esc(s.name)}</h3><p>${esc(s.description||'Submit a request to your district admin.')}</p></div><button class="button button-primary button-small" data-open-service="${s.id}">Open form <span>→</span></button></article>`).join('')||'<div class="empty-state full-span"><span>▣</span><h3>No services available</h3><p>Your district admin has not published a service for your roles yet.</p></div>'}</div>`,'services');
  return layout(`${heading('YOUR WORKSPACE',`Hello, ${userFirst(staff.name)}`,'Tasks assigned to your team roles appear here.','<button class="button button-secondary" data-view="services">Browse services <span>→</span></button>')}<div class="staff-welcome">${roleNames(staff).length?`<span class="muted">YOUR ROLES</span><div>${roleNames(staff).map(r=>badge(r)).join(' ')}</div>`:'<span class="muted">No roles assigned yet. Ask your district admin to assign you to a team.</span>'}</div>${taskList(state.tasks,staff,false)}`,'overview');
}
function modal(title,content) { document.querySelector('.modal-backdrop')?.remove(); document.body.insertAdjacentHTML('beforeend',`<div class="modal-backdrop" data-close-modal><section class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><button class="modal-close" aria-label="Close" data-close-modal>×</button><div class="eyebrow">DISTRICT WORKSPACE</div><h2 id="modal-title">${esc(title)}</h2>${content}</section></div>`); document.querySelector('.modal-backdrop').addEventListener('click',e=>{if(e.target.hasAttribute('data-close-modal'))document.querySelector('.modal-backdrop').remove();}); }
function roleChecks(name='roleIds', selected=[]) { return state.roles.length?`<div class="check-list">${state.roles.map(r=>`<label class="check-option"><input type="checkbox" name="${name}" value="${r.id}" ${selected.includes(r.id)?'checked':''}><span><b>${esc(r.name)}</b><small>${esc(r.description||'')}</small></span></label>`).join('')}</div>`:'<p class="inline-hint">No roles yet. Create a role first, or leave this blank to target all staff.</p>'; }
function openModal(type,serviceId) {
  if(type==='role') modal('Create a role',`<form id="modal-form" class="form-stack"><label>Role name<input name="name" required placeholder="e.g. Front desk"></label><label>Description <span class="optional">Optional</span><textarea name="description" rows="3" placeholder="What does this team handle?"></textarea></label><button class="button button-primary" type="submit">Create role</button></form>`);
  if(type==='staff') modal('Add staff account',`<p class="muted modal-intro">Create login details for a team member and select their roles.</p><form id="modal-form" class="form-stack"><label>Staff member name<input name="name" required></label><label>Email address<input name="email" type="email" required></label><label>Temporary password<input name="password" type="password" minlength="8" required><small>Share this securely with the staff member.</small></label><label>Assign roles</label>${roleChecks()}<button class="button button-primary" type="submit">Create staff account</button></form>`);
  if(type==='task') modal('Create a task',`<form id="modal-form" class="form-stack"><label>Task title<input name="title" required placeholder="What needs to be done?"></label><label>Description<textarea name="description" rows="3" placeholder="Add details for the team"></textarea></label><label>Show to these roles <span class="optional">Leave blank for everyone</span></label>${roleChecks()}<button class="button button-primary" type="submit">Create task</button></form>`);
  if(type==='service') { const existing=state.services.find(s=>s.id===serviceId); modal(existing?'Edit service form':'Create a service form',`<p class="muted modal-intro">Staff will see this service and can submit a request. Each request becomes a task for the selected roles.</p><form id="modal-form" data-service-id="${existing?.id||''}" class="form-stack"><label>Service name<input name="name" required value="${esc(existing?.name||'')}" placeholder="e.g. Request building maintenance"></label><label>Description<textarea name="description" rows="2" placeholder="What is this service for?">${esc(existing?.description||'')}</textarea></label><label>Request form fields <span class="optional">One field per line</span><textarea name="fields" rows="3" placeholder="Location\nDetails">${esc((existing?.fields||['Details']).join('\n'))}</textarea></label><label>Available to these roles <span class="optional">Leave blank for all staff</span></label>${roleChecks('roleIds',existing?.roleIds||[])}<button class="button button-primary" type="submit">${existing?'Save changes':'Publish service'}</button></form>`); }
  if(type==='submit-service') { const service=state.services.find(s=>s.id===serviceId); if(!service)return; modal(service.name,`<p class="muted modal-intro">${esc(service.description||'Fill in the details to send a request to your district team.')}</p><form id="modal-form" data-service-submit="${service.id}" class="form-stack">${(service.fields||['Details']).map((field,i)=>`<label>${esc(field)}<textarea name="field${i}" rows="3" ${i===0?'required':''} placeholder="Enter ${esc(field.toLowerCase())}"></textarea></label>`).join('')}<button class="button button-primary" type="submit">Submit request</button></form>`); }
}
app.addEventListener('click',async e=>{
  const auth=e.target.closest('[data-action="home"]'); if(auth){e.preventDefault();render();return;}
  if(e.target.closest('[data-action="logout"]')){clearSession();authPage();return;}
  const nav=e.target.closest('[data-view]'); if(nav){location.hash=`view=${nav.dataset.view}`;render();return;}
  const m=e.target.closest('[data-modal]');if(m){openModal(m.dataset.modal);return;}
  const edit=e.target.closest('[data-service-edit]');if(edit){openModal('service',edit.dataset.serviceEdit);return;}
  const open=e.target.closest('[data-open-service]');if(open){openModal('submit-service',open.dataset.openService);return;}
  const decision=e.target.closest('[data-decision]');if(decision){const application=state.applications.find(a=>a.id===decision.dataset.id);if(!application)return;application.status=decision.dataset.decision==='approve'?'Approved':'Denied';application.reviewedAt=new Date().toISOString();if(application.status==='Approved')state.admins.push({...application.account,approvedAt:application.reviewedAt,district:application.district});save();render();return;}
  const del=e.target.closest('[data-delete-task]');if(del){state.tasks=state.tasks.filter(t=>t.id!==del.dataset.deleteTask);save();render();return;}
  const toggle=e.target.closest('[data-toggle-task]');if(toggle){const task=state.tasks.find(t=>t.id===toggle.dataset.toggleTask);if(task){task.status=task.status==='Done'?'Open':'Done';save();render();}return;}
});
app.addEventListener('submit',async e=>{
  if(e.target.id!=='modal-form')return;e.preventDefault();const f=new FormData(e.target), type=e.target.dataset.serviceSubmit, serviceId=e.target.dataset.serviceId;
  if(type){const service=state.services.find(s=>s.id===type), staff=currentUser();const details=(service.fields||['Details']).map((field,i)=>`${field}: ${String(f.get(`field${i}`)||'').trim()}`).join(' · ');state.tasks.unshift({id:id(),title:`${service.name} — ${staff.name}`,description:details,roleIds:service.roleIds,createdAt:new Date().toISOString(),status:'Open',kind:'service'});save();document.querySelector('.modal-backdrop').remove();render();return;}
  if(serviceId){const service=state.services.find(s=>s.id===serviceId);Object.assign(service,{name:String(f.get('name')).trim(),description:String(f.get('description')).trim(),fields:String(f.get('fields')||'Details').split('\n').map(x=>x.trim()).filter(Boolean),roleIds:f.getAll('roleIds')});}
  else if(e.target.querySelector('[name="title"]')) state.tasks.unshift({id:id(),title:String(f.get('title')).trim(),description:String(f.get('description')).trim(),roleIds:f.getAll('roleIds'),createdAt:new Date().toISOString(),status:'Open',kind:'task'});
  else if(e.target.querySelector('[name="email"]')) {const email=String(f.get('email')).trim().toLowerCase();if([...state.staff,...state.admins,state.owner].some(x=>x?.email===email)){alert('An account already uses that email.');return;}const account=await makeAccount(f.get('name'),email,f.get('password'));state.staff.push({...account,roleIds:f.getAll('roleIds')});}
  else if(e.target.querySelector('[name="name"]')) state.roles.push({id:id(),name:String(f.get('name')).trim(),description:String(f.get('description')).trim()});
  else {const fields=String(f.get('fields')||'Details').split('\n').map(x=>x.trim()).filter(Boolean);state.services.push({id:id(),name:String(f.get('name')).trim(),description:String(f.get('description')).trim(),fields,roleIds:f.getAll('roleIds')});}
  save();document.querySelector('.modal-backdrop')?.remove();render();
});
window.addEventListener('hashchange',render);
render();
