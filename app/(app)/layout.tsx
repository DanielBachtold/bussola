import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { Nav, type NavItem } from '@/components/Nav';
import { logout } from '@/app/actions/auth';
import { getBudgetStatus } from '@/lib/budget';
import { tripAlerts } from '@/lib/trips';
import { TopAlerts } from '@/components/TopAlerts';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  await requireSession();
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE reviewed = FALSE`);
  const pending = rows[0]?.n ?? 0;
  const [budget, trips] = await Promise.all([getBudgetStatus(), tripAlerts()]);
  const alerts = [
    ...budget.alerts.map((a) => ({ key: `b${a.groupId}`, tone: a.tone, title: a.title, detail: a.detail, href: '/#orcamento' })),
    ...trips.map((a, i) => ({ key: `t${i}`, tone: a.tone, title: a.title, detail: a.detail, href: a.href })),
  ];

  // mobile: true = aparece na barra inferior (4 itens + "Mais")
  const items: NavItem[] = [
    { href: '/', label: 'Painel', icon: '◎', mobile: true },
    { href: '/lancar', label: 'Lançar', icon: '＋', mobile: true },
    { href: '/transacoes', label: 'Lançamentos', icon: '☰', mobile: true },
    { href: '/revisar', label: 'Revisar', icon: '✓', badge: pending, mobile: true },
    { href: '/chat', label: 'Chat', icon: '✦' },
    { href: '/faturas', label: 'Faturas', icon: '▤' },
    { href: '/viagens', label: 'Viagens', icon: '✈' },
    { href: '/investimentos', label: 'Investimentos', icon: '◆' },
    { href: '/importar', label: 'Importar extrato', icon: '⇪' },
    { href: '/config', label: 'Configurações', icon: '⚙' },
  ];

  return (
    <div className="min-h-full md:pl-56">
      <Nav items={items} onLogout={logout} />
      <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-10 overflow-x-clip" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <TopAlerts alerts={alerts} />
        {children}
      </main>
    </div>
  );
}
