'use client';

import { useState, useTransition } from 'react';
import { ArrowLeftRight, X } from 'lucide-react';
import { dismissTransferPattern, reclassify, undoReclassify } from '@/app/actions/transfers';
import { formatBRL } from '@/lib/money';
import type { TransferCandidate } from '@/lib/transfers';
import { useToast } from '@/components/Toast';

const WHY: Record<TransferCandidate['reason'], string> = {
  nome: 'tem o seu nome na contraparte',
  palavra: 'parece investimento ou conta guardada',
  valor: 'transferência alta e redonda',
};

/**
 * Pix pra si mesmo, caixinha e compra de ativo entram como gasto e estufam o mês.
 * Aqui eles aparecem agrupados: um toque marca todos como transferência.
 */
export function TransferCheck({ candidates }: { candidates: TransferCandidate[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [hidden, setHidden] = useState<string[]>([]);
  const list = candidates.filter((c) => !hidden.includes(c.key));
  if (!list.length) return null;
  const total = list.reduce((a, c) => a + c.total, 0);

  return (
    <section className="card p-4 flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <h2 className="font-semibold">Isso é gasto mesmo? <span className="pill pill-warn ml-1">{list.length}</span></h2>
        <span className="text-[13px] text-ink-2">{formatBRL(total)} em jogo</span>
      </div>
      <p className="text-[13px] text-ink-3">Dinheiro que só mudou de lugar (Pix pra você mesmo, caixinha, compra de ativo) não é gasto. Marcar como transferência tira do gasto do mês e do orçamento, sem apagar nada.</p>
      <ul className="flex flex-col divide-y divide-border">
        {list.map((c) => (
          <li key={c.key} className="py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="flex-1 min-w-[180px]">
              <span className="block text-[14px] font-medium truncate">{c.label}</span>
              <span className="block text-[12px] text-ink-3">{c.count} {c.count === 1 ? 'lançamento' : 'lançamentos'} · {c.kind === 'expense' ? 'contado como gasto' : 'contado como receita'} · {WHY[c.reason]}</span>
            </span>
            <span className="font-semibold">{formatBRL(c.total)}</span>
            <span className="flex gap-1">
              <button
                className="btn btn-primary btn-sm"
                disabled={pending}
                onClick={() => start(async () => {
                  const r = await reclassify(c.ids, 'transfer');
                  if (r.error) { toast({ tone: 'bad', text: r.error }); return; }
                  const before = r.before ?? [];
                  setHidden((h) => [...h, c.key]);
                  toast({ tone: 'good', text: `${r.changed} ${r.changed === 1 ? 'lançamento virou' : 'lançamentos viraram'} transferência.`, action: { label: 'Desfazer', onClick: async () => { await undoReclassify(before); setHidden((h) => h.filter((k) => k !== c.key)); } } });
                })}
              >
                <ArrowLeftRight size={14} className="mr-1" />É transferência
              </button>
              <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { setHidden((h) => [...h, c.key]); await dismissTransferPattern(c.key); })} title="Manter como está e não perguntar de novo">
                <X size={14} className="mr-1" />É gasto
              </button>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
