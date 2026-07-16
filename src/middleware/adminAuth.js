const supabase = require('../supabase/client');
const { verifySessionToken } = require('../services/auth');

async function adminAuth(req, res, next) {
  const token = req.cookies && req.cookies.admin_session;
  if (!token) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  if (payload.role !== 'admin') {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, login_id')
    .eq('id', payload.sub)
    .single();

  if (error || !admin) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  req.admin = admin;
  next();
}

module.exports = adminAuth;
