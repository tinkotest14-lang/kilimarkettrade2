import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL=process.env.SUPABASE_URL; const SUPABASE_SERVICE_ROLE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY; if(!SUPABASE_URL||!SUPABASE_SERVICE_ROLE_KEY){console.error('missing env'); process.exit(2);} const supabaseAdmin=createClient(SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY);
(async()=>{
  const users = await supabaseAdmin.from('users').select('*').limit(5);
  console.log('found', users.data?.length);
  if(!users.data||users.data.length===0) return;
  const user = users.data[0];
  console.log('first', user.id, user.email, user.balance);
  await supabaseAdmin.from('users').update({ balance: 777 }).eq('id', user.id);
  const check = await supabaseAdmin.from('users').select('balance').eq('id', user.id).single();
  console.log('after', check.data);
})();
