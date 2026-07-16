const env = require('../config/env');

function modelAllowlist(req, res, next) {
  const model = req.body && req.body.model;
  if (!model) return next();

  if (!env.allowedModels.includes(model)) {
    return res.status(404).json({
      error: {
        message: `The model \`${model}\` does not exist or you do not have access to it.`,
        type: 'invalid_request_error',
        param: 'model',
        code: 'model_not_found',
      },
    });
  }

  next();
}

module.exports = modelAllowlist;
