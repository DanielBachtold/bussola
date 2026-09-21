'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type NavItem = { href: string; label: string; icon: string; badge?: number };

export function Nav({ items, onLogout }: { items: NavItem[]; onLogout: () => Promise<void> }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

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
        <form action={onLogout} className="mt-auto">
          <button className="btn btn-ghost btn-sm w-full">Sair</button>
        </form>
      </aside>

      {/* celular: barra inferior */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-surface border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5">
          {items.filter((i) => i.href !== '/config' && i.href !== '/importar').slice(0, 5).map((it) => (
            <Link key={it.href} href={it.href} className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive(it.href) ? 'text-accent font-semibold' : 'text-ink-3'}`}>
              <span className="text-[18px] leading-none" aria-hidden>{it.icon}</span>
              {it.label}
              {it.badge ? <span className="absolute top-1 right-[calc(50%-18px)] pill pill-warn !px-1.5 !py-0 !text-[10px]">{it.badge}</span> : null}
            </Link>
          ))}
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
