import { pool } from '@/lib/db';
import { listAccounts, listCategories } from '@/lib/queries';
import { listRules } from '@/lib/rules';
import { AccountsPanel, CategoriesPanel, RulesPanel } from './Panels';
import { BudgetPanel } from './BudgetPanel';
import { RecurringPanel } from './RecurringPanel';
import { listRecurring } from '@/lib/recurring';
import { getBudgetStatus, getSetting, listGroups } from '@/lib/budget';

export const metadata = { title: 'Configurações' };

import { requireSession } from '@/lib/session';

export default async function ConfigPage() {
  await requireSession();
  const [accounts, categories, rules, groups, status, income, threshold, recurring] = await Promise.all([
    listAccounts(pool, true), listCategories(), listRules(pool), listGroups(), getBudgetStatus(), getSetting('monthly_income'), getSetting('alert_threshold'), listRecurring(),
  ]);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-ink-2">Contas, cartões, categorias e as regras que o sistema aprendeu.</p>
      </header>
      <AccountsPanel accounts={accounts} />
      <RecurringPanel rules={recurring} accounts={accounts.filter((a) => !a.archived)} categories={categories} />
      <BudgetPanel status={status} groups={groups} categories={categories} monthlyIncome={income ?? ''} threshold={Number(threshold ?? 80)} />
      <CategoriesPanel categories={categories} />
      <RulesPanel rules={rules} categories={categories} />
    </div>
  );
}
