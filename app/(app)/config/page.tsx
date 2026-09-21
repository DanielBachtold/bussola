import { pool } from '@/lib/db';
import { listAccounts, listCategories } from '@/lib/queries';
import { listRules } from '@/lib/rules';
import { AccountsPanel, CategoriesPanel, RulesPanel } from './Panels';

export const metadata = { title: 'Configurações' };

export default async function ConfigPage() {
  const [accounts, categories, rules] = await Promise.all([listAccounts(pool, true), listCategories(), listRules(pool)]);
  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[22px] font-semibold tracking-tight">Configurações</h1>
        <p className="text-sm text-ink-2">Contas, cartões, categorias e as regras que o sistema aprendeu.</p>
      </header>
      <AccountsPanel accounts={accounts} />
      <CategoriesPanel categories={categories} />
      <RulesPanel rules={rules} categories={categories} />
    </div>
  );
}
