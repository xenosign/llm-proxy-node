require('dotenv').config();

const required = ['OPENAI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

const DEFAULT_ALLOWED_MODELS = ['gpt-5-nano', 'gpt-4o-mini'];

module.exports = {
  port: process.env.PORT || 3000,
  openaiApiKey: process.env.OPENAI_API_KEY,
  supabaseUrl: process.env.SUPABASE_URL,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  jwtSecret: process.env.JWT_SECRET,
  allowedModels: process.env.ALLOWED_MODELS
    ? process.env.ALLOWED_MODELS.split(',').map((m) => m.trim()).filter(Boolean)
    : DEFAULT_ALLOWED_MODELS,
};
