/**
 * 카드 아트 밴드 (디자인 웨이브 7) — 브랜드 일러스트를 카드 상단의 얼굴로 쓴다.
 *
 * 텍스트만으로 고르게 하던 선택 카드(장면 팩·시작 기획·실습 목차)에 실제
 * 일러스트를 세워, 첫 화면에서 "무엇을 고르는지"가 그림으로 먼저 읽히게 한다.
 * 일러스트는 분위기·장르 신호일 뿐 자료 데이터가 아니므로 장식으로 둔다
 * (aria-hidden, 빈 alt) — 제목·설명·상태는 카드 본문 텍스트가 담당한다.
 * 부모 카드의 패딩만큼 음수 마진으로 밀어 넣는 것은 소비처가 className으로 정한다.
 */
export function ArtBand({
  art,
  glyph,
  className = "",
}: {
  /** `/brand/illustrated-20260928/<art>.webp` 의 파일 이름(확장자 제외). */
  art: string;
  /** 제목 첫 글자처럼 카드 정체성을 겹쳐 읽히게 하는 큰 글리프(장식). */
  glyph?: string;
  className?: string;
}) {
  return (
    <span aria-hidden="true" className={`relative block overflow-hidden ${className}`}>
      <img
        src={`/brand/illustrated-20260928/${art}.webp`}
        alt=""
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <span className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/5 to-transparent" />
      {glyph ? (
        <span className="absolute -right-2 -top-7 select-none text-[4.5rem] font-black leading-none text-white/25">
          {glyph}
        </span>
      ) : null}
    </span>
  );
}
