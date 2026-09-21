'use client';

import { useEffect, useRef } from 'react';

/** Faixa horizontal que abre já rolada até o item marcado com data-active. */
export function ScrollStrip({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const active = ref.current?.querySelector<HTMLElement>('[data-active="true"]');
    active?.scrollIntoView({ inline: 'center', block: 'nearest' });
  }, []);
  return <div ref={ref} className={className}>{children}</div>;
}
