import { Injectable } from "@nestjs/common";
import { EventEmitter } from "node:events";

export type StudioEcosystemEventType =
  | "plaza.party_created"
  | "plaza.slot_assigned"
  | "plaza.message_posted"
  | "plaza.presence_updated"
  | "cafe.post_created"
  | "rbac.role_assigned"
  | "support.triage";

export interface StudioEcosystemRealtimeEvent {
  readonly id: string;
  readonly type: StudioEcosystemEventType;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
}

@Injectable()
export class StudioEcosystemEventsService {
  private readonly emitter = new EventEmitter();
  private readonly recentEvents: StudioEcosystemRealtimeEvent[] = [];

  emit(
    type: StudioEcosystemEventType,
    payload: Readonly<Record<string, unknown>>,
  ): StudioEcosystemRealtimeEvent {
    const event: StudioEcosystemRealtimeEvent = {
      id: `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      type,
      payload,
      createdAt: new Date().toISOString(),
    };
    this.recentEvents.unshift(event);
    if (this.recentEvents.length > 100) {
      this.recentEvents.length = 100;
    }
    this.emitter.emit("event", event);
    return event;
  }

  subscribe(listener: (event: StudioEcosystemRealtimeEvent) => void): () => void {
    this.emitter.on("event", listener);
    return () => {
      this.emitter.off("event", listener);
    };
  }

  listRecent(limit = 20): readonly StudioEcosystemRealtimeEvent[] {
    return this.recentEvents.slice(0, Math.max(1, Math.min(100, limit)));
  }
}
