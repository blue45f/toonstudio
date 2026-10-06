import { genreColor, genreTextColor } from "@/shared/lib/genre-color";

/**
 * 취향 스펙트럼 바 — 고른 장르가 실시간으로 색 구간으로 채워진다.
 *
 * 장르 hue는 장르 스펙트럼 단일 출처(genre-color)를 그대로 쓰고,
 * 바 아래에 고른 장르 칩을 같은 색으로 병기해 "내 스펙트럼"이 읽히게 한다.
 */
export function TasteSpectrumBar({ genres }: { genres: readonly string[] }) {
  return (
    <div>
      <div
        className="flex h-2.5 w-full gap-1"
        role="img"
        aria-label={
          genres.length > 0
            ? `고른 장르 ${genres.length}개로 채워진 취향 스펙트럼`
            : "아직 고른 장르가 없어 비어 있는 취향 스펙트럼"
        }
      >
        {genres.length === 0 ? (
          <span className="h-full w-full rounded-full bg-line/50" />
        ) : (
          genres.map((genre) => (
            <span
              key={genre}
              className="h-full flex-1 rounded-full transition-all duration-300"
              style={{ backgroundColor: genreColor(genre, 0.66) }}
            />
          ))
        )}
      </div>
      {genres.length > 0 ? (
        <ul className="mt-2.5 flex flex-wrap gap-1.5" aria-label="고른 장르">
          {genres.map((genre) => (
            <li
              key={genre}
              className="inline-flex items-center gap-1.5 rounded-full border border-line bg-panel px-2.5 py-1 text-[11px] font-bold"
            >
              <span className="size-1.5 rounded-full" style={{ backgroundColor: genreColor(genre) }} aria-hidden="true" />
              <span style={{ color: genreTextColor(genre) }}>{genre}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
