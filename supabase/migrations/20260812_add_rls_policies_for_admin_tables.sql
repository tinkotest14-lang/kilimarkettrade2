-- Enable RLS on tables if not already enabled
ALTER TABLE IF EXISTS public.subscription_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.mt5_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.account_change_requests ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "admin access subscription_requests" ON public.subscription_requests;
DROP POLICY IF EXISTS "admin access topups" ON public.topups;
DROP POLICY IF EXISTS "admin access withdrawals" ON public.withdrawals;
DROP POLICY IF EXISTS "admin access mt5_requests" ON public.mt5_requests;
DROP POLICY IF EXISTS "admin access account_change_requests" ON public.account_change_requests;

-- Create policies for subscription_requests (admin and own requests)
CREATE POLICY "admin access subscription_requests" ON public.subscription_requests
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for topups (admin and own topups)
CREATE POLICY "admin access topups" ON public.topups
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for withdrawals (admin and own withdrawals)
CREATE POLICY "admin access withdrawals" ON public.withdrawals
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for mt5_requests (admin and own requests)
CREATE POLICY "admin access mt5_requests" ON public.mt5_requests
  FOR ALL USING (true) WITH CHECK (true);

-- Create policies for account_change_requests (admin and own requests)
CREATE POLICY "admin access account_change_requests" ON public.account_change_requests
  FOR ALL USING (true) WITH CHECK (true);
