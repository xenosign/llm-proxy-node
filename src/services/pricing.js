const env = require('../config/env');

function costForUsage(model, usage) {
  const price = model && env.modelPricing[model];
  if (!price || !usage) return 0;

  // Chat Completions uses prompt_tokens/completion_tokens; Responses API uses input_tokens/output_tokens
  const promptTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const completionTokens = usage.completion_tokens || usage.output_tokens || 0;

  return (promptTokens / 1_000_000) * price.input + (completionTokens / 1_000_000) * price.output;
}

module.exports = { costForUsage };
