import type { BgPrimitive } from "../studio-background-3d-metadata";
import type { StudioBg3dCameraSettings } from "./studio-bg3d-scene-document-types";

/** 실제 장면 커밋에 성공했을 때만 true를 돌려준다. */
export type StudioBg3dInsertScenePrimitives = (
  primitives: readonly BgPrimitive[],
  labelKo: string,
) => boolean;

export type StudioBg3dAddGeneratedParts = (
  buildParts: (count: number, view: StudioBg3dCameraSettings) => BgPrimitive[],
) => BgPrimitive[] | false;

interface StudioBg3dWorkbenchInsertionPorts {
  readonly canInsert: () => boolean;
  readonly readExistingIds: () => Iterable<string>;
  readonly addGeneratedParts: StudioBg3dAddGeneratedParts;
  readonly createId?: () => string;
}

/** 기존 가변 호스트의 필요한 읽기·명령 경계만 좁혀서 사용한다. */
interface StudioBg3dWorkbenchInsertionHost {
  readonly open?: boolean;
  readonly modelRenderer?: unknown;
  readonly isRestoringScene?: boolean;
  readonly isCapturing?: boolean;
  readonly isBatchRenderingShots?: boolean;
  readonly physicsInteractionLocked?: boolean;
  readonly isUploadingModel?: boolean;
  readonly isSavingTemplate?: boolean;
  readonly applyingTemplateId?: string | null;
  readonly hasPendingClone?: boolean;
  readonly hasCloneFailure?: boolean;
  readonly physicsRuntimeSourceRef?: {
    readonly current: {
      readonly primitives: readonly { readonly id: string }[];
      readonly customModels: readonly { readonly id: string }[];
    };
  };
  readonly addGeneratedParts?: StudioBg3dAddGeneratedParts;
}

export function createStudioBg3dWorkbenchInsertionFromHost(
  host: StudioBg3dWorkbenchInsertionHost,
): StudioBg3dInsertScenePrimitives {
  return createStudioBg3dWorkbenchInsertionCommand({
    canInsert: () => host.open === true && host.modelRenderer != null
      && Boolean(host.physicsRuntimeSourceRef) && Boolean(host.addGeneratedParts)
      && !host.isRestoringScene && !host.isCapturing && !host.isBatchRenderingShots
      && !host.physicsInteractionLocked && !host.isUploadingModel && !host.isSavingTemplate
      && !host.applyingTemplateId && !host.hasPendingClone && !host.hasCloneFailure,
    readExistingIds: () => {
      const live = host.physicsRuntimeSourceRef?.current;
      return live ? [...live.primitives, ...live.customModels].map(({ id }) => id) : [];
    },
    addGeneratedParts: (buildParts) => host.addGeneratedParts?.(buildParts) ?? false,
  });
}

/** 생성기의 고정 ID를 격리하고 기존 장면의 admission·문서·history 경로로 한 번에 보낸다. */
export function createStudioBg3dWorkbenchInsertionCommand(
  ports: StudioBg3dWorkbenchInsertionPorts,
): StudioBg3dInsertScenePrimitives {
  return (primitives) => {
    if (!ports.canInsert() || primitives.length === 0) return false;
    const occupied = new Set(ports.readExistingIds());
    const sourceIds = new Set(primitives.map((primitive) => primitive.id));
    // 중복 원본 ID는 부모·연결 복제의 대응이 모호하므로 일부만 삽입하지 않는다.
    if (sourceIds.size !== primitives.length || sourceIds.has("")) return false;
    for (const id of sourceIds) occupied.add(id);
    const freshIds = new Map<string, string>();
    const createId = ports.createId ?? (() => `bg3d-${crypto.randomUUID()}`);
    for (const primitive of primitives) {
      let id: string | undefined;
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = createId();
        if (candidate && !occupied.has(candidate)) {
          id = candidate;
          break;
        }
      }
      if (!id) return false;
      occupied.add(id);
      freshIds.set(primitive.id, id);
    }
    const copies = structuredClone([...primitives]);
    for (const primitive of copies) {
      const id = freshIds.get(primitive.id);
      if (!id) return false;
      primitive.id = id;
      if (primitive.parentId) primitive.parentId = freshIds.get(primitive.parentId) ?? null;
      if (primitive.linkedSourceId) {
        const sourceId = freshIds.get(primitive.linkedSourceId);
        if (sourceId) primitive.linkedSourceId = sourceId;
        else delete primitive.linkedSourceId;
      }
    }
    // 반환값으로 판단하므로 예산 초과·장면 잠금 거부를 성공으로 표시하지 않는다.
    return ports.addGeneratedParts(() => copies) !== false;
  };
}
