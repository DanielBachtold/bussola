import { getChatMessages, listChats } from '@/lib/queries';
import { ChatView } from './ChatView';

export const metadata = { title: 'Chat' };

export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const enabled = Boolean(process.env.ANTHROPIC_API_KEY);
  if (!enabled) {
    return (
      <div className="card p-5 max-w-xl flex flex-col gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight">Chat</h1>
        <p className="text-sm text-ink-2">O chat com IA está desligado. Para ativar, defina a variável <code className="font-mono">ANTHROPIC_API_KEY</code> no servidor. Todo o resto do sistema funciona sem ela.</p>
      </div>
    );
  }
  const sp = await searchParams;
  const chatId = Number(sp.c) || null;
  const [chats, messages] = await Promise.all([listChats(), chatId ? getChatMessages(chatId) : Promise.resolve([])]);
  return (
    <ChatView
      chatId={chatId}
      chats={chats.map((c) => ({ id: c.id, title: c.title ?? 'Conversa' }))}
      initial={messages.filter((m) => m.display).map((m) => ({ role: m.role, text: m.display as string }))}
    />
  );
}
