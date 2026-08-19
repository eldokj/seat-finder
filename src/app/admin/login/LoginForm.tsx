"use client";

import { useActionState } from "react";
import { signInAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signInAction, initialState);

  return (
    <form action={formAction} className="w-full" noValidate>
      <div className="mb-4">
        <label htmlFor="email" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
        />
      </div>

      <div className="mb-5">
        <label htmlFor="password" className="mb-1.5 block text-sm font-semibold text-slate-700">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          disabled={isPending}
          className="w-full rounded-lg border border-slate-300 px-4 py-2.5 text-base text-slate-900 outline-none transition focus:border-slate-600 focus:ring-2 focus:ring-slate-200 disabled:bg-slate-100"
        />
      </div>

      {state.error && (
        <p role="alert" className="mb-4 text-sm font-medium text-red-600">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-slate-900 px-4 py-2.5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        {isPending ? "Signing in…" : "Sign In"}
      </button>
    </form>
  );
}
