'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  ClipboardCheck, CreditCard, Ellipsis, Grid2x2, LayoutDashboard, List, LogOut, MessageSquare, Plane, Plus, Settings, TrendingUp, Upload,
  type LucideIcon,
} from 'lucide-react';
import { ThemeToggle } from './ThemeToggle';

export type NavIcon = 'painel' | 'lancar' | 'chat' | 'lancamentos' | 'revisar' | 'faturas' | 'categorias' | 'viagens' | 'investimentos' | 'importar' | 'config';
export type NavItem = { href: string; label: string; icon: NavIcon; badge?: number; mobile?: boolean };

const ICONS: Record<NavIcon, LucideIcon> = {
  painel: LayoutDashboard, lancar: Plus, chat: MessageSquare, lancamentos: List, revisar: ClipboardCheck,
  faturas: CreditCard, categorias: Grid2x2, viagens: Plane, investimentos: TrendingUp, importar: Upload, config: Settings,
};

export function Nav({ items, onLogout }: { items: NavItem[]; onLogout: () => Promise<void> }) {
  const pathname = usePathname();
  const [more, setMore] = useState(false);
  const isActive = (href: string) => (href === '/' ? pathname === '/' : pathname.startsWith(href));

  const primary = items.filter((i) => i.mobile && i.href !== '/lancar');
  const rest = items.filter((i) => !i.mobile);
  const moreActive = rest.some((i) => isActive(i.href));

  return (
    <>
      {/* desktop: barra lateral */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-56 flex-col gap-0.5 p-4 border-r border-border bg-surface">
        <Link href="/" className="flex items-center gap-2 px-2 py-3 mb-2">
          <Logo />
          <span className="font-semibold text-[17px] tracking-tight">Bússola</span>
        </Link>
        {items.filter((it) => it.href !== '/config').map((it) => {
          const Icon = ICONS[it.icon];
          const active = isActive(it.href);
          return (
            <Link
              key={it.href}
              href={it.href}
              className={`relative flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] transition-colors ${active ? 'bg-surface-2 text-ink font-semibold' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'}`}
            >
              {active ? <span className="absolute left-0 top-2 bottom-2 w-[3px] rounded-r bg-accent" aria-hidden /> : null}
              <Icon size={18} strokeWidth={1.75} className="shrink-0" aria-hidden />
              <span className="flex-1">{it.label}</span>
              {it.badge ? <span className="pill pill-warn">{it.badge}</span> : null}
            </Link>
          );
        })}
        <div className="mt-auto flex items-center gap-1">
          <ThemeToggle compact />
          <span className="flex-1" />
          <Link href="/config" className={`btn btn-ghost btn-sm !p-2 ${isActive('/config') ? 'text-ink bg-surface-2' : ''}`} title="Configurações" aria-label="Configurações"><Settings size={18} strokeWidth={1.75} /></Link>
          <form action={onLogout}>
            <button className="btn btn-ghost btn-sm !p-2" title="Sair" aria-label="Sair"><LogOut size={18} strokeWidth={1.75} /></button>
          </form>
        </div>
      </aside>

      {/* celular: barra inferior + menu "mais" */}
      {more ? (
        <div className="md:hidden fixed inset-0 z-20 bg-black/40" onClick={() => setMore(false)}>
          <div className="absolute bottom-0 inset-x-0 card rounded-b-none p-4 flex flex-col gap-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 84px)' }} onClick={(e) => e.stopPropagation()}>
            {rest.map((it) => {
              const Icon = ICONS[it.icon];
              return (
                <Link key={it.href} href={it.href} onClick={() => setMore(false)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] ${isActive(it.href) ? 'bg-surface-2 font-semibold' : 'text-ink-2'}`}>
                  <Icon size={20} strokeWidth={1.75} aria-hidden />
                  <span className="flex-1">{it.label}</span>
                  {it.badge ? <span className="pill pill-warn">{it.badge}</span> : null}
                </Link>
              );
            })}
            <div className="hairline my-2" />
            <div className="flex items-center justify-between gap-3 px-1">
              <ThemeToggle />
              <form action={onLogout}><button className="btn btn-ghost btn-sm"><LogOut size={16} className="mr-1" />Sair</button></form>
            </div>
          </div>
        </div>
      ) : null}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/90 backdrop-blur-md border-t border-border" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 items-end">
          {primary.slice(0, 2).map((it) => <Tab key={it.href} item={it} active={isActive(it.href) && !more} onClick={() => setMore(false)} />)}
          <Link href="/lancar" onClick={() => setMore(false)} className="flex flex-col items-center gap-1 pb-1.5 -mt-4" aria-label="Lançar">
            <span className={`w-13 h-13 rounded-full flex items-center justify-center text-accent-ink shadow-md transition-transform active:scale-95 ${isActive('/lancar') ? 'bg-accent ring-4 ring-accent/20' : 'bg-accent'}`}>
              <Plus size={26} strokeWidth={2.25} />
            </span>
            <span className={`text-[11px] ${isActive('/lancar') ? 'text-ink font-semibold' : 'text-ink-3'}`}>Lançar</span>
          </Link>
          {primary.slice(2, 3).map((it) => <Tab key={it.href} item={it} active={isActive(it.href) && !more} onClick={() => setMore(false)} />)}
          <button type="button" onClick={() => setMore((m) => !m)} className={`relative flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] ${more || moreActive ? 'text-ink font-semibold' : 'text-ink-3'}`} aria-expanded={more}>
            <Ellipsis size={22} strokeWidth={1.75} aria-hidden />
            Mais
            <Dot show={more || moreActive} />
          </button>
        </div>
      </nav>
    </>
  );
}

function Tab({ item, active, onClick }: { item: NavItem; active: boolean; onClick?: () => void }) {
  const Icon = ICONS[item.icon];
  return (
    <Link href={item.href} onClick={onClick} className={`relative flex flex-col items-center gap-1 pt-2 pb-1.5 text-[11px] ${active ? 'text-ink font-semibold' : 'text-ink-3'}`}>
      <span className="relative">
        <Icon size={22} strokeWidth={active ? 2 : 1.75} aria-hidden />
        {item.badge ? <span className="absolute -top-1.5 left-full -ml-1 pill pill-warn !px-1.5 !py-0 !text-[10px] leading-4">{item.badge}</span> : null}
      </span>
      {item.label}
      <Dot show={active} />
    </Link>
  );
}

function Dot({ show }: { show: boolean }) {
  return <span className={`absolute -bottom-0.5 w-1 h-1 rounded-full bg-accent transition-transform duration-200 ${show ? 'scale-100' : 'scale-0'}`} aria-hidden />;
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
