require('dotenv').config();

const required = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DEFAULT_ALLOWED_MODELS = ['gpt-5-nano', 'gpt-4o-mini'];

// USD per 1M tokens. Verify against https://openai.com/api/pricing before relying
// on these for real billing - override/extend via MODEL_PRICING env var.
const DEFAULT_MODEL_PRICING = {
  'gpt-5-nano': { input: 0.05, output: 0.4 },
  'gpt-4o-mini': { input: 0.15, output: 0.6 },
};

function parseModelPricing() {
  if (!process.env.MODEL_PRICING) return DEFAULT_MODEL_PRICING;

  let parsed;
  try {
    parsed = JSON.parse(process.env.MODEL_PRICING);
  } catch {
    throw new Error(
      'MODEL_PRICING must be valid JSON, e.g. {"gpt-4o-mini":{"input":0.15,"output":0.6}} (USD per 1M tokens)'
    );
  }

  return { ...DEFAULT_MODEL_PRICING, ...parsed };
}

const allowedModels = process.env.ALLOWED_MODELS
  ? process.env.ALLOWED_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
  : DEFAULT_ALLOWED_MODELS;

const modelPricing = parseModelPricing();

for (const model of allowedModels) {
  const price = modelPricing[model];
  if (!price || typeof price.input !== 'number' || typeof price.output !== 'number') {
    throw new Error(
      `No pricing configured for allowed model "${model}". Add it to MODEL_PRICING (USD per 1M tokens), e.g. {"${model}":{"input":0.15,"output":0.6}}`
    );
  }
}

module.exports = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: process.env.JWT_SECRET,
  allowedModels,
  modelPricing,
};
