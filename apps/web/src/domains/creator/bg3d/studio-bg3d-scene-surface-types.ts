/**
 * 장면 문서 v3 의 선택 필드 두 개 — 프리미티브 노드의 절차 재질 참조(`surface`)와 문서 루트의 장면 레시피 봉투
 * (`sceneRecipe`) — 의 타입만 둔다(런타임 코드 없음).
 *
 * 이 파일은 `import type` 으로만 가져온다. Studio 진입 그래프 스캐너는 `import type` 간선을 세지 않으므로
 * (scripts/lib/studio-eager-graph-scan.mjs), 진입 그래프에 닿아 있는 문서 타입·정규화 모듈이 이 타입을 써도
 * 금지 도메인(bg3d) 모듈 수가 늘지 않는다. 검사·정규화 규칙과 한도 상수는 studio-bg3d-hierarchy.ts 에 있다.
 *
 * 배포 순서(2단계 호환): 이번 단계(읽기, Phase R)는 두 키를 받아들여 그대로 보존만 한다. 의미 검증·렌더·쓰기는
 * 다음 단계(쓰기, Phase W)에서 켠다. 옛 빌드는 모르는 키가 있는 문서를 엄격 파싱에서 거부하므로, 읽기를 먼저
 * 배포해야 롤백해도 저장 문서가 열린다.
 */

/** 절차 재질 위에 얹는 날씨·계절 덮개. 노드를 늘리지 않고 같은 표면에 합성한다. */
export type StudioBg3dSurfaceOverlayKind = "wet" | "snow" | "petals" | "leaves" | "dust";

/** 간판 문자의 문자 체계. 글꼴 선택과 세로쓰기 허용 여부가 이 값을 따른다. */
export type StudioBg3dSurfaceTextScript = "ko" | "ja" | "latin";

export interface StudioBg3dSurfaceOverlay {
  readonly kind: StudioBg3dSurfaceOverlayKind;
  /** 0–1. */
  readonly amount: number;
  /** 부호 없는 32비트 정수 시드. */
  readonly seed: number;
}

export interface StudioBg3dSurfaceText {
  /** 문서 텍스트 규칙(외부 주소·자격 증명 모양 거절)을 통과한 짧은 문자열. */
  readonly value: string;
  readonly script: StudioBg3dSurfaceTextScript;
  readonly vertical: boolean;
}

/**
 * 프리미티브 표면의 절차 재질 참조. `id` 만 필수이고 나머지는 재질 기본값을 덮어쓰는 선택 값이다.
 * 이 빌드가 모르는 재질 id 는 노드의 `color` 로 대신 그린다 — 재질 목록이 다른 빌드끼리도 문서가 깨지지 않는다.
 */
export interface StudioBg3dSurfaceRef {
  /** `/^[a-z][a-z0-9-]{1,39}$/`. */
  readonly id: string;
  /** 1–3개 소문자 hex(기본·보조·줄눈). */
  readonly colors?: readonly string[];
  /** 무늬 한 칸의 실제 크기(m), 0.02–8. */
  readonly tileM?: number;
  /** 무늬 회전(도), 0–180. */
  readonly angleDeg?: number;
  /** 0–1. */
  readonly roughness?: number;
  /** 재질 변형 번호, 정수 0–15. */
  readonly variant?: number;
  /** 낡음 정도, 0–1. */
  readonly wear?: number;
  /** 선화(LT) 재질선 기여, 0–1. */
  readonly lineWeight?: number;
  /** 창살·격자처럼 알파로 잘라 내는 재질인가. */
  readonly cutout?: boolean;
  readonly overlay?: StudioBg3dSurfaceOverlay;
  readonly text?: StudioBg3dSurfaceText;
}

/**
 * 장면 레시피 봉투. 레시피 본문은 "경계 있는 JSON" 으로만 검사하고(깊이·키·배열·문자열·바이트 한도) 의미는 보지 않는다
 * — 의미 검증은 구성기(지연 로드)가 레시피를 열 때 한다. 레시피가 깨져도 장면은 노드로 그대로 열린다.
 */
export interface StudioBg3dSceneRecipeEnvelope {
  readonly kind: "toonstudio.bg3d-scene-recipe-set";
  readonly version: 1;
  /** 1–4개. 각 레시피는 8자리 소문자 hex `instanceKey` 를 가지며 봉투 안에서 서로 다르다. */
  readonly recipes: readonly Readonly<Record<string, unknown>>[];
}
