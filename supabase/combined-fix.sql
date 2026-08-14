-- ============================================================================
-- COMPLETE FIX FOR CLOSED TRADES - RECREATES TABLES WITH ALL COLUMNS
-- Copy and paste this entire file into Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 1: Recreate manual_trades table with ALL required columns
-- ============================================================================

-- Drop and recreate manual_trades to ensure all columns exist
DROP TABLE IF EXISTS public.manual_trades CASCADE;

CREATE TABLE public.manual_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  symbol text NOT NULL,
  dir integer NOT NULL DEFAULT 1,
  lots numeric NOT NULL DEFAULT 0,
  entry_price numeric NOT NULL DEFAULT 0,
  exit_price numeric,
  pnl numeric,
  status text NOT NULL DEFAULT 'open',
  trade_type text NOT NULL DEFAULT 'manual',
  outcome_mode text NOT NULL DEFAULT 'normal',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- STEP 2: Recreate bot_trades table with ALL required columns
-- ============================================================================

-- Drop and recreate bot_trades to ensure all columns exist
DROP TABLE IF EXISTS public.bot_trades CASCADE;

CREATE TABLE public.bot_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email text,
  symbol text NOT NULL,
  side text NOT NULL,
  volume numeric NOT NULL DEFAULT 0,
  entry_price numeric NOT NULL DEFAULT 0,
  exit_price numeric,
  pnl numeric,
  status text NOT NULL DEFAULT 'open',
  trade_type text NOT NULL DEFAULT 'bot',
  outcome_mode text NOT NULL DEFAULT 'normal',
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- STEP 3: Add constraints to manual_trades
-- ============================================================================

ALTER TABLE public.manual_trades
  ADD CONSTRAINT manual_trades_dir_check CHECK (dir IN (-1, 1)),
  ADD CONSTRAINT manual_trades_status_check CHECK (status IN ('open', 'closed', 'cancelled')),
  ADD CONSTRAINT manual_trades_type_check CHECK (trade_type IN ('manual', 'bot')),
  ADD CONSTRAINT manual_trades_outcome_check CHECK (outcome_mode IN ('normal', 'profit', 'loss'));

-- ============================================================================
-- STEP 4: Add constraints to bot_trades
-- ============================================================================

ALTER TABLE public.bot_trades
  ADD CONSTRAINT bot_trades_side_check CHECK (side IN ('buy', 'sell')),
  ADD CONSTRAINT bot_trades_status_check CHECK (status IN ('open', 'closed', 'cancelled')),
  ADD CONSTRAINT bot_trades_type_check CHECK (trade_type IN ('bot', 'manual')),
  ADD CONSTRAINT bot_trades_outcome_mode_check CHECK (outcome_mode IN ('normal', 'profit', 'loss'));

-- ============================================================================
-- STEP 5: Create function for updated_at trigger (if it doesn't exist)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- STEP 6: Create triggers for updated_at
-- ============================================================================

DROP TRIGGER IF EXISTS manual_trades_updated ON public.manual_trades;
CREATE TRIGGER manual_trades_updated
BEFORE UPDATE ON public.manual_trades
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS bot_trades_updated ON public.bot_trades;
CREATE TRIGGER bot_trades_updated
BEFORE UPDATE ON public.bot_trades
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================================================
-- STEP 7: Create indexes for performance
-- ============================================================================

CREATE INDEX IF NOT EXISTS manual_trades_user_status
  ON public.manual_trades (user_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS manual_trades_status
  ON public.manual_trades (status, opened_at DESC);

CREATE INDEX IF NOT EXISTS manual_trades_closed_at
  ON public.manual_trades (closed_at DESC NULLS LAST)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS manual_trades_user_closed_at
  ON public.manual_trades (user_id, closed_at DESC NULLS LAST)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS bot_trades_user_status
  ON public.bot_trades (user_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS bot_trades_status
  ON public.bot_trades (status, opened_at DESC);

CREATE INDEX IF NOT EXISTS bot_trades_closed_at
  ON public.bot_trades (closed_at DESC NULLS LAST)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS bot_trades_user_closed_at
  ON public.bot_trades (user_id, closed_at DESC NULLS LAST)
  WHERE status = 'closed';

-- ============================================================================
-- STEP 8: Enable RLS on both tables
-- ============================================================================

ALTER TABLE public.manual_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- STEP 9: Drop old policies and create new user-specific ones
-- ============================================================================

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

-- ============================================================================
-- DONE! Tables are now ready for closed trades
-- ============================================================================
