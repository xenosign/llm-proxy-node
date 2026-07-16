const supabase = require('../supabase/client');
const { verifySessionToken } = require('../services/auth');

async function dashboardAuth(req, res, next) {
  const token = req.cookies && req.cookies.session;
  if (!token) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  let payload;
  try {
    payload = verifySessionToken(token);
  } catch {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  if (payload.role !== 'team') {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  const { data: team, error } = await supabase
    .from('teams')
    .select('id, name, token_budget, tokens_used')
    .eq('id', payload.sub)
    .single();

  if (error || !team) {
    return res.status(401).json({ error: 'not_authenticated' });
  }

  req.team = team;
  next();
}

module.exports = dashboardAuth;
