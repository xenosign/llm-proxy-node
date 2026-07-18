require('dotenv').config();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const [name, budgetArg, loginId, password] = process.argv.slice(2);

if (!name || !budgetArg || !loginId || !password) {
  console.error('Usage: node scripts/create-team.js <team-name> <budget-usd> <login-id> <password>');
  process.exit(1);
}

const budgetUsd = Number(budgetArg);
if (!Number.isFinite(budgetUsd) || budgetUsd <= 0) {
  console.error('budget-usd must be a positive number');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  const proxyToken = `tp_${crypto.randomBytes(24).toString('hex')}`;
  const passwordHash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('teams')
    .insert({
      name,
      proxy_token: proxyToken,
      login_id: loginId,
      password_hash: passwordHash,
      budget_usd: budgetUsd,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create team:', error.message);
    process.exit(1);
  }

  console.log(`Team created: ${data.name} (id: ${data.id})`);
  console.log(`Budget: $${data.budget_usd}`);
  console.log(`Proxy token (API): ${data.proxy_token}`);
  console.log(`Dashboard login: ${data.login_id} / ${password}`);
}

main();
