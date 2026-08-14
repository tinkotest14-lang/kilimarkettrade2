
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile" ON public.profiles FOR ALL TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE TRIGGER profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_settings (user_id) VALUES (NEW.id) ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END; $$;

-- user_settings
CREATE TABLE public.user_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark',
  language TEXT NOT NULL DEFAULT 'en',
  chart_theme TEXT NOT NULL DEFAULT 'dark',
  show_grid BOOLEAN NOT NULL DEFAULT true,
  show_volume BOOLEAN NOT NULL DEFAULT true,
  show_crosshair BOOLEAN NOT NULL DEFAULT true,
  up_color TEXT NOT NULL DEFAULT '#22a58a',
  down_color TEXT NOT NULL DEFAULT '#ef4a4a',
  wick_color TEXT NOT NULL DEFAULT '#ffffff',
  grid_color TEXT NOT NULL DEFAULT '#ffffff',
  volume_height INTEGER NOT NULL DEFAULT 80,
  crosshair_color TEXT NOT NULL DEFAULT '#ffffff',
  label_background TEXT NOT NULL DEFAULT '#ffffff',
  label_text TEXT NOT NULL DEFAULT '#000000',
  watermark_text TEXT NOT NULL DEFAULT '',
  watermark_color TEXT NOT NULL DEFAULT '#ffffff',
  font TEXT NOT NULL DEFAULT '11px -apple-system, system-ui',
  pane_height INTEGER NOT NULL DEFAULT 120,
  autosave BOOLEAN NOT NULL DEFAULT true,
  default_symbol TEXT NOT NULL DEFAULT 'XAUUSD',
  default_timeframe TEXT NOT NULL DEFAULT '5m',
  anthropic_api_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_settings TO authenticated;
GRANT ALL ON public.user_settings TO service_role;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own settings" ON public.user_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER user_settings_updated BEFORE UPDATE ON public.user_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- broker_accounts
CREATE TABLE public.broker_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  login TEXT NOT NULL,
  server TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'MetaTrader 5',
  broker TEXT,
  is_connected BOOLEAN NOT NULL DEFAULT false,
  last_connected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, login, server)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broker_accounts TO authenticated;
GRANT ALL ON public.broker_accounts TO service_role;
ALTER TABLE public.broker_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own broker accounts" ON public.broker_accounts FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER broker_accounts_updated BEFORE UPDATE ON public.broker_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- watchlist
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own watchlist" ON public.watchlist FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- drawings
CREATE TABLE public.drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  tool TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX drawings_lookup ON public.drawings (user_id, symbol, timeframe);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.drawings TO authenticated;
GRANT ALL ON public.drawings TO service_role;
ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own drawings" ON public.drawings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER drawings_updated BEFORE UPDATE ON public.drawings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- indicator_settings
CREATE TABLE public.indicator_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL DEFAULT '*',
  indicator TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  color TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX indicator_settings_lookup ON public.indicator_settings (user_id, symbol);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.indicator_settings TO authenticated;
GRANT ALL ON public.indicator_settings TO service_role;
ALTER TABLE public.indicator_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own indicators" ON public.indicator_settings FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER indicator_settings_updated BEFORE UPDATE ON public.indicator_settings FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- strategy_configs
CREATE TABLE public.strategy_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  strategy_key TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, strategy_key, symbol, timeframe)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.strategy_configs TO authenticated;
GRANT ALL ON public.strategy_configs TO service_role;
ALTER TABLE public.strategy_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own strategy configs" ON public.strategy_configs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER strategy_configs_updated BEFORE UPDATE ON public.strategy_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- bot_sessions
CREATE TABLE public.bot_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  strategy_key TEXT NOT NULL,
  strategy_label TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  check_seconds INTEGER NOT NULL DEFAULT 60,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'waiting',
  mode TEXT NOT NULL DEFAULT 'paper',
  broker_account_id UUID REFERENCES public.broker_accounts(id) ON DELETE SET NULL,
  trades_count INTEGER NOT NULL DEFAULT 0,
  wins_count INTEGER NOT NULL DEFAULT 0,
  pnl NUMERIC NOT NULL DEFAULT 0,
  last_signal TEXT,
  last_checked_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_sessions_user ON public.bot_sessions (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_sessions TO authenticated;
GRANT ALL ON public.bot_sessions TO service_role;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot sessions" ON public.bot_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bot_sessions_updated BEFORE UPDATE ON public.bot_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- bot_logs
CREATE TABLE public.bot_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info',
  message TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_logs_session ON public.bot_logs (session_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_logs TO authenticated;
GRANT ALL ON public.bot_logs TO service_role;
ALTER TABLE public.bot_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot logs" ON public.bot_logs FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- bot_trades
CREATE TABLE public.bot_trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  session_id UUID REFERENCES public.bot_sessions(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL,
  volume NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  exit_price NUMERIC,
  stop_loss NUMERIC,
  take_profit NUMERIC,
  pnl NUMERIC,
  status TEXT NOT NULL DEFAULT 'open',
  ticket TEXT,
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX bot_trades_user ON public.bot_trades (user_id, opened_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_trades TO authenticated;
GRANT ALL ON public.bot_trades TO service_role;
ALTER TABLE public.bot_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own bot trades" ON public.bot_trades FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER bot_trades_updated BEFORE UPDATE ON public.bot_trades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- backtests
CREATE TABLE public.backtests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  strategy_key TEXT NOT NULL,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  from_date TIMESTAMPTZ,
  to_date TIMESTAMPTZ,
  initial_balance NUMERIC NOT NULL DEFAULT 10000,
  leverage INTEGER NOT NULL DEFAULT 100,
  params JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics JSONB,
  equity_curve JSONB,
  trades JSONB,
  status TEXT NOT NULL DEFAULT 'queued',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.backtests TO authenticated;
GRANT ALL ON public.backtests TO service_role;
ALTER TABLE public.backtests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own backtests" ON public.backtests FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER backtests_updated BEFORE UPDATE ON public.backtests FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- replay_sessions
CREATE TABLE public.replay_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  start_time TIMESTAMPTZ,
  cursor_index INTEGER NOT NULL DEFAULT 0,
  speed INTEGER NOT NULL DEFAULT 1,
  is_playing BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.replay_sessions TO authenticated;
GRANT ALL ON public.replay_sessions TO service_role;
ALTER TABLE public.replay_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own replay sessions" ON public.replay_sessions FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER replay_sessions_updated BEFORE UPDATE ON public.replay_sessions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- notifications
CREATE TABLE public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user ON public.notifications (user_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own notifications" ON public.notifications FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bot_trades;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
