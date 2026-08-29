"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setErr(error.message);
    else router.replace("/");
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-xs">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-foreground">Gainz</h1>
          <p className="mt-1 text-sm text-muted">Track your lifts. Track your macros.</p>
        </div>
        <form onSubmit={signIn} className="flex flex-col gap-3">
          <input
            className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            type="email" placeholder="Email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <input
            className="rounded-xl border border-border bg-surface px-4 py-3.5 text-base text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
            type="password" placeholder="Password"
            value={password} onChange={(e) => setPassword(e.target.value)} />
          <button
            className="mt-2 rounded-xl bg-accent px-4 py-3.5 text-center text-base font-semibold text-accent-foreground active:opacity-80"
            type="submit">
            Sign in
          </button>
          {err && <p className="text-sm text-danger">{err}</p>}
        </form>
      </div>
    </main>
  );
}
