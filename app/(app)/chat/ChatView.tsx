'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type Msg = { role: 'user' | 'assistant'; text: string; tools?: string[] };

const TOOL_LABEL: Record<string, string> = {
  resumo_mes: 'consultando o resumo do mês',
  listar_transacoes: 'buscando lançamentos',
  faturas: 'olhando as faturas',
  serie_mensal: 'comparando os meses',
  investimentos: 'lendo a posição de investimentos',
  registrar_lancamento: 'registrando',
};

const SUGGESTIONS = [
  'Como está meu mês até agora?',
  'Quanto gastei com alimentação nos últimos 3 meses?',
  'Qual vai ser minha próxima fatura e quando vence?',
  'O que mais subiu em relação à média?',
];

export function ChatView({ chatId, chats, initial }: { chatId: number | null; chats: { id: number; title: string }[]; initial: Msg[] }) {
  const router = useRouter();
  const [msgs, setMsgs] = useState<Msg[]>(initial);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [currentId, setCurrentId] = useState<number | null>(chatId);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setInput('');
    setBusy(true);
    setMsgs((m) => [...m, { role: 'user', text }, { role: 'assistant', text: '', tools: [] }]);
    try {
      const res = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chatId: currentId, message: text }) });
      if (!res.ok || !res.body) throw new Error(await res.text());
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          setMsgs((m) => {
            const last = { ...m[m.length - 1] };
            if (ev.t === 'text') last.text += ev.d;
            else if (ev.t === 'tool' && ev.status === 'start') last.tools = [...(last.tools ?? []), ev.name];
            else if (ev.t === 'error') last.text += (last.text ? '\n\n' : '') + `⚠ ${ev.message}`;
            else if (ev.t === 'done' && !currentId) { setCurrentId(ev.chatId); router.replace(`/chat?c=${ev.chatId}`); }
            return [...m.slice(0, -1), last];
          });
        }
      }
    } catch (err) {
      setMsgs((m) => [...m.slice(0, -1), { role: 'assistant', text: `⚠ ${err instanceof Error ? err.message : 'Erro'}` }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 h-[calc(100dvh-140px)] md:h-[calc(100dvh-110px)]">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight">Chat</h1>
          <p className="text-sm text-ink-2">Pergunte sobre seus números. As respostas vêm do seu banco de dados, não de chute.</p>
        </div>
        <div className="flex gap-1 items-center">
          <select className="input !w-auto !py-1.5 text-[13px]" value={currentId ?? ''} onChange={(e) => router.push(e.target.value ? `/chat?c=${e.target.value}` : '/chat')}>
            <option value="">Nova conversa</option>
            {chats.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
          <Link href="/chat" className="btn btn-ghost btn-sm">＋</Link>
        </div>
      </header>

      <div className="card flex-1 overflow-y-auto p-4 flex flex-col gap-3">
        {!msgs.length ? (
          <div className="m-auto flex flex-col gap-2 items-center text-center max-w-md">
            <p className="text-ink-2 text-sm">Algumas ideias:</p>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => <button key={s} className="btn btn-ghost btn-sm" onClick={() => send(s)}>{s}</button>)}
            </div>
          </div>
        ) : null}
        {msgs.map((m, i) => (
          <div key={i} className={`max-w-[85%] ${m.role === 'user' ? 'self-end' : 'self-start'}`}>
            {m.tools?.length ? <p className="text-[11px] text-ink-3 mb-1">{m.tools.map((t) => TOOL_LABEL[t] ?? t).join(' · ')}</p> : null}
            <div className={`rounded-2xl px-4 py-2.5 text-[14px] whitespace-pre-wrap leading-relaxed ${m.role === 'user' ? 'bg-accent text-accent-ink rounded-br-md' : 'bg-surface-2 rounded-bl-md'}`}>
              {m.text || (busy && i === msgs.length - 1 ? <span className="text-ink-3">pensando...</span> : '')}
            </div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      <form onSubmit={(e) => { e.preventDefault(); send(input); }} className="flex gap-2">
        <input className="input !py-3" placeholder="Pergunte ou peça para registrar algo..." value={input} onChange={(e) => setInput(e.target.value)} disabled={busy} autoFocus />
        <button className="btn btn-primary !px-5" disabled={busy || !input.trim()}>{busy ? '...' : 'Enviar'}</button>
      </form>
    </div>
  );
}
