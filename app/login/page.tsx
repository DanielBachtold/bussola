'use client';

import { useActionState } from 'react';
import { login } from '@/app/actions/auth';

export default function LoginPage() {
  const [state, action, pending] = useActionState(login, undefined);
  return (
    <div className="min-h-full flex items-center justify-center p-6">
      <form action={action} className="card w-full max-w-sm p-6 flex flex-col gap-4">
        <div className="flex items-center gap-3">
          <svg width="36" height="36" viewBox="0 0 64 64" aria-hidden>
            <rect width="64" height="64" rx="14" fill="var(--accent)" />
            <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeWidth="3" />
            <path d="M32 14 L37 30 L32 50 L27 30 Z" fill="#fff" />
            <path d="M32 14 L37 30 L27 30 Z" fill="#eb6834" />
          </svg>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Bússola</h1>
            <p className="text-sm text-ink-2">Suas finanças, no seu controle.</p>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm text-ink-2">
          Senha
          <input name="password" type="password" autoFocus autoComplete="current-password" className="input" required />
        </label>
        {state?.error ? <p className="text-sm text-bad">{state.error}</p> : null}
        <button className="btn btn-primary" disabled={pending}>{pending ? 'Entrando...' : 'Entrar'}</button>
      </form>
    </div>
  );
}
