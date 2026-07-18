const env = require('../config/env');

function costForUsage(model, usage) {
  const price = model && env.modelPricing[model];
  if (!price || !usage) return 0;

  const promptTokens = usage.prompt_tokens || 0;
  const completionTokens = usage.completion_tokens || 0;

  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}

module.exports = { costForUsage };
