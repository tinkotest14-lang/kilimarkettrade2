import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function main(){
  const users = await supabaseAdmin.from('users').select('*').limit(5);
  console.log('users.list.error', users.error);
  console.log('users.list.count', users.data?.length);
  if (!users.data || users.data.length === 0) return;
  const user = users.data[0];
  console.log('first user id/email/balance:', user.id, user.email, user.balance);

  const newBalance = (Number(user.balance ?? 0) + 100);
  console.log('Attempting to set balance to', newBalance);
  const updated = await supabaseAdmin.from('users').update({ balance: newBalance }).eq('id', user.id);
  console.log('update.error', updated.error);
  console.log('update.data', updated.data);
}

main().catch((e)=>{ console.error(e); process.exit(1); });
