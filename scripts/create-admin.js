require('dotenv').config();
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');

const [loginId, password] = process.argv.slice(2);

if (!loginId || !password) {
  console.error('Usage: node scripts/create-admin.js <login-id> <password>');
  process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
  realtime: { transport: ws },
});

async function main() {
  const passwordHash = await bcrypt.hash(password, 10);

  const { data, error } = await supabase
    .from('admins')
    .insert({ login_id: loginId, password_hash: passwordHash })
    .select()
    .single();

  if (error) {
    console.error('Failed to create admin:', error.message);
    process.exit(1);
  }

  console.log(`Admin created: ${data.login_id} (id: ${data.id})`);
}

main();
