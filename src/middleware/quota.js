function quota(req, res, next) {
  const costUsed = Number(req.team.cost_used);
  const budgetUsd = Number(req.team.budget_usd);

  if (costUsed >= budgetUsd) {
    return res.status(429).json({
      error: {
        message: 'You exceeded your current quota, please check your plan and billing details.',
        type: 'insufficient_quota',
        param: null,
        code: 'insufficient_quota',
      },
    });
  }

  next();
}

module.exports = quota;
