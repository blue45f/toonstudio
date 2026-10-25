/**
 * studio-format-convert-plan.ts — 포맷 변환 계획 (순수 모듈, fetch 없음).
 *
 * 소스 포맷에서 목표 포맷으로 가는 기존 경로를 단계로 나열한다. 독점
 * 포맷 네이티브 변환은 제공하지 않고, 해당 툴의 공식 내보내기로 경유하는
 * 브릿지 단계로 안내한다. 지원하지 않는 쌍은 fail-closed로 사유와 브릿지
 * 제안을 돌려주고, 조용히 다른 포맷으로 대체하지 않는다.
 */

export interface StudioConvertStep {
  readonly action: string;
  readonly modulePath: string;
}

export interface StudioConvertPlan {
  readonly supported: boolean;
  readonly steps: readonly StudioConvertStep[];
  /** 미지원 사유. 지원되면 빈 문자열이다. */
  readonly reason: string;
  /** 브릿지 제안. 없으면 빈 문자열이다. */
  readonly bridge: string;
}

interface ConvertEntry {
  readonly steps: readonly StudioConvertStep[];
  readonly bridge: string;
}

const CONVERT_TABLE: Readonly<Record<string, ConvertEntry>> = Object.freeze({
  "psd->toonstudio": {
    steps: [{ action: "ag-psd 파싱(128MiB fail-closed)", modulePath: "studio-interchange-capabilities.ts:479" }],
    bridge: "",
  },
  "ora->toonstudio": {
    steps: [{ action: "OpenRaster 교환", modulePath: "studio-openraster-interchange.ts" }],
    bridge: "",
  },
  "svg->scene": {
    steps: [{ action: "vello_svg strict subset 감사 + 렌더", modulePath: "studio-interchange-capabilities.ts:508" }],
    bridge: "",
  },
  "clip->psd": {
    steps: [{ action: "클립스튜디오에서 PSD로 내보내기", modulePath: "studio-interchange-capabilities.ts:1195 (bridge)" }],
    bridge: "CSP 내보내기(PSD)로 경유한 뒤 psd->toonstudio 경로 사용",
  },
  "kra->ora": {
    steps: [{ action: "Krita에서 ORA로 내보내기", modulePath: "없음 (툴 내보내기 기능)" }],
    bridge: "Krita 내보내기(ORA)로 경유한 뒤 ora->toonstudio 경로 사용",
  },
  "mdp->png": {
    steps: [{ action: "메디방에서 PNG로 내보내기", modulePath: "없음 (툴 내보내기 기능)" }],
    bridge: "메디방 내보내기(PNG)로 경유한 뒤 이미지 가져오기 경로 사용",
  },
  "procreate->psd": {
    steps: [{ action: "Procreate에서 PSD로 내보내기", modulePath: "없음 (툴 내보내기 기능)" }],
    bridge: "Procreate 내보내기(PSD)로 경유한 뒤 psd->toonstudio 경로 사용",
  },
  "blend->glb": {
    steps: [{ action: "Blender에서 GLB로 내보내기", modulePath: "scripts/setup-toonstudio-blender-pipeline.mts" }],
    bridge: "Blender 내보내기(GLB)로 경유한 뒤 GLB 정규화 경로 사용",
  },
  "glb->scene": {
    steps: [{ action: "self-contained GLB 정규화 보관", modulePath: "studio-interchange-capabilities.ts:1158" }],
    bridge: "",
  },
  "fbx->glb": {
    steps: [{ action: "GLB로 정규화(원본 구조 미보존)", modulePath: "studio-interchange-capabilities.ts:1158" }],
    bridge: "",
  },
  "abr->brush": {
    steps: [{ action: "ABR 파싱(Worker 기본·direct 백엔드)", modulePath: "studio-abr-import-client.ts" }],
    bridge: "",
  },
  "cbz->episode": {
    steps: [{ action: "CBZ 아카이브 해석(상한 내)", modulePath: "studio-cbz-interchange.ts:24" }],
    bridge: "",
  },
});

/** 소스→목표 변환 계획을 만든다. 미지원 쌍은 supported false이다. */
export function buildConvertPlan(source: string, target: string): StudioConvertPlan {
  const entry = CONVERT_TABLE[`${source}->${target}`];
  if (entry === undefined) {
    return Object.freeze({
      supported: false,
      steps: [],
      reason: `${source}에서 ${target}으로의 변환 경로는 코드에서 확인되지 않는다.`,
      bridge: "공개 교환 포맷(PSD·ORA·PNG·GLB)으로 경유하는지 먼저 확인한다.",
    });
  }
  return Object.freeze({
    supported: true,
    steps: entry.steps,
    reason: "",
    bridge: entry.bridge,
  });
}
