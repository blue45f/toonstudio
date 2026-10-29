/**
 * 젖은 종이 정착 베이크 — 프로그램 id와 요청 키 정규화(Studio 진입 그래프에 실리는 가벼운 부분).
 *
 * 레인 카탈로그와 Canvas 호스트는 어떤 프로그램을 어떤 시드로 구울지(캐시 키)만 알면 된다. 물·안료·종이 계수
 * 표(`studio-wet-paper-programs.ts`)와 솔버는 호스트가 동적 import 하는 `studio-wet-paper-runtime.ts` 뒤에 있고,
 * SVG 내보내기(이미 지연 청크)만 정적으로 가져온다. 프로그램 표의 키 타입이 이 id 목록이라 id 를 더하면 표에도
 * 프로그램을 더해야 컴파일된다.
 */

export type StudioWetPaperBakeProgramId =
  | "moxi-sumi-dispersion"
  | "curtis-watercolor-backrun"
  | "curtis-granulating-wash"
  | "chu-tai-dry-brush";

export type StudioWetPaperBakePhase = "live" | "settled";

export const STUDIO_WET_PAPER_BAKE_PROGRAM_IDS: readonly StudioWetPaperBakeProgramId[] = Object.freeze([
  "moxi-sumi-dispersion",
  "curtis-watercolor-backrun",
  "curtis-granulating-wash",
  "chu-tai-dry-brush",
]);

const PROGRAM_ID_SET: ReadonlySet<string> = new Set(STUDIO_WET_PAPER_BAKE_PROGRAM_IDS);

export function isStudioWetPaperBakeProgramId(value: unknown): value is StudioWetPaperBakeProgramId {
  return typeof value === "string" && PROGRAM_ID_SET.has(value);
}

export interface StudioWetPaperBakeSettingsInput {
  readonly seed?: number;
  readonly phase?: string;
  readonly programId?: string | null;
}

/** 한 베이크를 가리키는 키(프로그램 표를 붙이기 전의 설정). */
export interface StudioWetPaperBakeRequestKey {
  /** 획 고정 시드(`watercolorBrushSeedFromKey(element.id)`). 벽시계 값이 아니다. */
  readonly seed: number;
  /** 정착 게이트: `"settled"`가 아니면 베이크하지 않는다(fail-closed). */
  readonly phase: StudioWetPaperBakePhase;
  readonly programId: StudioWetPaperBakeProgramId;
}

/**
 * 요청 키 정규화. 알 수 없는 phase는 live(베이크 안 함)로, 알 수 없는 프로그램은 null로 fail-closed 한다.
 * 시드가 유한한 수가 아니면 1을 쓴다.
 */
export function normalizeStudioWetPaperBakeRequestKey(
  input: StudioWetPaperBakeSettingsInput | null | undefined,
): StudioWetPaperBakeRequestKey | null {
  const source = input ?? {};
  if (!isStudioWetPaperBakeProgramId(source.programId)) return null;
  const seed = typeof source.seed === "number" && Number.isFinite(source.seed) ? source.seed : 1;
  return {
    seed: Math.floor(seed) | 0,
    phase: source.phase === "settled" ? "settled" : "live",
    programId: source.programId,
  };
}
