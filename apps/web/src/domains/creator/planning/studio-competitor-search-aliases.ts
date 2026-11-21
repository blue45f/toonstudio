/**
 * 4대 경쟁 앱(CLIP STUDIO PAINT · Photoshop · SketchUp · Procreate) 한/영 용어 별칭 보강표.
 *
 * `studio-command-search.ts`가 색인을 만들 때 실제 카탈로그·코퍼스 항목에만 별칭을 병합해,
 * 어떤 앱에서 옮겨 온 작가라도 F1 / ⌘K 검색 한 번으로 대응 ToonStudio 기능에 즉시 도달한다.
 */

import type { StudioSearchEntry } from "../studio-command-search";
import type { TerminologyAlias } from "@toonstudio/studio-command-registry";

export const EXTRA_COMPETITOR_ALIASES_BY_ENTRY_ID: Readonly<
  Record<string, readonly TerminologyAlias[]>
> = Object.freeze({
  "transform.pixel-selection": [
    { vendor: "csp", term: "퍼펫 워프", locale: "ko" },
    { vendor: "csp", term: "Puppet Warp", locale: "en" },
    { vendor: "photoshop", term: "Puppet Warp", locale: "en" },
    { vendor: "photoshop", term: "퍼펫 뒤틀기", locale: "ko" },
  ],
  "insert.background-3d": [
    { vendor: "csp", term: "LT 변환", locale: "ko" },
    { vendor: "csp", term: "레이어의 LT 변환", locale: "ko" },
    { vendor: "csp", term: "LT Conversion", locale: "en" },
    { vendor: "sketchup", term: "3D 배경", locale: "ko" },
    { vendor: "sketchup", term: "3D Background", locale: "en" },
    { vendor: "sketchup", term: "단면 컷어웨이", locale: "ko" },
    { vendor: "sketchup", term: "Section Plane", locale: "en" },
    { vendor: "sketchup", term: "Section Cut", locale: "en" },
    { vendor: "sketchup", term: "그림자 시간", locale: "ko" },
    { vendor: "sketchup", term: "Shadow Settings", locale: "en" },
    { vendor: "sketchup", term: "Shadows", locale: "en" },
  ],
  "vector.erase-to-intersection": [
    { vendor: "csp", term: "벡터 지우개", locale: "ko" },
    { vendor: "csp", term: "Vector Eraser", locale: "en" },
    { vendor: "csp", term: "교점까지 지우기", locale: "ko" },
  ],
  "comic.tone": [
    { vendor: "csp", term: "톤", locale: "ko" },
    { vendor: "csp", term: "스크린톤", locale: "ko" },
    { vendor: "csp", term: "Tone", locale: "en" },
    { vendor: "csp", term: "Screentone", locale: "en" },
  ],
  "insert.balloon": [
    { vendor: "csp", term: "말풍선", locale: "ko" },
    { vendor: "csp", term: "Balloon", locale: "en" },
    { vendor: "csp", term: "Speech Bubble", locale: "en" },
  ],
  "insert.mannequin-3d": [
    { vendor: "csp", term: "3D 데생인형", locale: "ko" },
    { vendor: "csp", term: "3D 데생 인형", locale: "ko" },
    { vendor: "csp", term: "3D Drawing Figure", locale: "en" },
  ],
  "edit.auto-actions": [
    { vendor: "csp", term: "오토액션", locale: "ko" },
    { vendor: "csp", term: "오토 액션", locale: "ko" },
    { vendor: "csp", term: "Auto Action", locale: "en" },
    { vendor: "photoshop", term: "Actions", locale: "en" },
  ],
  "file.export": [
    { vendor: "csp", term: "타임랩스", locale: "ko" },
    { vendor: "csp", term: "Timelapse", locale: "en" },
    { vendor: "csp", term: "Time-lapse", locale: "en" },
    { vendor: "photoshop", term: "PSD 내보내기", locale: "ko" },
    { vendor: "photoshop", term: "Export PSD", locale: "en" },
  ],
  "layer.clipping-mask": [
    { vendor: "csp", term: "클리핑", locale: "ko" },
    { vendor: "csp", term: "아래 레이어에서 클리핑", locale: "ko" },
    { vendor: "csp", term: "Clip at Layer Below", locale: "en" },
    { vendor: "photoshop", term: "Create Clipping Mask", locale: "en" },
    { vendor: "procreate", term: "Clipping Mask", locale: "en" },
  ],
  "layer.mask": [
    { vendor: "procreate", term: "알파 잠금", locale: "ko" },
    { vendor: "procreate", term: "Alpha Lock", locale: "en" },
    { vendor: "csp", term: "투명 픽셀 잠금", locale: "ko" },
    { vendor: "photoshop", term: "Lock Transparent Pixels", locale: "en" },
  ],
  "panel.layer-list": [
    { vendor: "procreate", term: "알파 잠금", locale: "ko" },
    { vendor: "procreate", term: "Alpha Lock", locale: "en" },
    { vendor: "csp", term: "투명 픽셀 잠금", locale: "ko" },
  ],
  "tool.fill": [
    { vendor: "csp", term: "참조 레이어", locale: "ko" },
    { vendor: "csp", term: "Reference Layer", locale: "en" },
    { vendor: "procreate", term: "컬러드롭", locale: "ko" },
    { vendor: "procreate", term: "ColorDrop", locale: "en" },
    { vendor: "procreate", term: "Color Drop", locale: "en" },
  ],
  "tool.liquify": [
    { vendor: "photoshop", term: "액화", locale: "ko" },
    { vendor: "photoshop", term: "유동화", locale: "ko" },
    { vendor: "photoshop", term: "Liquify", locale: "en" },
    { vendor: "csp", term: "픽셀 유동화", locale: "ko" },
    { vendor: "procreate", term: "Liquify", locale: "en" },
  ],
  "filter.lens-blur": [
    { vendor: "photoshop", term: "렌즈 블러", locale: "ko" },
    { vendor: "photoshop", term: "렌즈 흐림 효과", locale: "ko" },
    { vendor: "photoshop", term: "Lens Blur", locale: "en" },
  ],
  "layer.adjustment": [
    { vendor: "photoshop", term: "조정 레이어", locale: "ko" },
    { vendor: "photoshop", term: "Adjustment Layer", locale: "en" },
    { vendor: "csp", term: "색조 보정 레이어", locale: "ko" },
  ],
  "filter.filter-gallery": [
    { vendor: "photoshop", term: "스마트 필터", locale: "ko" },
    { vendor: "photoshop", term: "Smart Filter", locale: "en" },
  ],
  "view.flip-horizontal": [
    { vendor: "photoshop", term: "캔버스 뒤집기", locale: "ko" },
    { vendor: "photoshop", term: "Flip Canvas Horizontal", locale: "en" },
    { vendor: "csp", term: "좌우 반전", locale: "ko" },
    { vendor: "procreate", term: "Flip Horizontal", locale: "en" },
  ],
  "view.save-current-view": [
    { vendor: "sketchup", term: "씬 카메라", locale: "ko" },
    { vendor: "sketchup", term: "Scenes", locale: "en" },
    { vendor: "sketchup", term: "Scene Camera", locale: "en" },
  ],
  "file.import-interchange": [
    { vendor: "sketchup", term: "SKP 가져오기", locale: "ko" },
    { vendor: "sketchup", term: "Import SKP", locale: "en" },
  ],
  "window.quick-access-palette": [
    { vendor: "procreate", term: "퀵메뉴", locale: "ko" },
    { vendor: "procreate", term: "QuickMenu", locale: "en" },
    { vendor: "procreate", term: "Quick Menu", locale: "en" },
  ],
  "tool.smart-shape": [
    { vendor: "procreate", term: "퀵셰이프", locale: "ko" },
    { vendor: "procreate", term: "QuickShape", locale: "en" },
    { vendor: "procreate", term: "Quick Shape", locale: "en" },
  ],
  "view.perspective-guide": [
    { vendor: "procreate", term: "드로잉 어시스트", locale: "ko" },
    { vendor: "procreate", term: "Drawing Assist", locale: "en" },
  ],
  "property.stroke-stabilization": [
    { vendor: "procreate", term: "스트림라인", locale: "ko" },
    { vendor: "procreate", term: "StreamLine", locale: "en" },
    { vendor: "procreate", term: "손떨림 보정", locale: "ko" },
    { vendor: "csp", term: "손떨림 보정", locale: "ko" },
    { vendor: "csp", term: "Stabilization", locale: "en" },
  ],
  "brush.correct-current-stroke": [
    { vendor: "procreate", term: "스트림라인", locale: "ko" },
    { vendor: "procreate", term: "StreamLine", locale: "en" },
    { vendor: "procreate", term: "손떨림 보정", locale: "ko" },
    { vendor: "csp", term: "Stabilization", locale: "en" },
  ],
  "property.layer-mask": [
    { vendor: "procreate", term: "알파 잠금", locale: "ko" },
    { vendor: "procreate", term: "Alpha Lock", locale: "en" },
  ],
});

/**
 * 기존 엔트리 별칭 목록에 4대 경쟁 앱 보강 별칭을 중복 없이 병합한다.
 */
export function mergeCompetitorAliases(
  entryId: string,
  baseAliases: readonly TerminologyAlias[],
): readonly TerminologyAlias[] {
  const extras = EXTRA_COMPETITOR_ALIASES_BY_ENTRY_ID[entryId];
  if (!extras || extras.length === 0) return baseAliases;
  const seen = new Set(
    baseAliases.map((alias) => `${alias.vendor}:${alias.term.trim().toLowerCase()}`),
  );
  const merged = [...baseAliases];
  for (const extra of extras) {
    const key = `${extra.vendor}:${extra.term.trim().toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(extra);
  }
  return merged;
}

/**
 * 모든 경쟁 앱 별칭은 실제 카탈로그·코퍼스 엔트리에 직접 병합된다(가상 엔트리 0건).
 */
export const EXTRA_COMPETITOR_SEARCH_ENTRIES: readonly StudioSearchEntry[] = Object.freeze([]);
