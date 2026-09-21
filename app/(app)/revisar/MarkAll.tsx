'use client';

import { useTransition } from 'react';
import { markAllReviewed } from '@/app/actions/transactions';
import { useToast } from '@/components/Toast';

export function MarkAllButton({ count }: { count: number }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  return (
    <button className="btn btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm(`Marcar os ${count} como revisados, sem categoria?`)) start(async () => { const r = await markAllReviewed(); toast(r.error ? { tone: 'bad', text: r.error } : { tone: 'good', text: r.message ?? 'Feito.' }); }); }}>
      Marcar restantes como revisados
    </button>
  );
}
