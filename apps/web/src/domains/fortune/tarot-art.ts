// 사진풍 타로 카드 아트 — 달빛 관측소 무드로 생성한 래스터 아트의 경로 해석.
// 메이저 아르카나는 카드별 아트, 마이너 아르카나는 슈트별 대표 아트를 쓴다.
// 아트가 없는 카드는 null을 돌려주고, 소비처는 기존 벡터 페이스
// (카드별 hue 그라디언트 + TarotMotif 글리프)로 폴백한다. 이미지 로드 실패
// 시에도 소비처가 onError로 같은 폴백을 켠다.

const MAJOR_ART_FILES: Readonly<Record<number, string>> = {
  0: "major-00.webp",
  1: "major-01.webp",
  2: "major-02.webp",
  3: "major-03.webp",
  4: "major-04.webp",
  5: "major-05.webp",
  6: "major-06.webp",
  7: "major-07.webp",
  8: "major-08.webp",
  9: "major-09.webp",
  10: "major-10.webp",
  11: "major-11.webp",
  13: "major-13.webp",
  14: "major-14.webp",
  16: "major-16.webp",
  17: "major-17.webp",
  18: "major-18.webp",
  19: "major-19.webp",
  20: "major-20.webp",
  21: "major-21.webp",
};

// getTarotVisual의 슈트 순서(WANDS·CUPS·SWORDS·PENTACLES)와 같은 순서.
const SUIT_ART_FILES: readonly string[] = [
  "suit-wands.webp",
  "suit-cups.webp",
  "suit-swords.webp",
  "suit-pentacles.webp",
];

export function getTarotArtPath(id: number): string | null {
  if (!Number.isInteger(id)) return null;
  if (id >= 0 && id < 22) {
    const file = MAJOR_ART_FILES[id];
    return file ? `/images/tarot/${file}` : null;
  }
  if (id >= 22 && id < 78) {
    const suit = Math.floor((id - 22) / 14);
    return `/images/tarot/${SUIT_ART_FILES[suit]}`;
  }
  return null;
}
