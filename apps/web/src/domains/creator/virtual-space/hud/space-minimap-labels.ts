/**
 * 미니맵 방 라벨 정리(declutter).
 *
 * 작은 미니맵(약 240px 폭)에 방 15개 이름을 모두 같은 크기로 그리면 글자가 서로 겹쳐 아무것도 읽히지 않았다.
 * WorkAdventure·Gather 지도처럼 "들어가는 것만, 겹치지 않게" 보여 준다.
 *
 * 1. 우선순위: 지금 있는 방 → 넓은 방 순서. 복도처럼 길쭉한 구역(가로세로비 5 초과)은 지금 있는 방이 아니면 라벨을 생략한다.
 * 2. 후보: 전체 이름 → 짧은 이름(공정 약칭 등) → 92% 글자 크기의 전체 이름 → 92% 짧은 이름. 방 안쪽에 들어가는 첫 후보를 쓴다.
 * 3. 이미 놓인 라벨 상자와 겹치면(여백 포함) 그 방은 라벨을 생략한다. 생략된 방도 접근성 이름·툴팁으로는 계속 알 수 있다.
 *
 * 순수 함수라 jsdom 없이 테스트한다. 글자 폭은 Pretendard 계열 굵은 글꼴의 근사치(한글 1em, 영문 대문자 0.68em 등)다.
 */

export interface SpaceMinimapLabelZone {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** 전체 이름(우선 후보). */
  readonly label: string;
  /** 짧은 이름(공정 약칭·첫 낱말). 없거나 전체 이름과 같으면 건너뛴다. */
  readonly shortLabel?: string | null;
}

export interface SpaceMinimapPlacedLabel {
  readonly id: string;
  readonly text: string;
  /** 월드 단위 글자 크기. */
  readonly fontSize: number;
  readonly cx: number;
  readonly cy: number;
}

export interface SpaceMinimapLabelOptions {
  /** 기본 글자 크기(월드 단위). */
  readonly fontSize: number;
  readonly currentId?: string | null;
  /** 글자 사이 간격(em). CSS letter-spacing과 맞춘다. */
  readonly letterSpacingEm?: number;
}

const FIT_WIDTH = 0.92;
const FIT_HEIGHT = 0.9;
const LINE_HEIGHT = 1.2;
const COLLISION_PADDING_EM = 0.3;
const SMALL_SCALE = 0.92;
const CORRIDOR_ASPECT = 5;

