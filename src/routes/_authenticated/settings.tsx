import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Cable, Eye, EyeOff, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { mt5Connect, mt5Disconnect } from "@/lib/mt5/bridge.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings \u00b7 KiliMarkets" },
      { name: "description", content: "Chart appearance, AI assistant key and MetaTrader 5 account settings." },
      { property: "og:title", content: "Settings \u00b7 KiliMarkets" },
      { property: "og:description", content: "Chart appearance, AI and MetaTrader 5 settings." },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  const [grid, setGrid] = useState(true);
  const [volume, setVolume] = useState(true);
  const [crosshair, setCrosshair] = useState(true);
  const [watermark, setWatermark] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [mt5Open, setMt5Open] = useState(false);
  const [mt5Busy, setMt5Busy] = useState(false);
  const [mt5Account, setMt5Account] = useState<{ login: string; server: string; balance?: number; equity?: number } | null>(null);
  const [mt5Form, setMt5Form] = useState({ login: "", password: "", server: "" });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      const [{ data }, { data: auth }] = await Promise.all([
        supabase.from("user_settings").select("*").maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (auth.user) {
        setDisplayName((auth.user.user_metadata.display_name as string | undefined) ?? "");
        const { data: profile } = await supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle();
        if (profile?.display_name) setDisplayName(profile.display_name);
        const { data: broker } = await supabase.from("broker_accounts").select("login, server, is_connected").eq("user_id", auth.user.id).maybeSingle();
        if (broker?.is_connected) setMt5Account({ login: broker.login, server: broker.server });
      }
      if (data) {
        setGrid(data.show_grid);
        setVolume(data.show_volume);
        setCrosshair(data.show_crosshair);
        setWatermark(data.watermark_text ?? "");
        setAnthropicKey(data.anthropic_api_key ?? "");
      }
      setLoading(false);
    })();
  }, []);

  async function saveProfile() {
    setProfileSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return setProfileSaving(false);
    const [{ error: profileError }, { error: authError }] = await Promise.all([
      supabase.from("profiles").upsert({ id: auth.user.id, display_name: displayName.trim() || null }, { onConflict: "id" }),
      supabase.auth.updateUser({ data: { display_name: displayName.trim() || null } }),
    ]);
    setProfileSaving(false);
    if (profileError || authError) toast.error(profileError?.message ?? authError?.message ?? "Could not update your name");
    else toast.success("Name updated");
  }

  async function changePassword() {
    if (newPassword.length < 8) return toast.error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return toast.error("Passwords do not match");
    setPasswordSaving(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setPasswordSaving(false);
    if (error) toast.error(error.message);
    else {
      setNewPassword("");
      setConfirmPassword("");
      toast.success("Password changed");
    }
  }

  async function connectMt5() {
    if (!mt5Form.login || !mt5Form.password || !mt5Form.server) return toast.error("Complete all MT5 connection fields");
    setMt5Busy(true);
    try {
      const account = await mt5Connect({ data: { ...mt5Form, platform: "MetaTrader 5" } });
      setMt5Account(account);
      setMt5Open(false);
      setMt5Form((previous) => ({ ...previous, password: "" }));
      toast.success("MT5 account connected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not connect MT5 account");
    } finally {
      setMt5Busy(false);
    }
  }

  async function disconnectMt5() {
    setMt5Busy(true);
    try {
      await mt5Disconnect();
      setMt5Account(null);
      toast.success("MT5 account disconnected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not disconnect MT5 account");
    } finally {
      setMt5Busy(false);
    }
  }

  async function save() {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const { error } = await supabase.from("user_settings").upsert(
      {
        user_id: auth.user.id,
        show_grid: grid,
        show_volume: volume,
        show_crosshair: crosshair,
        watermark_text: watermark,
        anthropic_api_key: anthropicKey,
      },
      { onConflict: "user_id" },
    );
    if (error) toast.error(error.message);
    else toast.success("Settings saved");
  }

  if (loading) return <main className="p-6 text-sm text-muted-foreground">Loading settings\u2026</main>;

  return (
    <main className="mx-auto max-w-3xl px-4 py-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Control center</p>
          <h1 className="mt-1 text-2xl font-bold">Settings</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tune your workspace, security, and trading connection.</p>
        </div>
        <div className="rounded-2xl border border-primary/20 bg-primary/10 p-3 text-primary"><KeyRound className="size-5" /></div>
      </div>

      <section className="mt-5 rounded-2xl border border-border bg-card p-4">
        <SectionHeading icon={UserRound} title="Profile" description="Keep your account identity up to date." />
        <div className="mt-4 flex gap-2">
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your display name" className="h-12 rounded-xl bg-surface" />
          <Button onClick={saveProfile} disabled={profileSaving} className="h-12 rounded-xl px-5">{profileSaving ? "Saving…" : "Save name"}</Button>
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <SectionHeading icon={LockKeyhole} title="Security" description="Change your sign-in password." />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="relative"><Input type={showPassword ? "text" : "password"} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="New password" className="h-12 rounded-xl bg-surface pr-11" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute right-3 top-3 text-muted-foreground" aria-label="Toggle password visibility">{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}</button></div>
          <Input type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Confirm password" className="h-12 rounded-xl bg-surface" />
        </div>
        <Button variant="outline" onClick={changePassword} disabled={passwordSaving} className="mt-3 h-11 rounded-xl">{passwordSaving ? "Updating…" : "Change password"}</Button>
      </section>

      <section className="mt-4 rounded-2xl border border-border bg-card p-4">
        <SectionHeading icon={Cable} title="MetaTrader 5" description="Connect the account used for live execution." />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-surface p-3">
          <div><div className="text-sm font-semibold">{mt5Account ? `MT5 · ${mt5Account.login}` : "No MT5 account connected"}</div><div className="mt-1 text-xs text-muted-foreground">{mt5Account ? mt5Account.server : "Credentials are encrypted by the bridge."}</div></div>
          {mt5Account ? <Button variant="outline" onClick={disconnectMt5} disabled={mt5Busy} className="rounded-xl">{mt5Busy ? "Disconnecting…" : "Disconnect"}</Button> : <Button onClick={() => setMt5Open(true)} className="rounded-xl">Connect MT5</Button>}
        </div>
      </section>

      <section className="mt-4 divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        <Row label="Grid"><Switch checked={grid} onCheckedChange={setGrid} aria-label="Grid" /></Row>
        <Row label="Volume"><Switch checked={volume} onCheckedChange={setVolume} aria-label="Volume" /></Row>
        <Row label="Crosshair"><Switch checked={crosshair} onCheckedChange={setCrosshair} aria-label="Crosshair" /></Row>
      </section>

      <label className="mt-5 block">
        <span className="mb-1 block text-xs text-muted-foreground">Watermark</span>
        <Input value={watermark} onChange={(e) => setWatermark(e.target.value)} className="h-12 rounded-xl bg-surface" />
      </label>

      <label className="mt-4 block">
        <span className="mb-1 block text-xs text-muted-foreground">Anthropic API key</span>
        <Input
          type="password"
          value={anthropicKey}
          onChange={(e) => setAnthropicKey(e.target.value)}
          placeholder="sk-ant-\u2026"
          className="h-12 rounded-xl bg-surface"
        />
      </label>

      <Button onClick={save} className="mt-5 h-13 w-full rounded-xl py-3.5 text-base font-semibold">
        Save settings
      </Button>

      <Dialog open={mt5Open} onOpenChange={setMt5Open}>
        <DialogContent className="rounded-2xl sm:max-w-md">
          <DialogHeader><DialogTitle>Connect MetaTrader 5</DialogTitle><DialogDescription>Enter your broker login details to connect live execution.</DialogDescription></DialogHeader>
          <div className="grid gap-3 pt-2">
            <Input value={mt5Form.login} onChange={(e) => setMt5Form((previous) => ({ ...previous, login: e.target.value }))} placeholder="Account login" className="h-12 rounded-xl bg-surface" />
            <Input type="password" value={mt5Form.password} onChange={(e) => setMt5Form((previous) => ({ ...previous, password: e.target.value }))} placeholder="Trading password" className="h-12 rounded-xl bg-surface" />
            <Input value={mt5Form.server} onChange={(e) => setMt5Form((previous) => ({ ...previous, server: e.target.value }))} placeholder="Broker server, e.g. Broker-Real" className="h-12 rounded-xl bg-surface" />
            <Button onClick={connectMt5} disabled={mt5Busy} className="h-12 rounded-xl">{mt5Busy ? "Connecting…" : "Connect account"}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-3.5">
      <span className="font-medium">{label}</span>
      {children}
    </div>
  );
}

function SectionHeading({ icon: Icon, title, description }: { icon: typeof UserRound; title: string; description: string }) {
  return <div className="flex items-center gap-3"><div className="rounded-xl border border-primary/20 bg-primary/10 p-2 text-primary"><Icon className="size-4" /></div><div><h2 className="text-sm font-semibold">{title}</h2><p className="mt-0.5 text-xs text-muted-foreground">{description}</p></div></div>;
}
