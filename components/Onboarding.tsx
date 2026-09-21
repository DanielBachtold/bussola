import Link from 'next/link';
import { Check, Smartphone } from 'lucide-react';
import type { Step } from '@/lib/onboarding';
import { dismissOnboarding } from '@/app/actions/onboarding';

export function Onboarding({ steps, done }: { steps: Step[]; done: number }) {
  const next = steps.find((s) => !s.done);
  return (
    <section className="card p-4 flex flex-col gap-3 border-l-4 border-l-accent">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="font-semibold">Primeiros passos</h2>
          <p className="text-[13px] text-ink-2">{done} de {steps.length} feitos. {next ? `Próximo: ${next.title.toLowerCase()}.` : 'Tudo pronto.'}</p>
        </div>
        <form action={dismissOnboarding}><button className="btn btn-ghost btn-sm text-ink-3">Esconder</button></form>
      </div>
      <ol className="flex flex-col divide-y divide-border">
        {steps.map((s, i) => (
          <li key={s.key} className="py-2 flex items-start gap-3 text-[13px]">
            <span className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-[11px] font-semibold ${s.done ? 'bg-good text-white' : s === next ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-ink-3'}`}>{s.done ? <Check size={12} strokeWidth={3} /> : i + 1}</span>
            <span className="flex-1 min-w-0">
              <Link href={s.href} className={`font-medium ${s.done ? 'line-through text-ink-3' : 'hover:underline'}`}>{s.title}</Link>
              {!s.done ? <span className="block text-ink-2">{s.detail}</span> : null}
            </span>
          </li>
        ))}
        <li className="py-2 flex items-start gap-3 text-[13px]">
          <span className="mt-0.5 w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-surface-2 text-ink-3"><Smartphone size={12} /></span>
          <span className="flex-1 text-ink-2"><span className="font-medium text-ink">No celular, adicione à tela de início</span>: Safari, botão de compartilhar, &ldquo;Adicionar à Tela de Início&rdquo;. Vira um app, com atalho de Lançar.</span>
        </li>
      </ol>
    </section>
  );
}
