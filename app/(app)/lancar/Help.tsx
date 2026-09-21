'use client';

import { useState } from 'react';
import { CircleHelp, X } from 'lucide-react';

/** Exemplos da barra, escondidos atrás de um "?" pra não empurrar o campo no celular. */
export function Help() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn btn-ghost btn-sm !p-2" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="Como escrever"><CircleHelp size={18} /></button>
      {open ? (
        <div className="fixed inset-0 z-30 bg-black/40 flex items-end md:items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="card p-4 w-full max-w-md flex flex-col gap-2 text-[14px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between"><span className="font-semibold">Como escrever</span><button className="btn btn-ghost btn-sm !p-1.5" onClick={() => setOpen(false)} aria-label="Fechar"><X size={16} /></button></div>
            <ul className="flex flex-col gap-1.5 text-ink-2">
              <li><code className="font-mono text-ink">almoço 42 crédito rico</code>: valor, dica de cartão e o nome da conta.</li>
              <li><code className="font-mono text-ink">mercado 350 em 3x</code>: parcelas caem cada uma na sua fatura.</li>
              <li><code className="font-mono text-ink">recebi 5000 salário nubank</code>: receita.</li>
              <li><code className="font-mono text-ink">ontem farmácia 89 débito</code> ou <code className="font-mono text-ink">dia 15 …</code>: data.</li>
              <li><code className="font-mono text-ink">aporte 2000 rico</code> / <code className="font-mono text-ink">resgatei 500 rico</code>: transferência com a corretora.</li>
              <li>Colou a notificação do banco? Também vale: <code className="font-mono text-ink">Compra aprovada R$ 42,00 em PADARIA</code>.</li>
            </ul>
            <p className="text-[12px] text-ink-3">Sem conta na frase, uso o cartão (gasto) ou a conta corrente (receita). Categoria vem das regras e do que você já lançou.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