/** 글자 하나의 근사 폭(em). 한글·한자·가나는 전각, 영문·숫자·문장부호는 그보다 좁다. */
export function spaceMinimapGlyphWidthEm(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code === 0x20) return 0.3;
  if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0x3040 && code <= 0x30ff) || (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x1100 && code <= 0x11ff)) return 1;
  if (code === 0xb7 || code === 0x2027 || code === 0x30fb) return 0.4;
  if (/[A-Z]/u.test(char)) return 0.68;
  if (/[a-z0-9]/u.test(char)) return 0.56;
  if (/[.,·:;'"!|()[\]/&-]/u.test(char)) return 0.36;
  return 0.8;
}

export function spaceMinimapTextWidth(text: string, fontSize: number, letterSpacingEm = 0.04): number {
  const glyphs = [...text];
  const em = glyphs.reduce((sum, char) => sum + spaceMinimapGlyphWidthEm(char), 0) + letterSpacingEm * Math.max(0, glyphs.length - 1);
  return em * fontSize;
}

/** 이름에서 짧은 이름을 만든다: "로비·리셉션" → "로비", "탕비 라운지" → "탕비". 나눌 수 없으면 null. */
export function spaceMinimapFallbackShortLabel(label: string): string | null {
  const trimmed = label.trim();
  const first = trimmed.split(/[·・\s/&]+/u).find((part) => part.length > 0) ?? "";
  return first && first !== trimmed ? first : null;
}

interface Box { readonly minX: number; readonly minY: number; readonly maxX: number; readonly maxY: number }

function overlaps(a: Box, b: Box): boolean {
  return a.minX < b.maxX && a.maxX > b.minX && a.minY < b.maxY && a.maxY > b.minY;
}

export function layoutSpaceMinimapLabels(zones: readonly SpaceMinimapLabelZone[], options: SpaceMinimapLabelOptions): readonly SpaceMinimapPlacedLabel[] {
  const fontSize = Number.isFinite(options.fontSize) && options.fontSize > 0 ? options.fontSize : 0;
  if (fontSize === 0) return [];
  const spacing = options.letterSpacingEm ?? 0.04;
  const ordered = [...zones].filter((zone) => zone.width > 0 && zone.height > 0).sort((left, right) => {
    const leftCurrent = left.id === options.currentId ? 1 : 0;
    const rightCurrent = right.id === options.currentId ? 1 : 0;
    if (leftCurrent !== rightCurrent) return rightCurrent - leftCurrent;
    return right.width * right.height - left.width * left.height;
  });
  const placed: { readonly label: SpaceMinimapPlacedLabel; readonly box: Box }[] = [];
  for (const zone of ordered) {
    const current = zone.id === options.currentId;
    const aspect = Math.max(zone.width, zone.height) / Math.min(zone.width, zone.height);
    if (!current && aspect > CORRIDOR_ASPECT) continue;
    const texts = [zone.label.trim(), zone.shortLabel?.trim() ?? ""].filter((text, index, list) => text.length > 0 && list.indexOf(text) === index);
    const candidates = [1, SMALL_SCALE].flatMap((scale) => texts.map((text) => ({ text, size: fontSize * scale })));
    const cx = zone.x + zone.width / 2;
    const cy = zone.y + zone.height / 2;
    for (const candidate of candidates) {
      const width = spaceMinimapTextWidth(candidate.text, candidate.size, spacing);
      const height = candidate.size * LINE_HEIGHT;
      if (width > zone.width * FIT_WIDTH || height > zone.height * FIT_HEIGHT) continue;
      const pad = candidate.size * COLLISION_PADDING_EM;
      const box = { minX: cx - width / 2 - pad, minY: cy - height / 2 - pad, maxX: cx + width / 2 + pad, maxY: cy + height / 2 + pad };
      if (placed.some((entry) => overlaps(entry.box, box))) continue;
      placed.push({ label: { id: zone.id, text: candidate.text, fontSize: candidate.size, cx, cy }, box });
      break;
    }
  }
  return placed.map((entry) => entry.label);
}

export interface SpaceMinimapPeerCluster {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly count: number;
  readonly names: readonly string[];
}

/**
 * Gather 미니맵 클러스터링(ev_4fbf21ca): 인접한 팀원 핀(기본 반경 96px 이내)을 하나의 클러스터로 묶는다.
 */
export function clusterSpaceMinimapPeople(
  people: readonly { readonly id: string; readonly name: string; readonly point: { readonly x: number; readonly y: number } }[],
  radius = 96,
): readonly SpaceMinimapPeerCluster[] {
  const clusters: { id: string; x: number; y: number; count: number; names: string[] }[] = [];
  const rSq = radius * radius;
  for (const person of people) {
    const match = clusters.find((c) => {
      const dx = c.x - person.point.x;
      const dy = c.y - person.point.y;
      return dx * dx + dy * dy <= rSq;
    });
    if (match) {
      match.x = (match.x * match.count + person.point.x) / (match.count + 1);
      match.y = (match.y * match.count + person.point.y) / (match.count + 1);
      match.count += 1;
      if (person.name.trim()) match.names.push(person.name.trim());
    } else {
      clusters.push({
        id: person.id,
        x: person.point.x,
        y: person.point.y,
        count: 1,
        names: person.name.trim() ? [person.name.trim()] : [],
      });
    }
  }
  return clusters;
}

/**
 * SoWork 미니맵 팀원 더블클릭 이동(ev_b5e7b9e0): 아바타 겹침을 막기 위해 ±60px 결정론적 지터를 더한 도착점을 계산한다.
 */
export function spaceMinimapPeerTarget(
  point: { readonly x: number; readonly y: number },
  seedId: string,
  jitterPx = 60,
): { readonly x: number; readonly y: number } {
  let hash = 2166136261;
  for (let i = 0; i < seedId.length; i += 1) {
    hash ^= seedId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const angle = ((Math.abs(hash) % 360) * Math.PI) / 180;
  return {
    x: Math.round(point.x + Math.cos(angle) * jitterPx),
    y: Math.round(point.y + Math.sin(angle) * jitterPx),
  };
}
