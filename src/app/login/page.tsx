"use client";

import { useActionState } from "react";
import { BRAND } from "@/config/brand";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-lg">
      <h1 className="mb-1 text-xl font-bold">{`${BRAND.name}`}</h1>
      <p className="mb-5 text-sm text-slate-500">{BRAND.productName} — admin sign in</p>
      <form action={formAction} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">Username</label>
          <input id="email" name="email" type="text" required autoComplete="username" placeholder="admin123"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password" placeholder="••••••••"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-slate-900" />
        </div>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending}
          className="w-full rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
