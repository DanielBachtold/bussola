'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CircleAlert, CircleCheck, Info, X } from 'lucide-react';

export type ToastInput = {
  text: string;
  tone?: 'good' | 'bad' | 'neutral';
  /** ação opcional (Desfazer, Ver...) */
  action?: { label: string; onClick: () => void | Promise<void> };
  /** ms; padrão 5000, 6500 quando há ação */
  duration?: number;
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

/** Avisos curtos no rodapé: sucesso, erro e "desfazer". Um por vez, com fila. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);
  const push = useCallback((t: ToastInput) => {
    const id = ++seq.current;
    setItems((list) => [...list.slice(-2), { ...t, id }]);
    setTimeout(() => dismiss(id), t.duration ?? (t.action ? 6500 : 5000));
  }, [dismiss]);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 z-40 flex flex-col items-center gap-2 px-4 md:items-end md:right-6 md:left-auto" style={{ bottom: 'calc(env(safe-area-inset-bottom) + 76px)' }} aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className="pointer-events-auto card flex items-center gap-2 pl-3 pr-1.5 py-2 text-[13px] shadow-lg max-w-[420px] w-full md:w-auto">
            {t.tone === 'bad' ? <CircleAlert size={16} className="text-bad shrink-0" /> : t.tone === 'good' ? <CircleCheck size={16} className="text-good shrink-0" /> : <Info size={16} className="text-ink-3 shrink-0" />}
            <span className="flex-1 min-w-0">{t.text}</span>
            {t.action ? (
              <button className="btn btn-ghost btn-sm !py-1 font-semibold text-accent" onClick={async () => { dismiss(t.id); await t.action!.onClick(); }}>{t.action.label}</button>
            ) : null}
            <button className="btn btn-ghost btn-sm !p-1.5" aria-label="Fechar" onClick={() => dismiss(t.id)}><X size={14} /></button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const push = useContext(ToastContext);
  if (!push) throw new Error('useToast precisa do ToastProvider');
  return push;
}
