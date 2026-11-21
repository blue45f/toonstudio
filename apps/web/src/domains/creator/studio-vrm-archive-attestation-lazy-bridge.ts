/**
 * VRM 프로젝트 아카이브 사용 확인 호스트의 지연 활성화 브리지.
 * React Fast Refresh 경계를 지키기 위해 비-컴포넌트 함수와 레지스트리를 분리한다.
 */
import type {
  StudioVrmProjectArchiveAttestationPlan,
  StudioVrmProjectArchiveUseContextInput,
} from "./vrm/studio-vrm-license-product-gate";

export type ReadyArchiveAttestationPlan = Extract<
  StudioVrmProjectArchiveAttestationPlan,
  { readonly ok: true }
> & { readonly destination?: "team-cut" };

export type ArchiveAttestationResult = StudioVrmProjectArchiveUseContextInput | null;

export interface StudioVrmArchiveAttestationLazyHostOwner {
  readonly owner: symbol;
  readonly activate: () => Promise<boolean>;
}

let activeLazyHostOwner: StudioVrmArchiveAttestationLazyHostOwner | null = null;

export function registerStudioVrmArchiveAttestationLazyHostOwner(
  entry: StudioVrmArchiveAttestationLazyHostOwner,
): () => void {
  activeLazyHostOwner = entry;
  return () => {
    if (activeLazyHostOwner?.owner === entry.owner) {
      activeLazyHostOwner = null;
    }
  };
}

/**
 * 실제 VRM 호스트가 마운트되어 있지 않다면 등록된 지연 셸을 깨워 마운트 완료까지 대기한다.
 * 마운트된 스튜디오 셸이 없으면 fail-closed(false)를 반환한다.
 */
export function ensureStudioVrmProjectArchiveAttestationHostMounted(): Promise<boolean> {
  if (!activeLazyHostOwner) return Promise.resolve(false);
  return activeLazyHostOwner.activate();
}

export async function requestStudioVrmProjectArchiveUseContext(
  plan: ReadyArchiveAttestationPlan,
): Promise<ArchiveAttestationResult> {
  if (!activeLazyHostOwner) return null;
  const [mounted, mod] = await Promise.all([
    activeLazyHostOwner.activate(),
    import("./vrm/StudioVrmProjectArchiveAttestationHost"),
  ]);
  if (!mounted) return null;
  return mod.requestStudioVrmProjectArchiveUseContext(plan);
}
