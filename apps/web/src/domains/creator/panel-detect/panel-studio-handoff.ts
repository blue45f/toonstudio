/**
 * 만든 Studio 문서를 편집기로 넘긴다 — 기존 "가져오기 전달" 경로(studio-import-handoff)를 그대로 쓴다.
 *
 * 편집기에는 프로젝트 JSON 가져오기가 이미 있다(검증·되돌리기 기록·가져오기 상태 안내 포함). 여기서는 문서를 JSON 파일로 만들어
 * 단일 사용 전달표에 등록하기만 한다. 파일은 이 브라우저의 메모리에만 있고 URL·localStorage·서버로 나가지 않는다.
 */

import { createStudioDownloadFileName } from "../export/studio-download-file-name";
import {
  registerStudioImportHandoff,
  studioImportHandoffHref,
  type StudioImportHandoff,
} from "../studio-import-handoff";

import type { PanelStudioProject } from "./panel-studio-document";

/** 프로젝트 JSON 파일 상한. 편집기가 문자열로 읽고 파싱하므로 메모리 두세 벌을 감안한 보수값이다. */
export const PANEL_STUDIO_PROJECT_MAX_BYTES = 96 * 1024 * 1024;

export class PanelStudioHandoffError extends Error {
  readonly code: "too-large" | "register-failed";

  constructor(code: PanelStudioHandoffError["code"], message: string, options?: { readonly cause?: unknown }) {
    super(message, options);
    this.name = "PanelStudioHandoffError";
    this.code = code;
  }
}

export function createPanelStudioProjectFile(project: PanelStudioProject, maxBytes = PANEL_STUDIO_PROJECT_MAX_BYTES): File {
  const json = JSON.stringify(project);
  const file = new File([json], createStudioDownloadFileName({
    title: project.title,
    fallbackTitle: "panel-import",
    suffix: "panels",
    extension: "json",
  }), { type: "application/json" });
  if (file.size > maxBytes) {
    throw new PanelStudioHandoffError("too-large", "만든 문서가 너무 커서 편집기로 넘길 수 없어요. 컷 수를 줄이거나 PNG 묶음으로 받아 주세요.");
  }
  return file;
}

export interface PanelStudioHandoffResult {
  readonly handoff: StudioImportHandoff;
  readonly href: string;
}

/** 파일을 전달표에 등록하고 편집기로 가는 주소를 돌려준다. 이동은 호출자(라우터)가 한다. */
export function registerPanelStudioHandoff(file: File): PanelStudioHandoffResult {
  try {
    const handoff = registerStudioImportHandoff(file, "json");
    return { handoff, href: studioImportHandoffHref(handoff) };
  } catch (cause) {
    throw new PanelStudioHandoffError("register-failed", "편집기로 넘길 준비를 하지 못했어요. 다시 시도해 주세요.", { cause });
  }
}
