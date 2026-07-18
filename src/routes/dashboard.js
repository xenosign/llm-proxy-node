const express = require('express');
const supabase = require('../supabase/client');
const { verifyPassword, signSessionToken, SESSION_COOKIE_MAX_AGE_MS } = require('../services/auth');
const dashboardAuth = require('../middleware/dashboardAuth');

const router = express.Router();

router.post('/login', async (req, res) => {
  const { login_id: loginId, password } = req.body || {};

  if (!loginId || !password) {
    return res.status(400).json({ error: 'login_id and password are required' });
  }

  const { data: team, error } = await supabase
    .from('teams')
    .select('id, password_hash')
    .eq('login_id', loginId)
    .single();

  if (error || !team) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const passwordMatches = await verifyPassword(password, team.password_hash);
  if (!passwordMatches) {
    return res.status(401).json({ error: 'invalid_credentials' });
  }

  const token = signSessionToken(team.id, 'team');
  res.cookie('session', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: SESSION_COOKIE_MAX_AGE_MS,
  });
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('session');
  res.json({ ok: true });
});

router.get('/usage', dashboardAuth, (req, res) => {
  const { name, budget_usd: budgetUsdRaw, cost_used: costUsedRaw, tokens_used: tokensUsed, proxy_token: proxyToken } =
    req.team;
  const budgetUsd = Number(budgetUsdRaw);
  const costUsed = Number(costUsedRaw);

  res.json({
    name,
    budget_usd: budgetUsd,
    cost_used: costUsed,
    tokens_used: tokensUsed,
    remaining_usd: budgetUsd - costUsed,
    percent_used: budgetUsd > 0 ? Math.min(100, (costUsed / budgetUsd) * 100) : 0,
    proxy_token: proxyToken,
  });
});

module.exports = router;
