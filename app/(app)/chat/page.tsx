import { getChatMessages, listChats } from '@/lib/queries';
import { ChatView } from './ChatView';
import { intParam } from '@/lib/params';

export const metadata = { title: 'Chat' };

import { requireSession } from '@/lib/session';

export default async function ChatPage({ searchParams }: PageProps<'/chat'>) {
  await requireSession();
  const mode = process.env.ANTHROPIC_API_KEY ? 'ai' : 'local';
  const sp = await searchParams;
  const chatId = intParam(sp.c) ?? null;
  const [chats, messages] = await Promise.all([listChats(), chatId ? getChatMessages(chatId) : Promise.resolve([])]);
  return (
    <ChatView
      key={chatId ?? 'new'}
      mode={mode}
      chatId={chatId}
      chats={chats.map((c) => ({ id: c.id, title: c.title ?? 'Conversa' }))}
      initial={messages.filter((m) => m.display).map((m) => ({ role: m.role, text: m.display as string }))}
    />
  );
}
