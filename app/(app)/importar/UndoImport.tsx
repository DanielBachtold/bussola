'use client';

import { useTransition } from 'react';
import { undoImport } from '@/app/actions/import';
import { useToast } from '@/components/Toast';

export function UndoImport({ importId, filename }: { importId: number; filename: string }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button
      className="btn btn-ghost btn-sm text-bad"
      disabled={pending}
      onClick={() => { if (confirm(`Desfazer a importação de ${filename}? O que ela inseriu é apagado e o que conciliou volta a "sem extrato".`)) start(async () => { const r = await undoImport(importId); toast(r.ok ? { tone: 'good', text: `Desfeita: ${r.deleted} apagados, ${r.unmatched} voltaram a pendentes.` } : { tone: 'bad', text: r.error }); }); }}
    >
      {pending ? 'Desfazendo...' : 'Desfazer'}
    </button>
  );
}
