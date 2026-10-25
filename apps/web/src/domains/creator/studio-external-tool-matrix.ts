/**
 * studio-external-tool-matrix.ts — 외부툴·포맷 연동 현황 매트릭스 (순수 모듈, fetch 없음).
 *
 * 코드 실측 기준 현황표이다. 독점 포맷(.clip·.kra·.mdp·.procreate·.blend
 * 네이티브)은 리버스엔지니어링 없이 공개 교환 포맷(PSD·ORA·PNG·GLB)으로
 * 경유하는 것만 표기한다. 충실도는 기존 수입 호환 모델의 어휘를 재사용한다
 * (preserved·converted·flattened·unsupported). 쓰기 여부가 코드에서 확인되지
 * 않은 항목은 "미확인"으로 남기고 단정하지 않는다.
 * 모듈 경로는 apps/web/src/domains/creator/ 기준 상대 표기이다.
 */

export type StudioExternalToolFidelity = "preserved" | "converted" | "flattened" | "unsupported";

export type StudioExternalToolSupport = "native" | "bridge" | "partial" | "unsupported" | "unverified";

export interface StudioExternalToolMatrixRow {
  readonly tool: string;
  readonly format: string;
  readonly support: StudioExternalToolSupport;
  readonly fidelity: StudioExternalToolFidelity;
  /** 기존 처리 모듈·경로. 없으면 빈 문자열이다. */
  readonly existingPath: string;
  /** 격차 내용. 없으면 빈 문자열이다. */
  readonly gap: string;
  /** 격차 해소에 필요한 조건. 없으면 빈 문자열이다. */
  readonly requiredCondition: string;
}

