-- Add RLS policies for trade tables (manual_trades and bot_trades)

-- Enable RLS on both tables if not already enabled
ALTER TABLE IF EXISTS public.manual_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bot_trades ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin access manual_trades" ON public.manual_trades;
DROP POLICY IF EXISTS "admin access bot_trades" ON public.bot_trades;

-- Create policies for manual_trades (admin access)
CREATE POLICY "admin access manual_trades" ON public.manual_trades
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for bot_trades (admin access)
CREATE POLICY "admin access bot_trades" ON public.bot_trades
  FOR ALL USING (true) WITH CHECK (true);
