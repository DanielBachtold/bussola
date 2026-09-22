'use client';

import { useState, useTransition } from 'react';
import { UserCheck } from 'lucide-react';
import { addMyName } from '@/app/actions/transfers';
import { formatBRL } from '@/lib/money';
import type { NameSuggestion } from '@/lib/transfers';
import { useToast } from '@/components/Toast';

/**
 * Quem aparece mandando e recebendo no extrato costuma ser a própria pessoa.
 * Um toque ensina isso ao sistema, e os Pix entre contas dela param de virar gasto.
 */
export function WhoAmI({ suggestions }: { suggestions: NameSuggestion[] }) {
  const toast = useToast();
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (!suggestions.length || done) return null;
  return (
    <section className="card p-4 flex flex-col gap-2 border-l-4 border-l-accent">
      <div>
        <h2 className="font-semibold flex items-center gap-2"><UserCheck size={18} /> Algum desses nomes é você?</h2>
        <p className="text-[13px] text-ink-2">Eles aparecem no extrato mandando e recebendo dinheiro. Se for a sua conta em outro banco, marque: o que vai e volta entre as suas contas deixa de contar como gasto.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {suggestions.map((s) => (
          <button
            key={s.name}
            className="pill !py-1.5 !px-3 !text-[13px] hover:bg-surface"
            disabled={pending}
            onClick={() => start(async () => { const r = await addMyName(s.name); setDone(true); toast(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: r.message ?? 'Salvo.' }); })}
            title={`${s.sent} enviados, ${s.received} recebidos, ${formatBRL(s.total)} no total`}
          >
            sou eu: <span className="font-medium ml-1">{s.name}</span>
          </button>
        ))}
        <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => setDone(true)}>Nenhum</button>
      </div>
    </section>
  );
}
