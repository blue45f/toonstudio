import type { ResearchSourceIdentity } from "./research-source-identity";

/**
 * 소스 대표 비주얼 — 마스트헤드 오른쪽 자리를 소스의 얼굴로 쓴다.
 *
 * 맞는 기존 브랜드 일러스트가 있는 소스는 그 아트를, 없는 소스는 소스 액센트
 * 그라디언트 + 큰 글리프 + 소스 이름의 타이포그래픽 표지를 쓴다. 둘 다 장식
 * 영역이다 — 소스 이름과 한 줄 정체성은 옆의 본문(칩·태그라인)이 텍스트로
 * 담당하므로, 표지는 aria-hidden으로 두고 이미지도 빈 alt를 유지한다
 * (기존 마스트헤드 아트의 접근성 계약과 동일).
 */
export function ResearchSourceCover({ identity }: { identity: ResearchSourceIdentity }) {
  if (identity.art) {
    return (
      <img
        className="resource-masthead-image"
        src={`/brand/illustrated-20260928/${identity.art}.webp`}
        alt=""
        aria-hidden="true"
        width={320}
        height={240}
      />
    );
  }
  return (
    <div aria-hidden="true" className="resource-masthead-image resource-source-cover relative overflow-hidden">
      <span className="absolute -right-7 -top-9 h-28 w-28 rounded-full border-[10px] border-white/15" />
      <span className="absolute -bottom-10 -left-5 h-24 w-24 rounded-full bg-white/15" />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 select-none text-[5.2rem] font-black leading-none text-white/30">
        {identity.glyph}
      </span>
      <span className="absolute left-3 top-3 max-w-[70%] truncate text-[11px] font-bold uppercase tracking-[.14em] text-white/85">
        {identity.name}
      </span>
      <span className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-black/35 to-transparent" />
    </div>
  );
}

/**
 * 소형 정체성 마크 (웨이브 5 · T5) — 여러 소스가 한 화면에 모이는 표면
 * (허브 카드·디렉터리 행·제공처 상태)용 작은 얼굴.
 *
 * 마스트헤드 표지와 같은 문법을 쓴다: 맞는 아트가 있으면 그 아트를 작은
 * 타일로, 없으면 소스 액센트 그라디언트 + 글리프의 타이포 표지를 쓴다.
 * 액센트 토큰은 조상의 research-source--<provider> 스코프에서 온다.
 * 이름·한 줄 정체성은 옆 본문이 텍스트로 담당하므로 마크는 장식으로 둔다.
 */
export function ResearchSourceMark({ identity }: { identity: ResearchSourceIdentity }) {
  if (identity.art) {
    return (
      <img
        src={`/brand/illustrated-20260928/${identity.art}.webp`}
        alt=""
        aria-hidden="true"
        width={44}
        height={44}
        loading="lazy"
        decoding="async"
        className="size-11 shrink-0 rounded-xl object-cover"
      />
    );
  }
  return (
    <div
      aria-hidden="true"
      className="resource-source-cover relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl"
    >
      <span className="select-none text-xl font-black leading-none text-white/90">{identity.glyph}</span>
    </div>
  );
}
