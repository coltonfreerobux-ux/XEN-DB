const express = require('express');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const app = express();
const port = process.env.PORT || 10000;
const secret = process.env.SESSION_SECRET;
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required. Connect a Render PostgreSQL database to this web service.');
if (!secret || secret.length < 32) throw new Error('Set SESSION_SECRET to a random secret of at least 32 characters.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname)));

const blank = () => ({ owner: null, admins: [], applications: [], roles: [], staff: [], tasks: [], services: [] });
const id = () => crypto.randomUUID();
const email = value => String(value || '').trim().toLowerCase();
const hashPassword = password => {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('Password must be between 10 and 200 characters.');
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 310000, 32, 'sha256');
  return { salt: salt.toString('base64'), hash: hash.toString('base64'), iterations: 310000 };
};
const verifyPassword = (account, password) => {
  try {
    const salt = Buffer.from(account.salt, 'base64');
    const expected = Buffer.from(account.hash, 'base64');
    const actual = crypto.pbkdf2Sync(String(password), salt, account.iterations, expected.length, 'sha256');
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch { return false; }
};
const publicAccount = account => {
  if (!account) return null;
  const { salt, hash, iterations, ...safe } = account;
  return safe;
};
function publicState(data) {
  return { ...data, owner: publicAccount(data.owner), admins: data.admins.map(publicAccount), staff: data.staff.map(publicAccount), applications: data.applications.map(({ account, ...application }) => application) };
}
function cookieOptions() { return { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 }; }
function signSession(value) { const body = Buffer.from(JSON.stringify(value)).toString('base64url'); const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url'); return `${body}.${signature}`; }
function readSession(req) {
  const token = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('district_session='))?.split('=').slice(1).join('=');
  if (!token) return null;
  const [body, signature] = token.split('.'); if (!body || !signature) return null;
  const expected = crypto.createHmac('sha256', secret).update(body).digest(); let received;
  try { received = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (received.length !== expected.length || !crypto.timingSafeEqual(received, expected)) return null;
  try { const session = JSON.parse(Buffer.from(body, 'base64url').toString()); return session.expires > Date.now() ? session : null; } catch { return null; }
}
async function getState(client = pool) { const result = await client.query('SELECT data FROM app_state WHERE id = 1'); return result.rows[0]?.data || blank(); }
async function putState(data, client = pool) { await client.query('INSERT INTO app_state(id,data) VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET data=EXCLUDED.data', [JSON.stringify(data)]); }
function accountBySession(data, session) { if (!session) return null; if (session.type === 'owner' && data.owner?.email === session.email) return data.owner; if (session.type === 'admin') return data.admins.find(a => a.email === session.email) || null; if (session.type === 'staff') return data.staff.find(a => a.email === session.email) || null; return null; }
function requireUser(types = []) { return async (req, res, next) => { try { const session = readSession(req); const data = await getState(); const account = accountBySession(data, session); if (!account || (types.length && !types.includes(session.type))) return res.status(401).json({ error: 'Please sign in with an authorized account.' }); req.session = session; req.account = account; next(); } catch (error) { next(error); } }; }
const attempts = new Map();
function loginRateLimit(req, res, next) { const key = req.ip; const current = attempts.get(key) || { count: 0, reset: Date.now() + 15 * 60 * 1000 }; if (current.reset < Date.now()) { current.count = 0; current.reset = Date.now() + 15 * 60 * 1000; } if (current.count >= 20) return res.status(429).json({ error: 'Too many sign-in attempts. Please try again in 15 minutes.' }); current.count++; attempts.set(key, current); next(); }
app.get('/api/bootstrap', async (req, res, next) => { try { const data = await getState(); const session = readSession(req); const account = accountBySession(data, session); res.json({ state: publicState(data), session: account ? { type: session.type, email: session.email } : null }); } catch (e) { next(e); } });
app.post('/api/setup', async (req, res, next) => { try { const { name, email: inputEmail, password } = req.body || {}; const normalized = email(inputEmail); if (!String(name || '').trim() || !normalized.includes('@')) return res.status(400).json({ error: 'Enter a name and a valid email address.' }); const client = await pool.connect(); try { await client.query('BEGIN'); const data = await getState(client); if (data.owner) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Owner setup has already been completed.' }); } data.owner = { id: id(), name: String(name).trim(), email: normalized, ...hashPassword(password) }; await putState(data, client); await client.query('COMMIT'); res.cookie('district_session', signSession({ type: 'owner', email: normalized, expires: Date.now() + cookieOptions().maxAge }), cookieOptions()).json({ ok: true }); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } } catch (e) { next(e); } });
app.post('/api/login', loginRateLimit, async (req, res, next) => { try { const normalized = email(req.body?.email), password = String(req.body?.password || ''); const data = await getState(); const accounts = [['owner', data.owner], ...data.admins.map(a => ['admin', a]), ...data.staff.map(a => ['staff', a])]; const match = accounts.find(([, account]) => account?.email === normalized); if (!match || !verifyPassword(match[1], password)) return res.status(401).json({ error: 'Email or password not recognized.' }); const options = cookieOptions(); res.cookie('district_session', signSession({ type: match[0], email: normalized, expires: Date.now() + options.maxAge }), options).json({ ok: true, session: { type: match[0], email: normalized } }); } catch (e) { next(e); } });
app.post('/api/logout', (req, res) => res.clearCookie('district_session', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/' }).json({ ok: true }));
app.post('/api/applications', async (req, res, next) => { try { const { name, email: inputEmail, password, district, reason } = req.body || {}; const normalized = email(inputEmail); if (!String(name || '').trim() || !normalized.includes('@') || !String(district || '').trim() || !String(reason || '').trim()) return res.status(400).json({ error: 'Fill in all application fields with a valid email.' }); const client = await pool.connect(); try { await client.query('BEGIN'); const data = await getState(client); if ([data.owner, ...data.admins, ...data.staff].some(a => a?.email === normalized) || data.applications.some(a => a.email === normalized && a.status === 'Pending')) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'That email already has an account or a pending application.' }); } const account = { id: id(), name: String(name).trim(), email: normalized, ...hashPassword(password) }; data.applications.unshift({ id: id(), name: account.name, email: normalized, district: String(district).trim(), reason: String(reason).trim(), account, status: 'Pending', createdAt: new Date().toISOString() }); await putState(data, client); await client.query('COMMIT'); res.status(201).json({ ok: true }); } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); } } catch (e) { next(e); } });
app.post('/api/staff', requireUser(['admin']), async (req, res, next) => { try { const { name, email: inputEmail, password } = req.body || {}; const normalized = email(inputEmail); if (!String(name || '').trim() || !normalized.includes('@')) return res.status(400).json({ error: 'Enter a name and valid email.' }); const data = await getState(); if ([data.owner, ...data.admins, ...data.staff].some(a => a?.email === normalized)) return res.status(409).json({ error: 'An account already uses that email.' }); const roleIds = Array.isArray(req.body.roleIds) ? [...new Set(req.body.roleIds)] : []; if (roleIds.some(r => !data.roles.some(role => role.id === r))) return res.status(400).json({ error: 'Choose valid roles.' }); data.staff.push({ id: id(), name: String(name).trim(), email: normalized, ...hashPassword(password), roleIds }); await putState(data); res.status(201).json({ ok: true }); } catch (e) { next(e); } });
app.post('/api/service-requests', requireUser(['staff']), async (req, res, next) => { try { const data = await getState(); const service = data.services.find(s => s.id === req.body?.serviceId); if (!service || (service.roleIds.length && !service.roleIds.some(r => req.account.roleIds.includes(r)))) return res.status(404).json({ error: 'That service is unavailable for your account.' }); data.tasks.unshift({ id: id(), title: `${service.name} — ${req.account.name}`, description: String(req.body.description || '').slice(0, 5000), roleIds: service.roleIds, createdAt: new Date().toISOString(), status: 'Open', kind: 'service' }); await putState(data); res.status(201).json({ ok: true }); } catch (e) { next(e); } });
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
app.put('/api/state', requireUser(['owner', 'admin', 'staff']), async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('SELECT data FROM app_state WHERE id=1 FOR UPDATE');
    const stored = result.rows[0]?.data || blank();
    const candidate = req.body;
    if (!candidate || !Array.isArray(candidate.applications) || !Array.isArray(candidate.roles) || !Array.isArray(candidate.tasks) || !Array.isArray(candidate.services)) throw Object.assign(new Error('Invalid workspace update.'), { status: 400 });
    if (req.session.type === 'owner') {
      if (!same(publicAccount(stored.owner), candidate.owner) || !same(stored.roles, candidate.roles) || !same(stored.staff.map(publicAccount), candidate.staff) || !same(stored.tasks, candidate.tasks) || !same(stored.services, candidate.services) || candidate.applications.length !== stored.applications.length) throw Object.assign(new Error('Owner updates can only review applications.'), { status: 403 });
      for (let i=0;i<stored.applications.length;i++) { const before=stored.applications[i], after=candidate.applications.find(a=>a.id===before.id); if (!after || after.name!==before.name || after.email!==before.email || after.district!==before.district || after.reason!==before.reason || after.createdAt!==before.createdAt || !['Pending','Approved','Denied'].includes(after.status) || (before.status!=='Pending'&&after.status!==before.status)) throw Object.assign(new Error('Invalid application review.'), { status: 403 }); if(before.status==='Pending'&&after.status!=='Pending'){before.status=after.status;before.reviewedAt=new Date().toISOString();if(after.status==='Approved')stored.admins.push({...before.account,approvedAt:before.reviewedAt,district:before.district});} }
    } else if (req.session.type === 'admin') {
      if (!same(publicAccount(stored.owner),candidate.owner) || !same(stored.admins.map(publicAccount),candidate.admins) || !same(stored.applications.map(({account,...a})=>a),candidate.applications) || candidate.staff.length!==stored.staff.length || candidate.staff.some(x=>!stored.staff.some(s=>s.id===x.id&&s.email===x.email&&s.name===x.name))) throw Object.assign(new Error('Invalid admin workspace update.'), { status: 403 });
      const validRoleIds=new Set(candidate.roles.map(r=>r.id)); if(candidate.staff.some(s=>!Array.isArray(s.roleIds)||s.roleIds.some(r=>!validRoleIds.has(r)))||candidate.tasks.some(t=>!Array.isArray(t.roleIds)||t.roleIds.some(r=>!validRoleIds.has(r)))||candidate.services.some(s=>!Array.isArray(s.roleIds)||s.roleIds.some(r=>!validRoleIds.has(r))))throw Object.assign(new Error('Tasks, staff, and services must use existing roles.'),{status:400});
      stored.roles=candidate.roles;stored.tasks=candidate.tasks;stored.services=candidate.services;stored.staff=stored.staff.map(s=>({...s,roleIds:candidate.staff.find(x=>x.id===s.id).roleIds}));
    } else {
      if(!same(publicAccount(stored.owner),candidate.owner)||!same(stored.admins.map(publicAccount),candidate.admins)||!same(stored.applications.map(({account,...a})=>a),candidate.applications)||!same(stored.roles,candidate.roles)||!same(stored.services,candidate.services)||!same(stored.staff.map(publicAccount),candidate.staff)||candidate.tasks.length!==stored.tasks.length)throw Object.assign(new Error('Staff can only update their task status.'),{status:403});
      for(const task of stored.tasks){const update=candidate.tasks.find(t=>t.id===task.id);if(!update||!same({...task,status:undefined},{...update,status:undefined})||!['Open','Done'].includes(update.status)||(!task.roleIds.length&&!update.roleIds.length?false:!task.roleIds.some(r=>(req.account.roleIds||[]).includes(r))))throw Object.assign(new Error('You can only complete tasks assigned to your roles.'),{status:403});task.status=update.status;}
    }
    await putState(stored,client);await client.query('COMMIT');res.json({ok:true,state:publicState(stored)});
  } catch(e) { await client.query('ROLLBACK').catch(()=>{});next(e); } finally {client.release();}
});
app.get('*', (req,res,next)=>{ if(req.path.startsWith('/api/'))return res.status(404).json({error:'Not found'});res.sendFile(path.join(__dirname,'index.html'),err=>err&&next(err)); });
app.use((err,req,res,next)=>{ console.error(err);res.status(err.status||500).json({error:err.status?err.message:'Server error. Check the service logs.'}); });
(async()=>{ await pool.query('CREATE TABLE IF NOT EXISTS app_state (id integer PRIMARY KEY CHECK (id=1), data jsonb NOT NULL)'); await pool.query('INSERT INTO app_state(id,data) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING',[JSON.stringify(blank())]); app.listen(port,()=>console.log(`District Desk listening on ${port}`)); })().catch(error=>{console.error('Database startup failed:',error);process.exit(1);});
