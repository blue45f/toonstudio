/** GLB 데이터 보존과 실제 BG3D 표시의 손실을 별도 항목으로 보고한다. */
import type { StudioHybridDccBg3dLossEntry } from "./studio-hybrid-dcc-bg3d-handoff";
import type { StudioHybridDccGlbIssue } from "./studio-hybrid-dcc-glb-export";
import type { StudioHybridDccWorkspace } from "./studio-hybrid-dcc-workspace";

export function collectStudioHybridDccBg3dLosses(
  workspace: StudioHybridDccWorkspace,
  exports: readonly {
    readonly assetId: string;
    readonly issues: readonly StudioHybridDccGlbIssue[];
    readonly toonMaterialsHash?: string;
  }[],
  mappedSourceObjectIds: ReadonlySet<string>,
  safeSceneText: (value: string, fallback: string) => string,
): StudioHybridDccBg3dLossEntry[] {
  const losses: StudioHybridDccBg3dLossEntry[] = [];
  for (const exported of exports) {
    for (const issue of exported.issues) {
      losses.push({
        code: issue.severity === "loss"
          ? "glb-export-loss-retained-in-dcc"
          : "glb-export-warning",
        severity: "warning",
        assetId: exported.assetId,
        sourceIssueCode: issue.code,
        count: 1,
        resolution: "retained-in-authority",
        detail: issue.detail,
      });
    }
  }
  for (const object of workspace.bridge.set.objects) {
    if (!mappedSourceObjectIds.has(object.id)) {
      losses.push({
        code: "bridge-object-retained-in-dcc",
        severity: "warning",
        assetId: object.id,
        count: 1,
        resolution: "retained-in-authority",
        detail: "렌더 가능한 Geometry Authority 또는 지원되는 절차형 bridge가 없어 DCC 원본에 보존했습니다.",
      });
      continue;
    }
    if (
      workspace.session.state.geometry.records[object.id] &&
      object.materialId !== "default"
    ) {
      losses.push({
        code: "base-material-retained-in-dcc",
        severity: "warning",
        assetId: object.id,
        count: 1,
        resolution: "retained-in-authority",
        detail: `기본 재질 '${safeSceneText(object.materialId, "unknown")}'은 DCC 원본에 보존되고 현재 GLB 파생물에는 베이크하지 않았습니다.`,
      });
    }
  }
  for (const shot of workspace.bridge.shots) {
    const transformCount = Object.keys(shot.overrides.transform ?? {}).length;
    if (transformCount > 0) {
      losses.push({
        code: "shot-transform-retained-in-dcc",
        severity: "warning",
        shotId: shot.id,
        count: transformCount,
        resolution: "retained-in-authority",
        detail: "컷별 변형은 DCC 원본에 보존되며 현재 BG3D 파생 장면에는 베이크하지 않습니다.",
      });
    }
    const materialCount = Object.keys(shot.overrides.material ?? {}).length;
    if (materialCount > 0) {
      losses.push({
        code: "shot-material-retained-in-dcc",
        severity: "warning",
        shotId: shot.id,
        count: materialCount,
        resolution: "retained-in-authority",
        detail: "컷별 재질은 DCC 원본에 보존되며 BG3D Shot 스키마 확장 전까지 전송하지 않습니다.",
      });
    }
    const poseCount = Object.keys(shot.overrides.characterPose ?? {}).length;
    if (poseCount > 0) {
      losses.push({
        code: "shot-character-pose-retained-in-dcc",
        severity: "warning",
        shotId: shot.id,
        count: poseCount,
        resolution: "retained-in-authority",
        detail: "캐릭터 포즈 override는 DCC 원본에 보존됩니다.",
      });
    }
  }
  const inkCount = workspace.bridge.artistCorrections.deltas.length;
  if (inkCount > 0) {
    losses.push({
      code: "artist-ink-retained-in-dcc",
      severity: "info",
      count: inkCount,
      resolution: "retained-in-authority",
      detail: "작가 선 보정 delta는 DCC linked-ink 원본에 보존되고 GLB 렌더 파생물에는 포함되지 않습니다.",
    });
  }
  return losses;
}
