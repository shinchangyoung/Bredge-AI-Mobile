import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { ChatMessageItem } from '@/lib/chat-api';
import {
  createChatSession,
  createDefaultChatState,
  getChatSessionTitle,
  inferChatTitle,
  loadChatSessionState,
  normalizeChatMessage,
  saveChatSessionState,
  summarizeChatSessions,
  type ChatSession,
} from '@/lib/chat-sessions';

type MessageSetter = ChatMessageItem[] | ((messages: ChatMessageItem[]) => ChatMessageItem[]);

function applyMessagesToSession(session: ChatSession, messages: ChatMessageItem[]) {
  const nextMessages = messages.slice(-80).map(normalizeChatMessage);
  const nextTitle = session.customTitle ? session.title : inferChatTitle(nextMessages);

  return {
    ...session,
    messages: nextMessages,
    title: nextTitle,
    updatedAt: new Date().toISOString(),
  };
}

export function useChatSessions() {
  const defaultStateRef = useRef(createDefaultChatState());
  const hasLoadedRef = useRef(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>(defaultStateRef.current.sessions);
  const [activeChatSessionId, setActiveChatSessionId] = useState(defaultStateRef.current.activeSessionId);

  useEffect(() => {
    let cancelled = false;

    loadChatSessionState().then((state) => {
      if (cancelled) return;
      setChatSessions(state.sessions);
      setActiveChatSessionId(state.activeSessionId);
      hasLoadedRef.current = true;
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) return;
    saveChatSessionState({
      activeSessionId: activeChatSessionId,
      sessions: chatSessions,
    });
  }, [activeChatSessionId, chatSessions]);

  const activeChatSession = useMemo(
    () =>
      chatSessions.find((session) => session.id === activeChatSessionId) ??
      chatSessions[0] ??
      defaultStateRef.current.sessions[0],
    [activeChatSessionId, chatSessions],
  );
  const messages = activeChatSession?.messages ?? [];
  const chatSessionSummaries = useMemo(() => summarizeChatSessions(chatSessions), [chatSessions]);

  const setMessages = useCallback((nextMessagesOrUpdater: MessageSetter) => {
    setChatSessions((currentSessions) => {
      const safeSessions = currentSessions.length ? currentSessions : [createChatSession()];
      const currentActiveId = activeChatSessionId || safeSessions[0].id;
      let didUpdate = false;
      const nextSessions = safeSessions.map((session) => {
        if (session.id !== currentActiveId) return session;
        didUpdate = true;
        const currentMessages = session.messages ?? [];
        const nextMessages =
          typeof nextMessagesOrUpdater === 'function'
            ? nextMessagesOrUpdater(currentMessages)
            : nextMessagesOrUpdater;
        return applyMessagesToSession(session, nextMessages);
      });

      return didUpdate ? nextSessions : safeSessions;
    });
  }, [activeChatSessionId]);

  const appendMessages = useCallback((items: ChatMessageItem[]) => {
    setMessages((currentMessages) => [...currentMessages, ...items]);
  }, [setMessages]);

  const updateLastAiMessage = useCallback((updates: Partial<ChatMessageItem>) => {
    setMessages((currentMessages) => {
      const nextMessages = [...currentMessages];
      const lastIndex = nextMessages.length - 1;
      const last = nextMessages[lastIndex];
      if (!last || last.role !== 'ai') return currentMessages;
      nextMessages[lastIndex] = normalizeChatMessage({ ...last, ...updates });
      return nextMessages;
    });
  }, [setMessages]);

  const startNewChat = useCallback(() => {
    const session = createChatSession();
    setChatSessions((currentSessions) => [session, ...currentSessions].slice(0, 30));
    setActiveChatSessionId(session.id);
  }, []);

  const switchChatSession = useCallback((sessionId: string) => {
    if (!chatSessions.some((session) => session.id === sessionId)) return false;
    setActiveChatSessionId(sessionId);
    return true;
  }, [chatSessions]);

  const renameChatSession = useCallback((sessionId: string, title = '') => {
    setChatSessions((currentSessions) => currentSessions.map((session) => {
      if (session.id !== sessionId) return session;
      const cleanTitle = title.replace(/\s+/g, ' ').trim();
      return {
        ...session,
        customTitle: Boolean(cleanTitle),
        title: cleanTitle || inferChatTitle(session.messages),
        updatedAt: new Date().toISOString(),
      };
    }));
  }, []);

  const deleteChatSession = useCallback((sessionId: string) => {
    const remainingSessions = chatSessions.filter((session) => session.id !== sessionId);
    const nextSessions = remainingSessions.length ? remainingSessions : [createChatSession()];

    setChatSessions(nextSessions);
    if (activeChatSessionId === sessionId) {
      setActiveChatSessionId(nextSessions[0].id);
    }
  }, [activeChatSessionId, chatSessions]);

  return {
    activeChatSession,
    activeChatSessionId,
    appendMessages,
    chatSessionSummaries,
    chatSessions,
    deleteChatSession,
    getChatSessionTitle,
    messages,
    renameChatSession,
    setMessages,
    startNewChat,
    switchChatSession,
    updateLastAiMessage,
  };
}
