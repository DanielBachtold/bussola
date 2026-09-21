'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { ThemeToggle } from './ThemeToggle';

export type NavItem = { href: string; label: string; icon: string; badge?: number; mobile?: boolean };

export function Nav({ items, onLogout }: { items: NavItem[]; onLogout: () => Promise<void> }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const primary = items.filter((i) => i.mobile);
  const rest = items.filter((i) => !i.mobile);
  const restBadge = rest.reduce((a, i) => a + (i.badge ?? 0), 0);
  const moreActive = rest.some((i) => isActive(i.href));

  return (
    <>
      {/* desktop: barra lateral */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 flex-col gap-1 p-4 border-r border-border bg-surface">
        <Link href="/" className="flex items-center gap-2 px-2 py-3 mb-2">
          <Logo />
          <span className="font-semibold text-[17px] tracking-tight">Bússola</span>
        </Link>
        {items.map((it) => (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] ${isActive(it.href) ? 'bg-surface-2 text-ink font-semibold' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
          >
            <span className="w-5 text-center" aria-hidden>{it.icon}</span>
            <span className="flex-1">{it.label}</span>
            {it.badge ? <span className="pill pill-warn">{it.badge}</span> : null}
          </Link>
        ))}
        <div className="mt-auto flex flex-col gap-2">
          <ThemeToggle />
          <form action={onLogout}>
            <button className="btn btn-ghost btn-sm w-full">Sair</button>
          </form>
        </div>
      </aside>

      {/* celular: barra inferior + menu "mais" */}
      {more ? (
        <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => setMore(false)}>
          <div className="absolute bottom-0 inset-x-0 card !rounded-b-none p-4 flex flex-col gap-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 76px)' }} onClick={(e) => e.stopPropagation()}>
            {rest.map((it) => (
              <Link key={it.href} href={it.href} onClick={() => setMore(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${isActive(it.href) ? 'bg-surface-2 font-semibold' : 'text-ink-2'}`}>
                <span className="w-5 text-center" aria-hidden>{it.icon}</span>
                <span className="flex-1">{it.label}</span>
                {it.badge ? <span className="pill pill-warn">{it.badge}</span> : null}
              </Link>
            ))}
            <div className="hairline my-2" />
            <div className="flex items-center justify-between gap-3 px-1">
              <ThemeToggle />
              <form action={onLogout}><button className="btn btn-ghost btn-sm">Sair</button></form>
            </div>
          </div>
        </div>
      ) : null}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {primary.map((it) => (
            <Link key={it.href} href={it.href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(it.href) && !more ? 'text-accent font-semibold' : 'text-ink-3'}`}>
              <span className="text-[18px] leading-none" aria-hidden>{it.icon}</span>
              {it.label}
              {it.badge ? <span className="absolute top-1 right-[calc(50%-18px)] pill pill-warn !px-1.5 !py-0 !text-[10px]">{it.badge}</span> : null}
            </Link>
          ))}
          <button type="button" onClick={() => setMore((m) => !m)} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${more || moreActive ? 'text-accent font-semibold' : 'text-ink-3'}`} aria-expanded={more}>
            <span className="text-[18px] leading-none" aria-hidden>⋯</span>
            Mais
            {restBadge ? <span className="absolute top-1 right-[calc(50%-18px)] pill pill-warn !px-1.5 !py-0 !text-[10px]">{restBadge}</span> : null}
          </button>
        </div>
      </nav>
    </>
  );
}

function Logo() {
  return (
    <svg width="26" height="26" viewBox="0 0 64 64" aria-hidden>
      <rect width="64" height="64" rx="14" fill="var(--accent)" />
      <circle cx="32" cy="32" r="20" fill="none" stroke="#fff" strokeWidth="3" />
      <path d="M32 14 L37 30 L32 50 L27 30 Z" fill="#fff" />
      <path d="M32 14 L37 30 L27 30 Z" fill="#eb6834" />
    </svg>
  );
}
