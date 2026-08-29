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
    <form onSubmit={signIn} className="mx-auto mt-24 flex max-w-xs flex-col gap-3 p-4">
      <h1 className="text-2xl font-bold">Gainz</h1>
      <input className="rounded border p-2" type="email" placeholder="email"
        value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="rounded border p-2" type="password" placeholder="password"
        value={password} onChange={(e) => setPassword(e.target.value)} />
      <button className="rounded bg-black p-2 text-white" type="submit">Sign in</button>
      {err && <p className="text-sm text-red-600">{err}</p>}
    </form>
  );
}