export const STUDIO_EXTERNAL_TOOL_MATRIX: readonly StudioExternalToolMatrixRow[] =
  Object.freeze([
    {
      tool: "클립스튜디오",
      format: ".clip",
      support: "bridge",
      fidelity: "converted",
      existingPath: "studio-interchange-capabilities.ts:1195 (bridge: PSD·PNG·SVG)",
      gap: "네이티브 .clip 레이어 읽기 없음",
      requiredCondition: "CELSYS 공식 경로 외에는 리버스엔지니어링 금지. CSP 내보내기(PSD)로 경유",
    },
    {
      tool: "포토샵",
      format: ".psd",
      support: "native",
      fidelity: "preserved",
      existingPath: "studio-interchange-capabilities.ts:479 (ag-psd, 128MiB fail-closed)",
      gap: "쓰기 라운드트립 범위 미확인",
      requiredCondition: "쓰기 범위 별도 확인 필요",
    },
    {
      tool: "Krita",
      format: ".ora",
      support: "native",
      fidelity: "preserved",
      existingPath: "studio-openraster-interchange.ts, studio-document-interchange-commit.ts (.ora 분기)",
      gap: "ORA 내보내기는 합성 1레이어 한정이라는 안내 문구 존재",
      requiredCondition: "요소별 레이어 교환은 PSD 경로 사용",
    },
    {
      tool: "Krita",
      format: ".kra",
      support: "bridge",
      fidelity: "converted",
      existingPath: "없음 (가져오기 accept 목록에 .kra 없음)",
      gap: "네이티브 .kra 읽기 없음",
      requiredCondition: "Krita 내보내기(ORA)로 경유",
    },
    {
      tool: "Krita",
      format: ".kpp",
      support: "native",
      fidelity: "preserved",
      existingPath: "packages/studio-format-gateway/src/kpp.ts, 가져오기 accept 목록 포함",
      gap: "",
      requiredCondition: "",
    },
    {
      tool: "메디방",
      format: ".mdp",
      support: "bridge",
      fidelity: "converted",
      existingPath: "없음 (가져오기 accept 목록에 .mdp 없음)",
      gap: "네이티브 .mdp 읽기 없음",
      requiredCondition: "메디방 내보내기(PSD·PNG)로 경유",
    },
    {
      tool: "Procreate",
      format: ".procreate",
      support: "bridge",
      fidelity: "converted",
      existingPath: "없음 (가져오기 accept 목록에 .procreate 없음)",
      gap: "네이티브 .procreate 읽기 없음",
      requiredCondition: "Procreate 내보내기(PSD·PNG)로 경유",
    },
    {
      tool: "Blender",
      format: ".blend",
      support: "bridge",
      fidelity: "converted",
      existingPath: "scripts/setup-toonstudio-blender-pipeline.mts, verify-blender-package-roundtrip.mts",
      gap: "브라우저·Unity 모두 .blend 로더 없음",
      requiredCondition: "Blender 내보내기(GLB·FBX)로 경유 후 GLB 정규화",
    },
    {
      tool: "Blender",
      format: ".glb/.gltf",
      support: "native",
      fidelity: "converted",
      existingPath: "studio-interchange-capabilities.ts:1158 (GLB 100MiB·기타 32MiB, 배치 300MiB)",
      gap: "비GLB 포맷은 재질·애니메이션 일부만 GLB로 정규화하고 원본 구조 미보존",
      requiredCondition: "",
    },
    {
      tool: "Blender",
      format: ".fbx/.obj/.dae/.stl/.ply/.3ds",
      support: "partial",
      fidelity: "converted",
      existingPath: "studio-interchange-capabilities.ts:1158 (동일 3D 교환 정의)",
      gap: "원본 포맷 구조 미보존, GLB 정규화 전제",
      requiredCondition: "",
    },
    {
      tool: "벡터",
      format: ".svg",
      support: "partial",
      fidelity: "converted",
      existingPath: "studio-interchange-capabilities.ts:508 (vello_svg strict subset, resvg 참조)",
      gap: "text·image·pattern·mask·filter·marker·use/symbol·외부 참조·중첩 clip은 fail-closed로 생략",
      requiredCondition: "완전한 SVG 편집은 원본 보관 + provider 별도 선택",
    },
    {
      tool: "만화 아카이브",
      format: ".cbz",
      support: "native",
      fidelity: "preserved",
      existingPath: "studio-cbz-interchange.ts:24 (520MB·1,163엔트리·1,099페이지 상한)",
      gap: "",
      requiredCondition: "",
    },
    {
      tool: "브러시",
      format: ".abr",
      support: "native",
      fidelity: "preserved",
      existingPath: "studio-abr-import-client.ts (Worker 기본·direct 백엔드, 45,000ms 타임아웃)",
      gap: "",
      requiredCondition: "",
    },
    {
      tool: "브러시",
      format: ".myb",
      support: "native",
      fidelity: "preserved",
      existingPath: "packages/studio-format-gateway/src/myb.ts, studio-cc0-mypaint-preset-import-v1.ts",
      gap: "",
      requiredCondition: "",
    },
    {
      tool: "스토리지·협업·발행",
      format: "OAuth",
      support: "native",
      fidelity: "preserved",
      existingPath: "/api/auth/providers (Google·GitHub·카카오·네이버, 2026-10-24 실측 200)",
      gap: "드라이브·슬랙·디스코드 직접 연동은 코드상 미확인",
      requiredCondition: "공식 API 승인 경로로 별도 확인 필요",
    },
  ]);

/** 도구·포맷 쌍의 행을 찾는다. 없으면 null이다. */
export function findExternalToolMatrixRow(
  tool: string,
  format: string,
): StudioExternalToolMatrixRow | null {
  for (const row of STUDIO_EXTERNAL_TOOL_MATRIX) {
    if (row.tool === tool && row.format === format) return row;
  }
  return null;
}

/** 격차가 있는 행만 돌려준다. */
export function listExternalToolGaps(): readonly StudioExternalToolMatrixRow[] {
  return Object.freeze(STUDIO_EXTERNAL_TOOL_MATRIX.filter((row) => row.gap !== ""));
}
