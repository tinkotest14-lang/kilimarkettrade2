-- Create the public.users table used by the app and admin dashboard
CREATE TABLE IF NOT EXISTS public.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  balance numeric(18,2) NOT NULL DEFAULT 0,
  subscribed boolean NOT NULL DEFAULT false,
  subscription_status text,
  subscription_plan text,
  subscription_amount numeric(18,2),
  subscription_network text,
  locked boolean NOT NULL DEFAULT false,
  page_locks jsonb NOT NULL DEFAULT '{}'::jsonb,
  wallet_address text,
  mt5_connected boolean NOT NULL DEFAULT false,
  mt5_status text,
  mt5_details jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_update_at ON public.users;
CREATE TRIGGER trg_users_update_at
BEFORE UPDATE ON public.users
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Populate public.users for any existing auth.users records
INSERT INTO public.users (id, email, created_at, updated_at)
SELECT auth.id, auth.email, now(), now()
FROM auth.users auth
LEFT JOIN public.users u ON u.id = auth.id
WHERE u.id IS NULL;

-- Withdrawals and top-ups required by admin flows
CREATE TABLE IF NOT EXISTS public.withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  amount numeric(18,2) NOT NULL,
  network text,
  address text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.topups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  amount numeric(18,2) NOT NULL,
  network text,
  address text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.mt5_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  login text,
  server text,
  password text,
  status text NOT NULL DEFAULT 'pending',
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.account_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  type text,
  details jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_withdrawals_user ON public.withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_topups_user ON public.topups(user_id);
CREATE INDEX IF NOT EXISTS idx_mt5_requests_user ON public.mt5_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_account_change_requests_user ON public.account_change_requests(user_id);
