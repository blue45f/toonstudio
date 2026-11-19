import { useSyncExternalStore } from "react";

import {
  resolveWorkflowPackRuntimeBindings,
  subscribeWorkflowPackRuntimeEvents,
  type WorkflowPackRuntimeBindings,
} from "./studio-workflow-pack-runtime-bridge";
import {
  WORKFLOW_PACK_BROADCAST_CHANNEL,
  parseWorkflowPackSyncMessage,
} from "./studio-workflow-pack-sync";

type BindingsListener = () => void;

let latestBindings: WorkflowPackRuntimeBindings | null = null;
const listeners = new Set<BindingsListener>();
let initialized = false;

function notifyListeners(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function setLatestWorkflowPackRuntimeBindings(
  bindings: WorkflowPackRuntimeBindings | null,
): void {
  latestBindings = bindings;
  notifyListeners();
}

export function getLatestWorkflowPackRuntimeBindings(): WorkflowPackRuntimeBindings | null {
  return latestBindings;
}

function ensureRuntimeSubscriptions(): void {
  if (initialized) return;
  initialized = true;

  subscribeWorkflowPackRuntimeEvents((bindings) => {
    setLatestWorkflowPackRuntimeBindings(bindings);
  });

  if (typeof BroadcastChannel !== "undefined") {
    try {
      const channel = new BroadcastChannel(WORKFLOW_PACK_BROADCAST_CHANNEL);
      channel.addEventListener("message", (event: MessageEvent) => {
        const parsed = parseWorkflowPackSyncMessage(event.data);
        if (parsed) {
          setLatestWorkflowPackRuntimeBindings(resolveWorkflowPackRuntimeBindings(parsed.pack));
        }
      });
    } catch {
      // BroadcastChannel 미지원·차단 환경에서는 같은 탭 이벤트만 구독한다.
    }
  }
}

function subscribeStore(listener: BindingsListener): () => void {
  ensureRuntimeSubscriptions();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * 2D 브러시 · 3D BG3D · 내보내기 패널이 현재 활성화된 Workflow Pack v2 런타임 바인딩을
 * 실시간 구독하는 경량 훅.
 */
export function useWorkflowPackRuntimeBindings(): WorkflowPackRuntimeBindings | null {
  return useSyncExternalStore(
    subscribeStore,
    getLatestWorkflowPackRuntimeBindings,
    () => null,
  );
}
