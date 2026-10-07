/**
 * 글 카드 로딩 실루엣 — 회색 블록 대신 실제 카드의 골격(아바타·제목 줄·
 * 이미지 무대·본문 줄)을 미리 보여줘 로딩 중에도 목록의 형태가 읽히게 한다.
 * 카드 본체와 별도 모듈로 둬, 카드를 목킹하는 테스트와 독립적으로 쓴다.
 */
export function FanPostCardSkeleton() {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5" aria-hidden="true">
      <div className="flex items-start gap-3">
        <div className="skeleton size-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1">
          <div className="skeleton h-4 w-24 rounded-md" />
          <div className="skeleton mt-2 h-4 w-3/5 rounded-md" />
          <div className="skeleton mt-1.5 h-3 w-16 rounded-md" />
        </div>
      </div>
      <div className="skeleton mt-3 aspect-[16/10] w-full rounded-xl" />
      <div className="skeleton mt-3 h-3.5 w-full rounded-md" />
      <div className="skeleton mt-1.5 h-3.5 w-4/6 rounded-md" />
    </div>
  );
}
