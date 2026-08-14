-- Demo trading controls and persistent manual/demo positions.
-- This migration is intentionally additive: it does not change existing RLS settings.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS trading_outcome_mode text NOT NULL DEFAULT 'normal';

ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_trading_outcome_mode_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_trading_outcome_mode_check
  CHECK (trading_outcome_mode IN ('normal', 'profit', 'loss'));

ALTER TABLE public.bot_trades
  ADD COLUMN IF NOT EXISTS outcome_mode text NOT NULL DEFAULT 'normal';

ALTER TABLE public.bot_trades
  DROP CONSTRAINT IF EXISTS bot_trades_outcome_mode_check;

ALTER TABLE public.bot_trades
  ADD CONSTRAINT bot_trades_outcome_mode_check
  CHECK (outcome_mode IN ('normal', 'profit', 'loss'));

CREATE TABLE IF NOT EXISTS public.manual_trades (
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

-- The table may already exist in production from an earlier app version.
-- Add only the missing columns so this migration is safe to run against either shape.
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS symbol text;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS dir integer NOT NULL DEFAULT 1;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS lots numeric NOT NULL DEFAULT 0;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS entry_price numeric NOT NULL DEFAULT 0;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS exit_price numeric;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS pnl numeric;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS trade_type text NOT NULL DEFAULT 'manual';
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS outcome_mode text NOT NULL DEFAULT 'normal';
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS opened_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS closed_at timestamptz;
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE public.manual_trades ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.manual_trades
  DROP CONSTRAINT IF EXISTS manual_trades_dir_check,
  DROP CONSTRAINT IF EXISTS manual_trades_status_check,
  DROP CONSTRAINT IF EXISTS manual_trades_type_check,
  DROP CONSTRAINT IF EXISTS manual_trades_outcome_check;

ALTER TABLE public.manual_trades
  ADD CONSTRAINT manual_trades_dir_check CHECK (dir IN (-1, 1)),
  ADD CONSTRAINT manual_trades_status_check CHECK (status IN ('open', 'closed', 'cancelled')),
  ADD CONSTRAINT manual_trades_type_check CHECK (trade_type IN ('manual', 'bot')),
  ADD CONSTRAINT manual_trades_outcome_check CHECK (outcome_mode IN ('normal', 'profit', 'loss'));
CREATE INDEX IF NOT EXISTS manual_trades_user_status
  ON public.manual_trades (user_id, status, opened_at DESC);

CREATE INDEX IF NOT EXISTS manual_trades_status
  ON public.manual_trades (status, opened_at DESC);

CREATE INDEX IF NOT EXISTS bot_trades_status
  ON public.bot_trades (status, opened_at DESC);

DROP TRIGGER IF EXISTS manual_trades_updated ON public.manual_trades;
CREATE TRIGGER manual_trades_updated
BEFORE UPDATE ON public.manual_trades
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Existing records are treated as normal-mode trades.
UPDATE public.bot_trades SET outcome_mode = 'normal' WHERE outcome_mode IS NULL;
UPDATE public.users SET trading_outcome_mode = 'normal' WHERE trading_outcome_mode IS NULL;
