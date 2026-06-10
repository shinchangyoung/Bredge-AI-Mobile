import EventSource, { EventSourceEvent } from 'react-native-sse';
import { getWorkspaceApiBaseUrl } from '../../workspace-api';

export type ChatPayload = {
  question: string;
  is_thinking?: boolean;
  session_id?: string | null;
  source_filter?: Record<string, unknown> | null;
};

export type ChatMessageItem = {
  id?: string;
  role: 'user' | 'ai';
  text: string;
  thinking?: string;
  citations?: any[];
  phase?: string;
  statusText?: string;
};

export function startChatStream(
  payload: ChatPayload,
  callbacks: {
    onStatus?: (phase: string, message: string) => void;
    onCitations?: (citations: any[]) => void;
    onToken?: (token: string) => void;
    onError?: (error: string) => void;
    onDone?: () => void;
  }
) {
  const url = `${getWorkspaceApiBaseUrl()}/chat/stream`;

  const es = new EventSource(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      question: payload.question,
      is_thinking: payload.is_thinking ?? false,
      session_id: payload.session_id || null,
      source_filter: payload.source_filter || null,
    }),
  });

  // react-native-sse uses different event types. For server-sent "message", it emits 'message'
  es.addEventListener('message', (event) => {
    // Typescript might complain about event.data not existing on generic type
    const sseEvent = event as unknown as { data: string };
    if (!sseEvent.data) return;

    if (sseEvent.data === '[DONE]') {
      es.close();
      callbacks.onDone?.();
      return;
    }

    try {
      const data = JSON.parse(sseEvent.data);
      if (data.type === 'status') {
        callbacks.onStatus?.(data.phase || 'streaming', data.message || '');
      } else if (data.type === 'citations') {
        callbacks.onCitations?.(data.citations || []);
      } else if (data.type === 'token') {
        callbacks.onToken?.(data.token || '');
      } else if (data.type === 'error') {
        callbacks.onError?.(data.error || '알 수 없는 오류');
        es.close();
      }
    } catch (e) {
      // Ignore parse errors from partial chunks if any, though SSE shouldn't have partial
    }
  });

  es.addEventListener('error', (event) => {
    console.error('[chat-api] SSE Error:', event);
    // Avoid firing onError if we manually closed it
    const errEvent = event as unknown as { message?: string; type?: string };
    if (errEvent.type === 'error') {
       callbacks.onError?.('네트워크 연결 중 오류가 발생했습니다.');
       es.close();
    }
  });

  return {
    abort: () => es.close(),
  };
}
