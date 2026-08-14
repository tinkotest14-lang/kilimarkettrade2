import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase, signInLocal, signUpLocal, ADMIN_EMAIL, ADMIN_PASSWORD } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in \u00b7 KiliMarkets" },
      { name: "description", content: "Sign in to your KiliMarkets trading terminal to reach your charts and bots." },
      { property: "og:title", content: "Sign in \u00b7 KiliMarkets" },
      { property: "og:description", content: "Sign in to your KiliMarkets trading terminal." },
    ],
  }),
  component: AuthPage,
});

function isNetworkFallbackError(error: any): boolean {
  const message = error?.message ?? "";
  return [
    "Failed to fetch",
    "Network request failed",
    "ERR_NAME_NOT_RESOLVED",
    "AuthRetryableFetchError",
  ].some((token) => message.includes(token));
}

const SIGNUP_COOLDOWN_MS = 60_000;

function AuthPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [signupCooldownUntil, setSignupCooldownUntil] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && user) void navigate({ to: "/charts", replace: true });
  }, [loading, user, navigate]);

  function isRateLimitedError(error: any): boolean {
    const message = error?.message ?? "";
    return error?.status === 429 || /Too Many Requests|rate limit/i.test(message);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }

    const now = Date.now();
    if (mode === "signup" && signupCooldownUntil && now < signupCooldownUntil) {
      const secondsLeft = Math.ceil((signupCooldownUntil - now) / 1000);
      toast.error(`Please wait ${secondsLeft}s before creating another account.`);
      return;
    }

    setBusy(true);
    const isLocalAdmin = email === ADMIN_EMAIL && password === ADMIN_PASSWORD;
    let result: any;

    try {
      if (mode === "signin") {
        result = isLocalAdmin
          ? await signInLocal(email, password)
          : await supabase.auth.signInWithPassword({ email, password });
      } else {
        result = isLocalAdmin
          ? await signUpLocal(email, password)
          : await supabase.auth.signUp({
              email,
              password,
              options: { emailRedirectTo: `${window.location.origin}/charts` },
            });
      }

      if (result?.error && isNetworkFallbackError(result.error)) {
        result = mode === "signin" ? await signInLocal(email, password) : await signUpLocal(email, password);
      }
    } catch (error) {
      if (!isNetworkFallbackError(error)) {
        setBusy(false);
        toast.error(error instanceof Error ? error.message : "Authentication failed");
        return;
      }
      result = await (mode === "signin" ? signInLocal(email, password) : signUpLocal(email, password));
    }

    setBusy(false);

    if (result?.error) {
      if (isRateLimitedError(result.error)) {
        setSignupCooldownUntil(Date.now() + SIGNUP_COOLDOWN_MS);
        toast.error("Supabase is rate-limiting new signups. Please wait 1 minute and try again with a different email.");
        return;
      }
      toast.error(result.error.message);
      return;
    }
    if (mode === "signup" && !result.data.session) {
      setSignupCooldownUntil(Date.now() + SIGNUP_COOLDOWN_MS);
      toast.success("Account created — check your inbox to confirm your email.");
      return;
    }
    void navigate({ to: "/charts", replace: true });
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="relative w-full max-w-md rounded-2xl border border-border bg-card p-7 shadow-2xl">
        {busy && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="flex items-center gap-3 rounded-3xl border border-border bg-surface px-5 py-4 text-sm font-semibold text-foreground shadow-lg">
              <Loader2 className="animate-spin" />
              Processing…
            </div>
          </div>
        )}
        <h1 className="flex items-center justify-center gap-2 text-3xl font-bold tracking-tight">
          <span className="size-2.5 rounded-full bg-primary" />
          KiliMarkets
        </h1>
        <p className="mt-2 text-center text-muted-foreground">
          {mode === "signin" ? "Sign in to your account" : "Create your account"}
        </p>

        <form onSubmit={submit} className="mt-7 space-y-3">
          <Input
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="you@email.com"
            aria-label="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-14 rounded-xl bg-surface text-base"
          />
          <Input
            type="password"
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            aria-label="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-14 rounded-xl bg-surface text-base"
          />
          <Button type="submit" disabled={busy} aria-busy={busy} className="mt-5 h-14 w-full rounded-xl text-base font-semibold">
            {busy ? (
              <>
                <Loader2 className="animate-spin" />
                {mode === "signin" ? " Signing in…" : " Creating account…"}
              </>
            ) : mode === "signin" ? (
              "Sign in"
            ) : (
              "Create account"
            )}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here? " : "Already have an account? "}
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground"
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </main>
  );
}
