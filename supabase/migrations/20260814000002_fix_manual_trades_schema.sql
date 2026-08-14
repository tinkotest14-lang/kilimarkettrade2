-- Fix manual_trades table schema to ensure all required columns exist
-- This will handle cases where the table exists with incomplete columns

-- First, check and ensure the table exists with all columns
-- We'll use a safe approach that adds missing columns one by one

-- Add missing columns to manual_trades if they don't exist
ALTER TABLE IF EXISTS public.manual_trades 
  ADD COLUMN IF NOT EXISTS entry_price numeric;

ALTER TABLE IF EXISTS public.manual_trades 
  ADD COLUMN IF NOT EXISTS exit_price numeric;

ALTER TABLE IF EXISTS public.manual_trades 
  ADD COLUMN IF NOT EXISTS closed_at timestamptz;

ALTER TABLE IF EXISTS public.manual_trades 
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

ALTER TABLE IF EXISTS public.manual_trades 
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Ensure status column has proper default
ALTER TABLE IF EXISTS public.manual_trades 
  ALTER COLUMN status SET DEFAULT 'open';

-- Ensure trade_type column has proper default  
ALTER TABLE IF EXISTS public.manual_trades 
  ALTER COLUMN trade_type SET DEFAULT 'manual';

-- Ensure outcome_mode has proper default
ALTER TABLE IF EXISTS public.manual_trades 
  ALTER COLUMN outcome_mode SET DEFAULT 'normal';

-- Ensure opened_at has proper default
ALTER TABLE IF EXISTS public.manual_trades 
  ALTER COLUMN opened_at SET DEFAULT now();

-- Set up the trigger for updated_at if it doesn't exist
DROP TRIGGER IF EXISTS manual_trades_updated ON public.manual_trades;
CREATE TRIGGER manual_trades_updated
  BEFORE UPDATE ON public.manual_trades
  FOR EACH ROW 
  EXECUTE FUNCTION public.set_updated_at();

-- Add constraints if not already present
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
