function quota(req, res, next) {
  const { tokens_used, token_budget } = req.team;

  if (tokens_used >= token_budget) {
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
