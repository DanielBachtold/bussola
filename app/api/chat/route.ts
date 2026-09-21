import Anthropic from '@anthropic-ai/sdk';
import { sessionOrNull } from '@/lib/session';
import { addChatMessage, createChat, getChatMessages } from '@/lib/queries';
import { buildSystemPrompt, runTool, toolDefinitions } from '@/lib/chat/tools';

export const maxDuration = 120;

const MODEL = 'claude-opus-5';

/**
 * Chat com ferramentas, em streaming. Só funciona com ANTHROPIC_API_KEY
 * definida; sem ela o sistema esconde o chat e nada aqui é chamado.
 * Protocolo: NDJSON, uma linha por evento {t: 'text'|'tool'|'done'|'error'}.
 */
export async function POST(req: Request) {
  if (!(await sessionOrNull())) return new Response('Unauthorized', { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return new Response('Chat desativado: defina ANTHROPIC_API_KEY.', { status: 503 });

  const body = (await req.json()) as { chatId?: number; message: string };
  const text = String(body.message ?? '').trim();
  if (!text) return new Response('Mensagem vazia', { status: 400 });

  const client = new Anthropic();
  const chatId = body.chatId ?? (await createChat(null));
  const history = await getChatMessages(chatId);

  // histórico: só o texto final de cada turno (blocos de ferramenta ficam dentro do turno)
  const messages: Anthropic.Beta.BetaMessageParam[] = history
    .filter((m) => m.display)
    .map((m) => ({ role: m.role, content: m.display as string }));
  messages.push({ role: 'user', content: text });
  await addChatMessage(chatId, 'user', { text }, text);

  const system = await buildSystemPrompt();
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: Record<string, unknown>) => controller.enqueue(encoder.encode(JSON.stringify(ev) + '\n'));
      let finalText = '';
      try {
        for (let iteration = 0; iteration < 12; iteration++) {
          const s = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 8000,
            system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
            tools: toolDefinitions,
            messages,
            thinking: { type: 'adaptive' },
            output_config: { effort: 'medium' },
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
          });
          let turnText = '';
          s.on('text', (delta) => { turnText += delta; send({ t: 'text', d: delta }); });
          const message = await s.finalMessage();
          finalText += (finalText && turnText ? '\n\n' : '') + turnText;

          if (message.stop_reason === 'refusal') { send({ t: 'error', message: 'O modelo recusou responder a esta pergunta.' }); break; }
          if (message.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: message.content }); continue; }
          if (message.stop_reason === 'max_tokens') { send({ t: 'error', message: 'Resposta cortada por tamanho.' }); break; }
          const toolUses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
          if (message.stop_reason !== 'tool_use' || toolUses.length === 0) break;

          messages.push({ role: 'assistant', content: message.content });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const tu of toolUses) {
            send({ t: 'tool', name: tu.name, status: 'start' });
            const r = await runTool(tu.name, tu.input);
            send({ t: 'tool', name: tu.name, status: 'end', ok: r.ok });
            results.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(r.ok ? r.result : { erro: r.error }), is_error: !r.ok });
          }
          messages.push({ role: 'user', content: results });
        }
        if (finalText) await addChatMessage(chatId, 'assistant', { text: finalText }, finalText);
        send({ t: 'done', chatId });
      } catch (err) {
        const msg = err instanceof Anthropic.AuthenticationError ? 'Chave da API inválida.'
          : err instanceof Anthropic.RateLimitError ? 'Limite de uso da API atingido, tente em instantes.'
          : err instanceof Anthropic.APIError ? `Erro da API (${err.status}): ${err.message}`
          : err instanceof Error ? err.message : 'Erro inesperado.';
        send({ t: 'error', message: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache' } });
}
