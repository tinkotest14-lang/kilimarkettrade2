-- Create the public.subscription_requests table for tracking subscription payment requests
CREATE TABLE IF NOT EXISTS public.subscription_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  user_email text,
  subscription_plan text,
  amount numeric(18,2) NOT NULL,
  network text,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_requests_user ON public.subscription_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_requests_status ON public.subscription_requests(status);
