const express = require('express');
const supabase = require('../supabase/client');
const { verifyPassword, hashPassword, signSessionToken, SESSION_COOKIE_MAX_AGE_MS } = require('../services/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

function toTeamSummary(team) {
  const {
    id,
    name,
    login_id: loginId,
    proxy_token: proxyToken,
    token_budget: tokenBudget,
    tokens_used: tokensUsed,
  } = team;
  return {
    id,
    name,
    login_id: loginId,
    proxy_token: proxyToken,
    token_budget: tokenBudget,
    tokens_used: tokensUsed,
    remaining: tokenBudget - tokensUsed,
    percent_used: tokenBudget > 0 ? Math.min(100, (tokensUsed / tokenBudget) * 100) : 0,
  };
}

router.post('/login', async (req, res) => {
  const { login_id: loginId, password } = req.body || {};

  if (!loginId || !password) {
    return res.status(400).json({ error: 'login_id and password are required' });
  }

  const { data: admin, error } = await supabase
    .from('admins')
    .select('id, password_hash')
    .eq('login_id', loginId)
    .single();

  if (error || !admin) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const passwordMatches = await verifyPassword(password, admin.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signSessionToken(admin.id, 'admin');
  res.cookie('admin_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('admin_session');
  res.json({ ok: true });
});

router.get('/teams', adminAuth, async (req, res) => {
  const { data: teams, error } = await supabase
    .from('teams')
    .select('id, name, login_id, proxy_token, token_budget, tokens_used')
    .order('name', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'failed_to_load_teams' });
  }

  const teamSummaries = teams.map(toTeamSummary);
  const totalBudget = teamSummaries.reduce((sum, t) => sum + t.token_budget, 0);
  const totalUsed = teamSummaries.reduce((sum, t) => sum + t.tokens_used, 0);

  res.json({
    summary: {
      total_budget: totalBudget,
      total_used: totalUsed,
      remaining: totalBudget - totalUsed,
      percent_used: totalBudget > 0 ? Math.min(100, (totalUsed / totalBudget) * 100) : 0,
    },
    teams: teamSummaries,
  });
});

router.patch('/teams/:id', adminAuth, async (req, res) => {
  const { login_id: loginId, password, token_budget: tokenBudget } = req.body || {};
  const updates = {};

  if (loginId !== undefined) {
    if (!loginId) {
      return res.status(400).json({ error: 'login_id cannot be empty' });
    }
    updates.login_id = loginId;
  }

  if (password !== undefined) {
    if (!password) {
      return res.status(400).json({ error: 'password cannot be empty' });
    }
    updates.password_hash = await hashPassword(password);
  }

  if (tokenBudget !== undefined) {
    const parsedBudget = Number(tokenBudget);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      return res.status(400).json({ error: 'token_budget must be a positive number' });
    }
    updates.token_budget = parsedBudget;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  const { data: team, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, name, login_id, proxy_token, token_budget, tokens_used')
    .single();

  if (error) {
    if (error.code === '23505') {
      return res.status(409).json({ error: 'login_id already in use' });
    }
    return res.status(500).json({ error: 'failed_to_update_team' });
  }

  if (!team) {
    return res.status(404).json({ error: 'team_not_found' });
  }

  res.json(toTeamSummary(team));
});

module.exports = router;
