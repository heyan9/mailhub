const { sign, cookies } = require('../lib/auth');
module.exports = async (req, res) => {
  const q = new URL(req.url, 'http://x').searchParams;
  if (!q.get('code') || q.get('state') !== cookies(req).oauth_state) return res.status(400).send('登录校验失败，请返回重试');
  const t = await (await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: process.env.GITHUB_CLIENT_ID, client_secret: process.env.GITHUB_CLIENT_SECRET, code: q.get('code') })
  })).json();
  const u = await (await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${t.access_token}`, 'User-Agent': 'mailhub' } })).json();
  if (!u.login || u.login.toLowerCase() !== (process.env.ALLOWED_GITHUB_USER || '').toLowerCase()) return res.status(403).send('此 GitHub 账号无权访问');
  const tok = sign({ u: u.login, exp: Date.now() + 30 * 864e5 });
  res.setHeader('Set-Cookie', `session=${tok}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=2592000`);
  res.writeHead(302, { Location: '/' }); res.end();
};
