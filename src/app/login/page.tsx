"use client";

import { useActionState } from "react";
import { BRAND } from "@/config/brand";
import { signIn } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(signIn, undefined);
  return (
    <div className="mx-auto mt-16 max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="mb-1 text-xl font-bold">{`${BRAND.name} Dashboard`}</h1>
      <p className="mb-4 text-sm text-slate-500">Sign in to continue</p>
      <form action={formAction} className="space-y-3">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">Email</label>
          <input id="email" name="email" type="email" required autoComplete="email"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">Password</label>
          <input id="password" name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm" />
        </div>
        {state?.error ? <p className="text-sm text-red-600">{state.error}</p> : null}
        <button type="submit" disabled={pending}
          className="w-full rounded-md bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
