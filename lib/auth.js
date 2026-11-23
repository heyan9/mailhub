const crypto = require('crypto');
const mac = p => crypto.createHmac('sha256', process.env.SESSION_SECRET).update(p).digest('base64url');
function sign(obj) { const p = Buffer.from(JSON.stringify(obj)).toString('base64url'); return p + '.' + mac(p); }
function cookies(req) {
  return Object.fromEntries((req.headers.cookie || '').split(';').filter(Boolean).map(c => {
    const i = c.indexOf('='); return [c.slice(0, i).trim(), c.slice(i + 1).trim()];
  }));
}
function getUser(req) {
  const t = cookies(req).session; if (!t) return null;
  const [p, s] = t.split('.'); if (!p || !s) return null;
  const e = mac(p);
  if (s.length !== e.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(e))) return null;
  const o = JSON.parse(Buffer.from(p, 'base64url').toString());
  const ok = o.exp > Date.now() && o.u.toLowerCase() === (process.env.ALLOWED_GITHUB_USER || '').toLowerCase();
  return ok ? o.u : null;
}
module.exports = { sign, cookies, getUser };
