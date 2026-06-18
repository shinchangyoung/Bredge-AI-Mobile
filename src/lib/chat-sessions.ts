import { Directory, File, Paths } from 'expo-file-system';

import type { ChatMessageItem } from '@/lib/chat-api';

export type ChatSession = {
  id: string;
  title: string;
  customTitle: boolean;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessageItem[];
};

export type ChatSessionSummary = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type ChatSessionState = {
  activeSessionId: string;
  sessions: ChatSession[];
};

const CHAT_STATE_VERSION = 1;
const MAX_STORED_MESSAGES = 80;
const MAX_STORED_SESSIONS = 30;
const STORAGE_DIR_NAME = 'lecto-chat';
const STORAGE_FILE_NAME = 'sessions.json';

function createChatSessionId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `chat-${crypto.randomUUID()}`;
  }

  return `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function inferChatTitle(messages: ChatMessageItem[] = []) {
  const firstUserMessage = messages.find((message) => message.role === 'user' && message.text);
  const title = String(firstUserMessage?.text || '').replace(/\s+/g, ' ').trim();
  if (!title) return '새 채팅';
  return title.length > 24 ? `${title.slice(0, 24)}...` : title;
}

export function normalizeChatMessage(message: Partial<ChatMessageItem> = {}): ChatMessageItem {
  return {
    role: message.role === 'user' ? 'user' : 'ai',
    text: String(message.text || ''),
    thinking: String(message.thinking || ''),
    citations: Array.isArray(message.citations) ? message.citations : [],
    phase: message.phase || 'done',
    statusText: message.statusText || '',
  };
}

export function normalizeChatSession(session: Partial<ChatSession> = {}): ChatSession {
  const now = new Date().toISOString();
  const messages = Array.isArray(session.messages)
    ? session.messages
        .map(normalizeChatMessage)
        .filter((message) => message.text || message.thinking || message.phase !== 'done')
    : [];
  const customTitle = Boolean(session.customTitle);

  return {
    id: String(session.id || createChatSessionId()),
    title: String(session.title || inferChatTitle(messages)),
    customTitle,
    createdAt: session.createdAt || now,
    updatedAt: session.updatedAt || now,
    messages: messages.slice(-MAX_STORED_MESSAGES),
  };
}

export function createChatSession(messages: ChatMessageItem[] = []): ChatSession {
  const now = new Date().toISOString();
  const normalizedMessages = messages.map(normalizeChatMessage);

  return normalizeChatSession({
    id: createChatSessionId(),
    title: inferChatTitle(normalizedMessages),
    customTitle: false,
    createdAt: now,
    updatedAt: now,
    messages: normalizedMessages,
  });
}

export function createDefaultChatState(): ChatSessionState {
  const session = createChatSession();
  return {
    activeSessionId: session.id,
    sessions: [session],
  };
}

function getChatStorageFile() {
  const directory = new Directory(Paths.document, STORAGE_DIR_NAME);
  if (!directory.exists) {
    directory.create({ idempotent: true, intermediates: true });
  }
  return new File(directory, STORAGE_FILE_NAME);
}

export async function loadChatSessionState(): Promise<ChatSessionState> {
  try {
    const file = getChatStorageFile();
    if (!file.exists) return createDefaultChatState();

    const raw = await file.text();
    const parsed = JSON.parse(raw || '{}') as Partial<ChatSessionState>;
    const sessions: ChatSession[] = Array.isArray(parsed.sessions)
      ? parsed.sessions.map(normalizeChatSession).slice(0, MAX_STORED_SESSIONS)
      : [];
    const safeSessions = sessions.length ? sessions : [createChatSession()];
    const activeSessionId = safeSessions.some((session) => session.id === parsed.activeSessionId)
      ? String(parsed.activeSessionId)
      : safeSessions[0].id;

    return {
      activeSessionId,
      sessions: safeSessions,
    };
  } catch (error) {
    console.warn('[chat-sessions] restore failed:', error);
    return createDefaultChatState();
  }
}

export async function saveChatSessionState(state: ChatSessionState) {
  try {
    const file = getChatStorageFile();
    const sessions = state.sessions
      .slice(0, MAX_STORED_SESSIONS)
      .map(normalizeChatSession);

    if (!file.exists) {
      file.create({ intermediates: true });
    }

    file.write(JSON.stringify({
      activeSessionId: state.activeSessionId,
      sessions,
      version: CHAT_STATE_VERSION,
    }));
  } catch (error) {
    console.warn('[chat-sessions] save failed:', error);
  }
}

export function getChatSessionTitle(session: ChatSession) {
  return session.customTitle ? (session.title || '제목 없는 채팅') : inferChatTitle(session.messages);
}

export function summarizeChatSessions(sessions: ChatSession[]): ChatSessionSummary[] {
  return sessions
    .map((session) => ({
      id: session.id,
      title: getChatSessionTitle(session),
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
      messageCount: session.messages.length,
    }))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}
