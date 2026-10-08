import { t } from "./engineering-library-guide-kit";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 라이브러리 해설의 영역 8개를 화면에서 묶는 세 묶음(영역 바로가기·목차·한 장 요약의 괄호가 같은 이름을 쓴다).
 * 영역 id 는 `engineering-library-guide-content.test.ts` 가 고정한 순서와 같고, 모든 영역은 정확히 한 묶음에 속한다.
 */
export interface LibraryAreaGroup {
  readonly id: "screen" | "share" | "tools";
  readonly label: LocalizedText;
  /** 한 장 요약 도식의 오른쪽 괄호에 쓰는 짧은 이름(도식은 한글을 글자 단위로 줄바꿈하므로 한 줄 약 10자 이내). */
  readonly diagramLabel: LocalizedText;
  /** 이 묶음이 답하는 한 줄. */
  readonly hint: LocalizedText;
  readonly areaIds: readonly string[];
}

export const LIBRARY_GROUP_SCREEN: LibraryAreaGroup = {
  id: "screen",
  label: t("작업 화면을 만드는 부품", "Parts that make the working screen"),
  diagramLabel: t("화면을 만드는 부품", "Parts that make the screen"),
  hint: t("그리고, 입체로 보여 주고, 편집하는 부분", "Drawing, showing in 3D and editing"),
  areaIds: ["brush-engines", "vrm-3d-characters", "canvas-2d-virtual-studio"],
};

export const LIBRARY_GROUP_SHARE: LibraryAreaGroup = {
  id: "share",
  label: t("함께 작업하고 보관하는 부품", "Parts that share and keep work"),
  diagramLabel: t("협업·저장·서버", "Sharing, storage, server"),
  hint: t("협업, 기기 안 저장, AI, 서버와 데이터", "Collaboration, on-device storage, AI, server and data"),
  areaIds: ["collab-realtime", "local-storage-pwa", "ai-on-device", "server-data"],
};

export const LIBRARY_GROUP_TOOLS: LibraryAreaGroup = {
  id: "tools",
  label: t("만들고 내보내는 도구", "Tools that build and export"),
  diagramLabel: t("만들고 내보내기", "Build and export"),
  hint: t("빌드, 검사, 파일 형식과 영상 출력", "Builds, checks, file formats and video output"),
  areaIds: ["build-quality-media"],
};

export const LIBRARY_AREA_GROUPS: readonly LibraryAreaGroup[] = [LIBRARY_GROUP_SCREEN, LIBRARY_GROUP_SHARE, LIBRARY_GROUP_TOOLS];
