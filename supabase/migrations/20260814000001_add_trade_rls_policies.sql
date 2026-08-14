-- Add RLS policies for trade tables (manual_trades and bot_trades)

-- Enable RLS on both tables if not already enabled
ALTER TABLE IF EXISTS public.manual_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bot_trades ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin access manual_trades" ON public.manual_trades;
DROP POLICY IF EXISTS "admin access bot_trades" ON public.bot_trades;
DROP POLICY IF EXISTS "users read own manual trades" ON public.manual_trades;
DROP POLICY IF EXISTS "users insert own manual trades" ON public.manual_trades;
DROP POLICY IF EXISTS "users update own manual trades" ON public.manual_trades;
DROP POLICY IF EXISTS "users read own bot trades" ON public.bot_trades;
DROP POLICY IF EXISTS "users insert own bot trades" ON public.bot_trades;
DROP POLICY IF EXISTS "users update own bot trades" ON public.bot_trades;

-- Create policies for manual_trades (admin and user access)
CREATE POLICY "admin access manual_trades" ON public.manual_trades
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "users read own manual trades" ON public.manual_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own manual trades" ON public.manual_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own manual trades" ON public.manual_trades
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Create policies for bot_trades (admin and user access)
CREATE POLICY "admin access bot_trades" ON public.bot_trades
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "users read own bot trades" ON public.bot_trades
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users insert own bot trades" ON public.bot_trades
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "users update own bot trades" ON public.bot_trades
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
