'use client';

import { useSyncExternalStore } from 'react';
import { Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';

export type Theme = 'system' | 'light' | 'dark';
const KEY = 'bussola-theme';

export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const EVENT = 'bussola-theme-change';
function subscribe(cb: () => void) {
  window.addEventListener('storage', cb);
  window.addEventListener(EVENT, cb);
  return () => { window.removeEventListener('storage', cb); window.removeEventListener(EVENT, cb); };
}

/** Alternância Sistema / Claro / Escuro. A escolha fica no navegador do usuário. */
export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  // no servidor (e na hidratação) é sempre 'system'; no cliente lê o localStorage
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'system' as Theme);

  function choose(t: Theme) {
    applyTheme(t);
    try { localStorage.setItem(KEY, t); } catch { /* modo privado */ }
    window.dispatchEvent(new Event(EVENT));
  }

  const options: Array<[Theme, string, LucideIcon]> = [['system', 'Auto', Monitor], ['light', 'Claro', Sun], ['dark', 'Escuro', Moon]];
  return (
    <div role="radiogroup" aria-label="Tema" className={`inline-flex rounded-lg bg-surface-2 p-0.5 ${compact ? '' : 'w-full'}`}>
      {options.map(([t, label, Icon]) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => choose(t)}
          className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-medium whitespace-nowrap transition-colors ${theme === t ? 'bg-surface text-ink shadow-sm' : 'text-ink-3 hover:text-ink'}`}
          title={label}
          aria-label={label}
        >
          <Icon size={14} strokeWidth={1.75} aria-hidden />{compact ? '' : label}
        </button>
      ))}
    </div>
  );
}
