const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const { getUser } = require('../lib/auth');

// 提取验证码：优先匹配“验证码/code”附近的 4-8 位数字，其次 6 位数字
const extract = t => {
  const m = t.match(/(?:验证码|校验码|动态码|verification code|code)[^\d]{0,20}(\d{4,8})/i) || t.match(/\b(\d{6})\b/);
  return m && m[1];
};

async function pull(a) {
  const c = new ImapFlow({
    host: a.host || 'imap.' + a.user.split('@')[1], port: 993, secure: true, logger: false,
    auth: { user: a.user, pass: a.pass },
    clientInfo: { name: 'MailHub', version: '1.0', vendor: 'MailHub' } // 163 要求客户端发送 ID，否则报 Unsafe Login
  });
  const out = [];
  await c.connect();
  const lock = await c.getMailboxLock('INBOX');
  try {
    const uids = (await c.search({ since: new Date(Date.now() - 2 * 864e5) }, { uid: true })).slice(-30);
    if (uids.length) {
      for await (const m of c.fetch(uids, { uid: true, internalDate: true, source: { maxLength: 100000 } }, { uid: true })) {
        const p = await simpleParser(m.source);
        const code = extract((p.subject || '') + ' ' + (p.text || ''));
        if (!code) continue;
        const f = p.from && p.from.value[0];
        out.push({ id: a.user + m.uid, acct: a.user, from: (f && (f.name || f.address)) || '未知', subj: p.subject || '', code, t: +new Date(m.internalDate) });
      }
    }
  } finally { lock.release(); await c.logout(); }
  return out;
}

module.exports = async (req, res) => {
  if (!getUser(req)) return res.status(401).json({ error: 'unauth' });
  // 新增邮箱：在 Vercel 加一个名字以 MAIL_ACCOUNT_ 开头的变量，值写成  邮箱,授权码  （可选第三项 服务器地址）
  const fromEnv = Object.keys(process.env).filter(k => /^MAIL_ACCOUNT_/.test(k)).sort()
    .map(k => { const [user, pass, host] = process.env[k].split(',').map(x => x.trim()); return { user, pass, host }; })
    .filter(a => a.user && a.pass);
  const accts = [...JSON.parse(process.env.MAIL_ACCOUNTS || '[]'), ...JSON.parse(process.env.MAIL_ACCOUNTS_2 || '[]'), ...fromEnv];
  const r = await Promise.allSettled(accts.map(pull));
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    accounts: accts.map(a => a.user),
    mails: r.flatMap(x => x.status === 'fulfilled' ? x.value : []),
    errors: r.map((x, i) => x.status === 'rejected' ? accts[i].user + ' 收信失败：' + x.reason.message : null).filter(Boolean)
  });
};
