-- Add missing closed_at column to manual_trades and bot_trades tables
-- This fixes the issue where closed trades cannot be saved

ALTER TABLE public.manual_trades
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE public.bot_trades
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS manual_trades_closed_at
  ON public.manual_trades (closed_at DESC NULLS LAST)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS bot_trades_closed_at
  ON public.bot_trades (closed_at DESC NULLS LAST)
  WHERE status = 'closed';

-- Create indexes for user-specific closed trades queries
CREATE INDEX IF NOT EXISTS manual_trades_user_closed_at
  ON public.manual_trades (user_id, closed_at DESC NULLS LAST)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS bot_trades_user_closed_at
  ON public.bot_trades (user_id, closed_at DESC NULLS LAST)
  WHERE status = 'closed';
