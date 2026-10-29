import * as Y from "yjs";
import { admitStudioScopedWriteEffects, StudioScopedWriteDeniedError } from "./studio-scoped-write-effects";
import { assertStudioScopedCrdtResolved, projectStudioScopedCrdtAuthority } from "./studio-scoped-crdt-authority";
import type { StudioScopedAuthorization } from "./studio-scoped-write-store";
import type { DrizzleStudioCrdtTransaction } from "./studio-crdt.repository";
import { loadStudioScopedCrdtReferenceSources } from "./studio-scoped-crdt-reference-sources";
import { assertStudioScopedOpaqueGcAdmission } from "./studio-scoped-crdt-opaque";

export type StudioScopedCrdtProbeAdmission = (durable: Y.Doc, probe: Y.Doc) => ReturnType<typeof admitStudioScopedCrdtProbe>;

/** 구조·픽셀·자산 검증이 끝난 실제 후보를 재사용한다. 캐시가 아닌 동일 transaction의 정본이다. */
export async function admitStudioScopedCrdtProbe(authorization: StudioScopedAuthorization | undefined,
  durable: Y.Doc, probe: Y.Doc, transaction: DrizzleStudioCrdtTransaction, update?: Uint8Array) {
  if (!authorization?.context) return undefined;
  try {
    assertStudioScopedCrdtResolved(durable); assertStudioScopedCrdtResolved(probe);
    assertStudioScopedOpaqueGcAdmission(durable, probe, authorization, update);
    const references = await loadStudioScopedCrdtReferenceSources(transaction, authorization.work.workId, authorization.work.document, [durable, probe]);
    const before = projectStudioScopedCrdtAuthority(durable, authorization.work.document, references).state;
    const after = projectStudioScopedCrdtAuthority(probe, authorization.work.document, references).state;
    return admitStudioScopedWriteEffects({ before, after, context: authorization.context,
      targets: authorization.targets, ownership: new Map(Object.entries(authorization.policy.ownership)) });
  } catch (error) {
    if (error instanceof StudioScopedWriteDeniedError) throw error;
    throw new StudioScopedWriteDeniedError("ambiguous");
  }
}

/** 영속 정본에서 만든 probe만 검사한다. 승인 전에는 원본 Y.Doc과 registry를 변경하지 않는다. */
export async function admitStudioScopedCrdtUpdate(authorization: StudioScopedAuthorization | undefined,
  durable: Y.Doc, update: Uint8Array, transaction: DrizzleStudioCrdtTransaction) {
  if (!authorization?.context) return undefined;
  const probe = new Y.Doc();
  try {
    Y.applyUpdate(probe, Y.encodeStateAsUpdate(durable), "scoped-before");
    Y.applyUpdate(probe, update, "scoped-probe");
    return await admitStudioScopedCrdtProbe(authorization, durable, probe, transaction, update);
  } catch (error) {
    if (error instanceof StudioScopedWriteDeniedError) throw error;
    throw new StudioScopedWriteDeniedError("ambiguous");
  } finally { probe.destroy(); }
}
