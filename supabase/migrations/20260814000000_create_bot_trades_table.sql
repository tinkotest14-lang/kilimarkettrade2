-- Create the bot_trades table for automated bot trading records
CREATE TABLE IF NOT EXISTS public.bot_trades (
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

-- The table may already exist from an earlier app version.
-- Add only the missing columns so this migration is safe to run against either shape.
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS symbol text;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS side text;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS volume numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS entry_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS exit_price numeric;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS pnl numeric;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS trade_type text NOT NULL DEFAULT 'bot';
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS outcome_mode text NOT NULL DEFAULT 'normal';
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS opened_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.bot_trades ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Add constraints
ALTER TABLE public.bot_trades
  DROP CONSTRAINT IF EXISTS bot_trades_side_check,
  DROP CONSTRAINT IF EXISTS bot_trades_status_check,
  DROP CONSTRAINT IF EXISTS bot_trades_type_check,
  DROP CONSTRAINT IF EXISTS bot_trades_outcome_mode_check;

ALTER TABLE public.bot_trades
  ADD CONSTRAINT bot_trades_side_check CHECK (side IN ('buy', 'sell')),
  ADD CONSTRAINT bot_trades_status_check CHECK (status IN ('open', 'closed', 'cancelled')),
  ADD CONSTRAINT bot_trades_type_check CHECK (trade_type IN ('bot', 'manual')),
  ADD CONSTRAINT bot_trades_outcome_mode_check CHECK (outcome_mode IN ('normal', 'profit', 'loss'));

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS bot_trades_user_status
  ON public.bot_trades (user_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS bot_trades_status
  ON public.bot_trades (status, opened_at DESC);

-- Setup updated_at trigger
DROP TRIGGER IF EXISTS bot_trades_updated ON public.bot_trades;
CREATE TRIGGER bot_trades_updated
BEFORE UPDATE ON public.bot_trades
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Enable RLS
ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;

-- Create admin policy for bot_trades
DROP POLICY IF EXISTS "admin access bot_trades" ON public.bot_trades;
CREATE POLICY "admin access bot_trades" ON public.bot_trades
  FOR ALL USING (true) WITH CHECK (true);
