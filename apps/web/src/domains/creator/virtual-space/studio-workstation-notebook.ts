import { z } from "zod";

import type { StudioAsyncKeyValueStore } from "../studio-local-database";

export const WORKSTATION_STAMPS = ["✅ 승인 PASS", "🔧 구도 리테이크", "💬 대사·식자 수정", "✨ 역광 이펙트 강화"] as const;
export const WORKSTATION_STAGES = ["storyboard", "line", "color", "bg3d", "done"] as const;
const point = z.tuple([z.number().int().min(0).max(560), z.number().int().min(0).max(270)]);
const id = z.string().min(1).max(128);
const mark = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("stroke"), id, color: z.string().regex(/^#[0-9a-f]{6}$/iu), points: z.array(point).min(1) }),
  z.object({ kind: z.literal("stamp"), id, stamp: z.enum(WORKSTATION_STAMPS) }),
  z.object({ kind: z.literal("stage"), id, cutId: z.enum(["cut-17", "cut-18", "cut-19", "cut-20", "cut-21", "cut-22"]) }),
]);
const notebook = z.object({ version: z.literal(1), marks: z.array(mark) });
export type WorkstationMark = z.infer<typeof mark>;
export type WorkstationStroke = Extract<WorkstationMark, { kind: "stroke" }>;
export type WorkstationCutId = Extract<WorkstationMark, { kind: "stage" }>["cutId"];

const NS = "studio-private-workstation-notebooks-v1";
const queues = new Map<string, Promise<unknown>>();

async function openStore(retry: boolean) {
  const { acquireStudioLocalDatabase, resetFailedStudioLocalDatabaseOwnership } = await import("../studio-local-database-runtime");
  if (retry) await resetFailedStudioLocalDatabaseOwnership();
  return (await acquireStudioLocalDatabase()).asAsyncKeyValueStore(NS);
}

/** 스탬프·공정과 획을 순서대로 적용한다. 실패 후 같은 획을 재시도해도 한 번만 남는다. */
export function mergeWorkstationMarks(saved: readonly WorkstationMark[], incoming: readonly WorkstationMark[]): WorkstationMark[] {
  const seen = new Set(saved.map(entry => entry.id));
  const result = [...saved];
  for (const entry of incoming) {
    if (seen.has(entry.id)) continue;
    result.push(entry);
    seen.add(entry.id);
  }
  return result;
}

export function accessWorkstationNotebook(
  key: string, incoming: readonly WorkstationMark[], currentOwner: () => boolean, retry = false,
  acquire: (retry: boolean) => Promise<StudioAsyncKeyValueStore> = openStore,
): Promise<WorkstationMark[]> {
  async function access() {
    if (!currentOwner()) throw new Error("작업대 사용자가 변경되었습니다.");
    const store = await acquire(retry);
    const raw = await store.get(key);
    const saved = raw === null ? [] : notebook.parse(JSON.parse(raw)).marks;
    if (!currentOwner()) throw new Error("작업대 사용자가 변경되었습니다.");
    if (!incoming.length) return saved;
    const next = mergeWorkstationMarks(saved, incoming);
    await store.set(key, JSON.stringify({ version: 1, marks: next }));
    return next;
  }
  const previous = queues.get(key) ?? Promise.resolve();
  const operation = previous.catch(() => undefined).then(() => (
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(NS + ":" + key, access) : access()
  ));
  queues.set(key, operation);
  const cleanup = () => { if (queues.get(key) === operation) queues.delete(key); };
  void operation.then(cleanup, cleanup);
  return operation;
}
