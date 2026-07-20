const express = require('express');
const supabase = require('../supabase/client');
const env = require('../config/env');
const { verifyPassword, hashPassword, signSessionToken, SESSION_COOKIE_MAX_AGE_MS } = require('../services/auth');
const adminAuth = require('../middleware/adminAuth');

const router = express.Router();

function toTeamSummary(team) {
  const {
    id,
    name,
    login_id: loginId,
    proxy_token: proxyToken,
    budget_usd: budgetUsdRaw,
    cost_used: costUsedRaw,
    tokens_used: tokensUsed,
  } = team;
  const budgetUsd = Number(budgetUsdRaw);
  const costUsed = Number(costUsedRaw);
  const remainingUsd = budgetUsd - costUsed;
  return {
    id,
    name,
    login_id: loginId,
    proxy_token: proxyToken,
    budget_usd: budgetUsd,
    cost_used: costUsed,
    tokens_used: tokensUsed,
    remaining_usd: remainingUsd,
    budget_krw: Math.round(budgetUsd * env.usdKrwRate),
    cost_used_krw: Math.round(costUsed * env.usdKrwRate),
    remaining_krw: Math.round(remainingUsd * env.usdKrwRate),
    percent_used: budgetUsd > 0 ? Math.min(100, (costUsed / budgetUsd) * 100) : 0,
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
    .select('id, name, login_id, proxy_token, budget_usd, cost_used, tokens_used')
    .order('name', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'failed_to_load_teams' });
  }

  const teamSummaries = teams.map(toTeamSummary);
  const totalBudgetUsd = teamSummaries.reduce((sum, t) => sum + t.budget_usd, 0);
  const totalCostUsed = teamSummaries.reduce((sum, t) => sum + t.cost_used, 0);
  const totalTokensUsed = teamSummaries.reduce((sum, t) => sum + t.tokens_used, 0);
  const totalRemainingUsd = totalBudgetUsd - totalCostUsed;

  res.json({
    summary: {
      total_budget_usd: totalBudgetUsd,
      total_cost_used: totalCostUsed,
      total_tokens_used: totalTokensUsed,
      remaining_usd: totalRemainingUsd,
      total_budget_krw: Math.round(totalBudgetUsd * env.usdKrwRate),
      total_cost_used_krw: Math.round(totalCostUsed * env.usdKrwRate),
      remaining_krw: Math.round(totalRemainingUsd * env.usdKrwRate),
      usd_krw_rate: env.usdKrwRate,
      percent_used: totalBudgetUsd > 0 ? Math.min(100, (totalCostUsed / totalBudgetUsd) * 100) : 0,
    },
    teams: teamSummaries,
  });
});

router.patch('/teams/:id', adminAuth, async (req, res) => {
  const {
    login_id: loginId,
    password,
    budget_usd: budgetUsd,
    cost_used: costUsed,
    tokens_used: tokensUsed,
  } = req.body || {};
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

  if (budgetUsd !== undefined) {
    const parsedBudget = Number(budgetUsd);
    if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
      return res.status(400).json({ error: 'budget_usd must be a positive number' });
    }
    updates.budget_usd = parsedBudget;
  }

  if (costUsed !== undefined) {
    const parsedCost = Number(costUsed);
    if (!Number.isFinite(parsedCost) || parsedCost < 0) {
      return res.status(400).json({ error: 'cost_used must be a non-negative number' });
    }
    updates.cost_used = parsedCost;
  }

  if (tokensUsed !== undefined) {
    const parsedUsed = Number(tokensUsed);
    if (!Number.isFinite(parsedUsed) || parsedUsed < 0) {
      return res.status(400).json({ error: 'tokens_used must be a non-negative number' });
    }
    updates.tokens_used = parsedUsed;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'no fields to update' });
  }

  const { data: team, error } = await supabase
    .from('teams')
    .update(updates)
    .eq('id', req.params.id)
    .select('id, name, login_id, proxy_token, budget_usd, cost_used, tokens_used')
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
