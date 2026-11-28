/**
 * Wave 117 — 한국 웹툰 스튜디오 9단계 표준 레이어 역할 추론 및 명명 정규화 순수 유틸리티.
 *
 * - 무의미·복사본 오염 이름(레이어 1, Layer 1 copy (2), 복사본 복사본, Untitled-1 등) 탐지
 * - 01_GUIDE_ ~ 09_SFX_ 스튜디오 표준 코드명 접두사 판정 및 스템 정제
 */

import {
  STUDIO_ROLE_ORDER,
  type LayerNodeKind,
  type LayerTreeNodeInput,
  type StudioLayerRole,
} from "./layer-tree-hygiene-types";

const CANONICAL_PREFIX_PATTERN =
  /^0[1-9]_(GUIDE|BG3D|FLAT|SHADOW|LINE|LIGHT|EFFECT|BALLOON|SFX)_[A-Za-z0-9가-힣_-]+$/u;

const COPY_NOISE_TOKEN_PATTERN =
  /(?:^|[\s_-])(?:copy(?:\s+of)?|복사본|복사|사본)(?:$|[\s_(-]|[0-9])/iu;

const GENERIC_LAYER_NAME_PATTERN =
  /^(?:(?:새[\s_-]*)?(?:래스터[\s_-]*|레스터[\s_-]*|벡터[\s_-]*|조정[\s_-]*)?(?:레이어|폴더|그룹|layer|folder|group|raster|vector|new[\s_-]+layer|untitled|무제|임시|temp|tmp|test|테스트|복사본|복사|사본|copy)(?:[\s_-]*(?:of[\s_-]+)?(?:layer|레이어|폴더|group|그룹)?[\s_-]*[0-9]*[\s_-]*(?:copy|복사본|복사|사본)?[\s_-]*(?:\(\s*[0-9]+\s*\)|\[\s*[0-9]+\s*\]|[0-9]+)?)*|[0-9]+|[a-z]{1,2}[0-9]*|asdf+|qwer+|zzz+)$/iu;

const NOISE_STRIP_PATTERNS: readonly RegExp[] = [
  /\bcopy\s+of\b/giu,
  /\bcopy\b/giu,
  /복사본/gu,
  /복사/gu,
  /사본/gu,
  /\bnew\s+layer\b/giu,
  /\buntitled\b/giu,
  /새\s*레이어/gu,
  /레이어\s*폴더/gu,
  /래스터\s*레이어/gu,
  /레스터\s*레이어/gu,
  /벡터\s*레이어/gu,
  /\blayer\b/giu,
  /\bfolder\b/giu,
  /\bgroup\b/giu,
  /레이어/gu,
  /폴더/gu,
  /그룹/gu,
  /무제/gu,
  /\(\s*[0-9]+\s*\)/gu,
  /\[\s*[0-9]+\s*\]/gu,
];

interface RoleKeywordRule {
  readonly role: StudioLayerRole;
  readonly pattern: RegExp;
}

const ROLE_KEYWORD_RULES: readonly RoleKeywordRule[] = [
  { role: "sfx", pattern: /(?:sfx|효과음|의성어|의태어|사운드|식자효과)/iu },
  { role: "balloon", pattern: /(?:말풍선|대사|식자|나레이션|balloon|speech|dialogue|text)/iu },
  { role: "guide", pattern: /(?:가이드|콘티|러프|스케치|밑그림|구도|guide|rough|sketch|layout|grid)/iu },
  { role: "bg3d", pattern: /(?:bg3d|3d|skp|배경|background|건축|실내|거리|원경)/iu },
  { role: "line", pattern: /(?:선화|펜선|잉크|라인|외곽선|lineart|line|ink|outline|pen)/iu },
  { role: "light", pattern: /(?:광원|하이라이트|역광|림라이트|글로우|반사광|발광|light|highlight|rim|glow|bloom|flare|빛)/iu },
  { role: "shadow", pattern: /(?:명암|그림자|음영|어둠|쉐도우|shadow|shade|occlusion|\bao\b)/iu },
  { role: "effect", pattern: /(?:이펙트|효과|집중선|스피드선|파티클|블러|스크린톤|보정|effect|vfx|\bfx\b|tone|particle|smoke|spark|blur)/iu },
  { role: "flat", pattern: /(?:밑색|채색|단색|피부|머리카락|헤어|의상|베이스|flat|base|color|fill|skin|hair|cloth|옷|눈)/iu },
];

export function isPixelBackedKind(kind: LayerNodeKind): boolean {
  return (
    kind === "raster" ||
    kind === "vector-line" ||
    kind === "text-balloon" ||
    kind === "bg3d-ref"
  );
}

/**
 * 무의미하거나 오염된 어시스턴트 레이어 이름인지 판별한다.
 * 예: "레이어 1", "Layer 1 copy (2)", "복사본 복사본", "Untitled-1", 빈 문자열.
 */
export function isMeaninglessLayerName(rawName: string): boolean {
  const trimmed = rawName.trim();
  if (trimmed.length === 0) return true;
  if (COPY_NOISE_TOKEN_PATTERN.test(trimmed)) return true;
  if (GENERIC_LAYER_NAME_PATTERN.test(trimmed)) return true;
  const cleaned = trimmed
    .replace(/[\s_-]+/gu, "")
    .replace(/[()[\]0-9]+/gu, "");
  return cleaned.length === 0;
}

/**
 * 이미 한국 웹툰 스튜디오 표준 코드명(`01_GUIDE_...` ~ `09_SFX_...`)을 만족하는지 검사한다.
 */
export function isCanonicalStudioLayerName(rawName: string): boolean {
  const trimmed = rawName.trim();
  if (!CANONICAL_PREFIX_PATTERN.test(trimmed)) return false;
  return !COPY_NOISE_TOKEN_PATTERN.test(trimmed);
}

function inferRoleFromName(rawName: string): StudioLayerRole | null {
  for (let i = 0; i < ROLE_KEYWORD_RULES.length; i += 1) {
    if (ROLE_KEYWORD_RULES[i].pattern.test(rawName)) {
      return ROLE_KEYWORD_RULES[i].role;
    }
  }
  return null;
}

/**
 * 레이어 종류·블렌드 모드·이름·하위 자식 역할을 종합해 9단계 스튜디오 표준 역할을 판정한다.
 */
export function inferStudioLayerRole(
  node: LayerTreeNodeInput,
  childRoles: readonly StudioLayerRole[] = [],
): StudioLayerRole {
  if (node.roleHint) return node.roleHint;

  if (node.kind === "guide") return "guide";
  if (node.kind === "bg3d-ref") return "bg3d";
  if (node.kind === "vector-line") return "line";

  const nameRole = inferRoleFromName(node.rawName);

  if (node.kind === "text-balloon") {
    return nameRole === "sfx" ? "sfx" : "balloon";
  }
  if (node.kind === "adjustment") {
    if (nameRole === "light" || nameRole === "shadow") return nameRole;
    return "effect";
  }
  if (node.kind === "folder") {
    if (nameRole) return nameRole;
    if (childRoles.length > 0) {
      const counts = new Map<StudioLayerRole, number>();
      for (let i = 0; i < childRoles.length; i += 1) {
        const r = childRoles[i];
        counts.set(r, (counts.get(r) ?? 0) + 1);
      }
      let bestRole: StudioLayerRole = "flat";
      let bestCount = -1;
      for (let i = 0; i < STUDIO_ROLE_ORDER.length; i += 1) {
        const candidate = STUDIO_ROLE_ORDER[i];
        const count = counts.get(candidate) ?? 0;
        if (count > bestCount) {
          bestCount = count;
          bestRole = candidate;
        }
      }
      return bestRole;
    }
    return "flat";
  }

  if (nameRole) return nameRole;
  if (node.blendMode === "multiply") return "shadow";
  if (node.blendMode === "screen" || node.blendMode === "add-glow") return "light";
  if (node.blendMode === "overlay") return "effect";
  return "flat";
}

export function extractCleanLayerStem(rawName: string): string {
  let working = rawName.trim();
  working = working.replace(
    /^0[1-9]_(?:GUIDE|BG3D|FLAT|SHADOW|LINE|LIGHT|EFFECT|BALLOON|SFX)_/u,
    "",
  );
  for (let i = 0; i < NOISE_STRIP_PATTERNS.length; i += 1) {
    working = working.replace(NOISE_STRIP_PATTERNS[i], " ");
  }
  working = working
    .replace(/[^A-Za-z0-9가-힣\s_-]+/gu, " ")
    .replace(/[\s-]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_+|_+$/gu, "");

  if (/^[0-9_]+$/u.test(working)) {
    return "";
  }
  const upperAscii = working.replace(/[a-z]+/gu, (match) => match.toUpperCase());
  return upperAscii.slice(0, 24).replace(/_+$/gu, "");
}
