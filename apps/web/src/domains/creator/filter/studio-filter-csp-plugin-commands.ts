/**
 * CSP 5.1.5 Filter PlugIn 호환 필터 9종의 명령 선언. 실행·React·상태 없이 선언 데이터만 둔다.
 *
 * 60269e38(2026-10-25)이 이 9종을 `STUDIO_FILTER_PACK_KINDS` 에 더하자 Filter 메뉴는 레지스트리에서
 * 행을 바로 만들었지만(`studio-main-menu-items-filter.ts`), 명령 카탈로그와 메뉴 인벤토리는 손으로
 * 관리하는 목록이라 따라가지 못했다. 그래서 9개 메뉴 행이 카탈로그에 없는 `filter.*` 명령을
 * 가리켰고, 명령 검색·도움말·용어 사전에서 이 필터들이 빠졌다.
 *
 * 다른 필터 명령은 `studio-command-catalog-base.ts` 에 있지만 그 파일은 소스 크기 래칫 기준선에 묶여
 * 늘 수 없다. 그래서 매뉴얼·브러시 랩 명령처럼 공개 카탈로그(`studio-command-catalog.ts`)가 이
 * 선언을 합친다. 한국어 이름은 메뉴 행·다이얼로그 갤러리와 같은 레지스트리 문자열을 읽는다.
 */
import { STUDIO_FILTER_PACK_LABELS } from "./studio-filter-pack-registry";

import type { StudioFilterPackKind } from "./studio-filter-pack-registry";
import type { StudioCommandCatalogEntry } from "../studio-command-catalog-base";
import type { TerminologyAlias } from "@toonstudio/studio-command-registry";

/** CLIP STUDIO PAINT 영문 UI 용어. */
const cspEn = (term: string): TerminologyAlias => ({ vendor: "csp", term, locale: "en" });
const ps = (term: string): TerminologyAlias => ({ vendor: "photoshop", term, locale: "en" });
/** 우리 쪽 짧은 이름과 필터 갤러리 검색어. */
const ours = (term: string): TerminologyAlias => ({ vendor: "toonstudio", term, locale: "ko" });

function cspFilterPluginCommand(
  kind: StudioFilterPackKind,
  englishLabel: string,
  aliases: readonly TerminologyAlias[],
): StudioCommandCatalogEntry {
  return {
    id: `filter.${kind}`,
    category: "filter",
    labels: [
      { locale: "ko", label: STUDIO_FILTER_PACK_LABELS[kind] },
      { locale: "en", label: englishLabel },
    ],
    aliases,
    helpNodeId: `help/filter/${kind}`,
    origins: [{ source: "menu", nativeId: `filter/${kind}` }],
  };
}

/** 레지스트리 선언 순서(`STUDIO_FILTER_UNION_WAVE_KINDS` 의 마지막 9종). */
export const STUDIO_CSP_FILTER_PLUGIN_COMMANDS: readonly StudioCommandCatalogEntry[] =
  Object.freeze([
    cspFilterPluginCommand("flow-based-abstraction", "Illustration style (ETF abstraction)", [
      ours("일러스트풍"),
      ours("ETF 추상화"),
    ]),
    cspFilterPluginCommand("pencil-art", "Pencil art (hatching sketch)", [
      ours("연필화"),
      ours("해칭 스케치"),
    ]),
    cspFilterPluginCommand("smoothing", "Smoothing (soften jaggies)", [
      cspEn("Smoothing"),
      ours("계단 완만화"),
    ]),
    cspFilterPluginCommand("sharp-strong", "Sharpen more", [
      cspEn("Sharpen (strong)"),
      ps("Sharpen More"),
    ]),
    // Photoshop Spherize 는 `filter.fisheye` 도 별칭으로 들고 있다. 용어 사전은 두 명령을 모두
    // 돌려주고 모호한 용어로 드러낸다(한쪽을 고르지 않는다).
    cspFilterPluginCommand("sphere-warp", "Spherize", [ps("Spherize")]),
    cspFilterPluginCommand("zigzag-warp", "Zigzag ripple", [ps("ZigZag")]),
    cspFilterPluginCommand("panorama-warp", "Panorama distortion", [ours("원통 왜곡")]),
    cspFilterPluginCommand("line-width-correct", "Adjust line width", [cspEn("Adjust line width")]),
    cspFilterPluginCommand("film-camera-style", "Film camera", [ours("아날로그 필름")]),
  ]);

/**
 * 공개 메뉴 인벤토리에서 9개 행이 들어갈 자리: 키 행 바로 뒤에 값의 순서대로 놓인다.
 * 메뉴는 `orderStudioFilterMenuItems` 가 정한 용도 분류 순서로 그리고, 9종은 다이얼로그 카탈로그
 * 끝에 등록돼 각자 분류(색상 보정·선명도·선화·복원·그림체·스타일·변형·왜곡)의 마지막 행이 된다.
 * 자리가 어긋나면 `studio-main-menu-groups.test.ts` 의 순서 가드가 깨진다.
 */
export const STUDIO_CSP_FILTER_PLUGIN_MENU_ROWS_AFTER: ReadonlyMap<string, readonly string[]> =
  new Map([
    ["filter/duotone", ["filter/film-camera-style"]],
    ["filter/surface-blur", ["filter/sharp-strong"]],
    ["filter/difference-of-gaussians", ["filter/smoothing", "filter/line-width-correct"]],
    ["filter/photocopy", ["filter/flow-based-abstraction", "filter/pencil-art"]],
    ["filter/polar-coordinates", ["filter/sphere-warp", "filter/zigzag-warp", "filter/panorama-warp"]],
  ]);
