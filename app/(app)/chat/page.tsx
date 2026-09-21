import { getChatMessages, listChats } from '@/lib/queries';
import { ChatView } from './ChatView';

export const metadata = { title: 'Chat' };

export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  const mode = process.env.ANTHROPIC_API_KEY ? 'ai' : 'local';
  const sp = await searchParams;
  const chatId = Number(sp.c) || null;
  const [chats, messages] = await Promise.all([listChats(), chatId ? getChatMessages(chatId) : Promise.resolve([])]);
  return (
    <ChatView
      mode={mode}
      chatId={chatId}
      chats={chats.map((c) => ({ id: c.id, title: c.title ?? 'Conversa' }))}
      initial={messages.filter((m) => m.display).map((m) => ({ role: m.role, text: m.display as string }))}
    />
  );
}
