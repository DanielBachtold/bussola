import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { Nav, type NavItem } from '@/components/Nav';
import { logout } from '@/app/actions/auth';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  await requireSession();
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE reviewed = FALSE`);
  const pending = rows[0]?.n ?? 0;
  const chatEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  const items: NavItem[] = [
    { href: '/', label: 'Painel', icon: '◎' },
    { href: '/lancar', label: 'Lançar', icon: '＋' },
    { href: '/transacoes', label: 'Extrato', icon: '☰' },
    { href: '/faturas', label: 'Faturas', icon: '▤' },
    ...(chatEnabled ? [{ href: '/chat', label: 'Chat', icon: '✦' }] : [{ href: '/revisar', label: 'Revisar', icon: '✓', badge: pending }]),
    ...(chatEnabled ? [{ href: '/revisar', label: 'Revisar', icon: '✓', badge: pending }] : []),
    { href: '/investimentos', label: 'Investimentos', icon: '◆' },
    { href: '/importar', label: 'Importar extrato', icon: '⇪' },
    { href: '/config', label: 'Configurações', icon: '⚙' },
  ];

  return (
    <div className="min-h-full md:pl-56">
      <Nav items={items} onLogout={logout} />
      <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-10">{children}</main>
    </div>
  );
}
