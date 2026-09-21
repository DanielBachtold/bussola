import { pool } from '@/lib/db';
import { requireSession } from '@/lib/session';
import { Nav, type NavItem } from '@/components/Nav';
import { logout } from '@/app/actions/auth';
import { getBudgetStatus } from '@/lib/budget';
import { tripAlerts } from '@/lib/trips';
import { postRecurring } from '@/lib/recurring';
import { TopAlerts } from '@/components/TopAlerts';
import { ToastProvider } from '@/components/Toast';

export default async function AppLayout({ children }: LayoutProps<'/'>) {
  await requireSession();
  // fixos cujo dia chegou viram lançamento (idempotente)
  await postRecurring().catch(() => 0);
  const { rows } = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM transactions WHERE reviewed = FALSE`);
  const pending = rows[0]?.n ?? 0;
  const [budget, trips] = await Promise.all([getBudgetStatus(), tripAlerts()]);
  const alerts = [
    ...budget.alerts.map((a) => ({ key: `b${a.groupId}`, tone: a.tone, title: a.title, detail: a.detail, href: '/#orcamento' })),
    ...trips.map((a, i) => ({ key: `t${i}`, tone: a.tone, title: a.title, detail: a.detail, href: a.href })),
  ];

  // mobile: true = barra inferior (Lançar vira o botão central); o resto vai pro "Mais"
  const items: NavItem[] = [
    { href: '/', label: 'Painel', icon: 'painel', mobile: true },
    { href: '/transacoes', label: 'Lançamentos', icon: 'lancamentos', mobile: true },
    { href: '/lancar', label: 'Lançar', icon: 'lancar', mobile: true },
    { href: '/revisar', label: 'Revisar', icon: 'revisar', badge: pending, mobile: true },
    { href: '/faturas', label: 'Faturas', icon: 'faturas' },
    { href: '/chat', label: 'Chat', icon: 'chat' },
    { href: '/viagens', label: 'Viagens', icon: 'viagens' },
    { href: '/investimentos', label: 'Investimentos', icon: 'investimentos' },
    { href: '/importar', label: 'Importar extrato', icon: 'importar' },
    { href: '/config', label: 'Configurações', icon: 'config' },
  ];

  return (
    <ToastProvider>
    <div className="min-h-full md:pl-56">
      <Nav items={items} onLogout={logout} />
      <main className="mx-auto w-full max-w-6xl px-4 py-5 md:px-8 md:py-8 pb-24 md:pb-10 overflow-x-clip" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        <TopAlerts alerts={alerts} />
        {children}
      </main>
    </div>
    </ToastProvider>
  );
}
