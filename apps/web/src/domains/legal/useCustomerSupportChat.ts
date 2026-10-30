import { useCallback, useEffect, useRef, useState } from "react";
import type {
  SupportAiStatus,
  SupportConversation,
  SupportConversationDetail,
} from "@toonstudio/contracts/customer-support";

import {
  actOnSupportConversation,
  createSupportConversation,
  getSupportAiStatus,
  getSupportConversation,
  listMySupportConversations,
  sendSupportMessage,
} from "./customer-support-api";

type SupportError = "loadError" | "createError" | "sendError" | "actionError" | null;
const HISTORY_PAGE_SIZE = 50;

export function useCustomerSupportChat() {
  const [items, setItems] = useState<SupportConversation[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [ai, setAi] = useState<SupportAiStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SupportConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<SupportError>(null);
  const [busy, setBusy] = useState(false);
  const scope = useRef(new AbortController());
  const selected = useRef<string | null>(null);
  const locked = useRef(false);
  const detailRequest = useRef<AbortController | null>(null);
  const pendingMessage = useRef<{ id: string; content: string; clientMessageId: string } | null>(null);
  const requestedOffset = useRef(0);
  const listRequestRevision = useRef(0);

  const applyDetail = useCallback((next: SupportConversationDetail) => {
    setDetail(next);
    setItems((previous) => previous.map((item) => item.id === next.conversation.id ? next.conversation : item)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)));
  }, []);

  const refreshList = useCallback(async (nextOffset = requestedOffset.current) => {
    const signal = scope.current.signal;
    const revision = ++listRequestRevision.current;
    requestedOffset.current = nextOffset;
    const isCurrent = () => !signal.aborted && listRequestRevision.current === revision;
    setLoading(true);
    setListError(false);
    await Promise.all([
      listMySupportConversations(signal, { limit: HISTORY_PAGE_SIZE, offset: nextOffset }).then((response) => {
        if (isCurrent()) {
          setItems(response.items);
          setTotal(response.total);
          setOffset(nextOffset);
        }
      }).catch(() => {
        if (isCurrent()) setListError(true);
      }),
      getSupportAiStatus(signal).then((response) => {
        if (isCurrent()) setAi(response.ai);
      }).catch(() => {
        if (isCurrent()) setAi(null);
      }),
    ]);
    if (isCurrent()) setLoading(false);
  }, []);

  useEffect(() => {
    scope.current = new AbortController();
    void refreshList();
    const controller = scope.current;
    return () => {
      controller.abort();
      detailRequest.current?.abort();
    };
  }, [refreshList]);

  const loadDetail = useCallback(async (id: string, quiet = false) => {
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    if (!quiet) {
      setDetailLoading(true);
      setError(null);
    }
    try {
      const next = await getSupportConversation(id, controller.signal);
      if (!controller.signal.aborted && !scope.current.signal.aborted && selected.current === id && !locked.current) {
        applyDetail(next);
        setError(null);
      }
    } catch {
      if (!controller.signal.aborted && !scope.current.signal.aborted && selected.current === id) setError("loadError");
    } finally {
      if (!controller.signal.aborted && !scope.current.signal.aborted && selected.current === id) setDetailLoading(false);
    }
  }, [applyDetail]);

  const choose = useCallback((id: string | null) => {
    if (locked.current) return;
    detailRequest.current?.abort();
    selected.current = id;
    setSelectedId(id);
    setDetail(null);
    setError(null);
    setDetailLoading(false);
    pendingMessage.current = null;
    if (id) void loadDetail(id);
  }, [loadDetail]);

  const humanConversation = detail?.conversation.status === "waiting" || detail?.conversation.status === "open";
  useEffect(() => {
    if (!selectedId || !humanConversation) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "hidden" && !locked.current) void loadDetail(selectedId, true);
    }, 10_000);
    return () => window.clearInterval(timer);
  }, [humanConversation, selectedId, loadDetail]);

  const run = useCallback(async (
    operation: (signal: AbortSignal) => Promise<SupportConversationDetail>,
    failure: SupportError,
    newConversation = false,
  ): Promise<boolean> => {
    if (locked.current) return false;
    const signal = scope.current.signal;
    locked.current = true;
    detailRequest.current?.abort();
    setBusy(true);
    setDetailLoading(false);
    setError(null);
    try {
      const next = await operation(signal);
      if (signal.aborted) return false;
      selected.current = next.conversation.id;
      setSelectedId(next.conversation.id);
      applyDetail(next);
      if (newConversation) {
        setTotal((previous) => previous + 1);
        if (requestedOffset.current === 0) {
          setItems((previous) => [next.conversation, ...previous.filter((item) => item.id !== next.conversation.id)].slice(0, HISTORY_PAGE_SIZE));
        } else {
          void refreshList(0);
        }
      }
      return true;
    } catch {
      if (!signal.aborted) setError(failure);
      return false;
    } finally {
      if (!signal.aborted) {
        locked.current = false;
        setBusy(false);
      }
    }
  }, [applyDetail, refreshList]);

  const create = (subject: string, mode: "ai" | "human") => run(
    (signal) => createSupportConversation(subject, mode, signal), "createError", true,
  );

  const send = async (content: string): Promise<boolean> => {
    const id = selected.current;
    if (!id) return false;
    if (pendingMessage.current?.id !== id || pendingMessage.current.content !== content) {
      pendingMessage.current = { id, content, clientMessageId: crypto.randomUUID() };
    }
    const { clientMessageId } = pendingMessage.current;
    const ok = await run((signal) => sendSupportMessage(id, content, clientMessageId, signal), "sendError");
    if (ok) pendingMessage.current = null;
    return ok;
  };

  const act = (action: "escalate" | "retry" | "close") => {
    const id = selected.current;
    return id ? run((signal) => actOnSupportConversation(id, action, signal), "actionError") : Promise.resolve(false);
  };

  return {
    items, total, offset, pageSize: HISTORY_PAGE_SIZE, ai, loading, listError, selectedId, detail, detailLoading, error, busy,
    choose, create, send, act, refreshList,
    refreshDetail: () => selected.current ? loadDetail(selected.current) : Promise.resolve(),
  };
}
