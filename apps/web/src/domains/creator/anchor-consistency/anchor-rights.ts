/**
 * 앵커 이미지 권리 확인 — 사용자가 "내 가상 캐릭터"임을 직접 확인한 기록.
 *
 * 앵커 연구실은 가상 캐릭터의 3D 캡처를 다루는 도구다. 실존 인물의 사진·초상을 올리는 용도가 아니고, 얼굴 인식이나
 * 생체 정보 추출은 하지 않는다. 그 경계를 화면 문구로만 두지 않고, 내보낸 파일(manifest, 안내문)과 참조 팩에 들어가는
 * 소재의 권리 메타데이터에 같은 문장을 남긴다. 확인(`confirmed: true`) 없이는 기록 자체를 만들지 않는다.
 *
 * 이 모듈은 DOM·네트워크에 닿지 않는 순수 모듈이다.
 */

import { isValidAnchorCharacterId, isValidAnchorId } from "./anchor-capture-spec";

import type { StudioAssetRightsMetadata } from "../studio-asset-library";

export const ANCHOR_RIGHTS_SCHEMA = "toonstudio.anchor-rights" as const;
export const ANCHOR_RIGHTS_VERSION = 1 as const;
export const ANCHOR_RIGHTS_TOOL = "toonstudio.anchor-lab" as const;
export const ANCHOR_RIGHTS_NOTE_MAX_LENGTH = 300;

/** 내보낸 파일에 남기는 확인 문장(데이터). 화면에 보이는 확인 문구는 번역 키(anchorLab.rights.*)가 따로 가진다. */
export const ANCHOR_RIGHTS_STATEMENT_KO =
  "이 앵커 이미지는 내가 권리를 가졌거나 이용 허락을 받은 가상 캐릭터의 이미지이며, 실존 인물의 사진이나 초상이 아닙니다.";

export const ANCHOR_RIGHTS_LICENSE_ID = "user-owned-virtual-character" as const;

export type AnchorRightsErrorCode = "not-confirmed" | "invalid-time" | "invalid-identity";

export class AnchorRightsError extends Error {
  readonly code: AnchorRightsErrorCode;

  constructor(code: AnchorRightsErrorCode, message: string) {
    super(message);
    this.name = "AnchorRightsError";
    this.code = code;
  }
}

export interface AnchorRights {
  readonly schema: typeof ANCHOR_RIGHTS_SCHEMA;
  readonly version: typeof ANCHOR_RIGHTS_VERSION;
  readonly statement: string;
  readonly confirmed: true;
  readonly virtualCharacterOnly: true;
  /** 얼굴 인식·생체 정보 추출을 쓰지 않았다는 선언(도구 쪽 사실). */
  readonly biometricProcessing: "none";
  readonly attestedAt: string;
  readonly anchorId: string;
  readonly sourceCharacterId: string;
  readonly note: string;
  readonly tool: typeof ANCHOR_RIGHTS_TOOL;
}

export interface CreateAnchorRightsInput {
  readonly confirmed: boolean;
  readonly attestedAt: string;
  readonly anchorId: string;
  readonly sourceCharacterId: string;
  readonly note?: string;
}

/** 출처·이용 허락 메모를 한 줄로 정리한다(제어 문자 제거, 공백 정리, 길이 제한). */
export function normalizeAnchorRightsNote(value: string): string {
  let cleaned = "";
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    cleaned += code < 32 || (code >= 127 && code <= 159) ? " " : character;
  }
  return cleaned.replace(/\s+/gu, " ").trim().slice(0, ANCHOR_RIGHTS_NOTE_MAX_LENGTH);
}

export function createAnchorRights(input: CreateAnchorRightsInput): AnchorRights {
  if (input.confirmed !== true) {
    throw new AnchorRightsError("not-confirmed", "가상 캐릭터 권리 확인 없이는 결과물을 만들 수 없어요.");
  }
  if (Number.isNaN(Date.parse(input.attestedAt))) {
    throw new AnchorRightsError("invalid-time", "권리 확인 시각이 올바르지 않아요.");
  }
  if (!isValidAnchorId(input.anchorId) || !isValidAnchorCharacterId(input.sourceCharacterId)) {
    throw new AnchorRightsError("invalid-identity", "앵커 id 또는 캐릭터 id 가 올바르지 않아요.");
  }
  return Object.freeze({
    schema: ANCHOR_RIGHTS_SCHEMA,
    version: ANCHOR_RIGHTS_VERSION,
    statement: ANCHOR_RIGHTS_STATEMENT_KO,
    confirmed: true as const,
    virtualCharacterOnly: true as const,
    biometricProcessing: "none" as const,
    attestedAt: new Date(input.attestedAt).toISOString(),
    anchorId: input.anchorId,
    sourceCharacterId: input.sourceCharacterId,
    note: normalizeAnchorRightsNote(input.note ?? ""),
    tool: ANCHOR_RIGHTS_TOOL,
  });
}

/**
 * 참조 팩에 쓰는 소재의 권리 메타데이터(소재 라이브러리 형식). 사용자가 확인한 기록이 있을 때만 만든다.
 * 3D 스테이지에서 직접 캡처했으면 `3d-generated`, 파일로 가져왔으면 `local-upload` 로 출처 종류를 나눈다.
 */
export function anchorAssetRightsMetadata(
  rights: AnchorRights,
  origin: "stage" | "file",
): StudioAssetRightsMetadata {
  return Object.freeze({
    sourceKind: origin === "stage" ? "3d-generated" : "local-upload",
    sourceId: `anchor:${rights.anchorId}`,
    licenseId: ANCHOR_RIGHTS_LICENSE_ID,
    licenseLabel: "사용자 보유·허락 가상 캐릭터",
    licenseUrl: null,
    attributionRequired: null,
    attributionText: rights.note,
    rightsConfirmed: true,
  });
}
