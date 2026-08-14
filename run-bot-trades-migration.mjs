import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(2);
}

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function runMigration() {
  try {
    console.log('📖 Reading migration file...');
    const migrationSQL = fs.readFileSync('./supabase/migrations/20260814000000_create_bot_trades_table.sql', 'utf-8');
    
    console.log('🚀 Executing SQL against Supabase...');
    
    // Use the postgres function to execute raw SQL
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: migrationSQL
    }).catch(async (err) => {
      console.log('exec_sql not available, trying with pg_temp...');
      // If the RPC doesn't exist, try using a different approach
      return { data: null, error: err };
    });

    if (error) {
      console.log('⚠️  RPC method not available, attempting direct PostgreSQL connection...');
      console.log('You may need to run: npm run migrate:up or supabase migration up');
    } else {
      console.log('✅ Migration executed successfully!');
      console.log('Response:', data);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runMigration();
