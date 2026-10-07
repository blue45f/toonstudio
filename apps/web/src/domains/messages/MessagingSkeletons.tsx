import { cn } from "@/shared/lib/utils";

/**
 * 메시지군 로딩 실루엣 — 일반 블록 스켈레톤 대신 실제 목록·대화의 골격을 닮은 형태로
 * "무엇이 로딩되는 중인지"를 첫 화면에서 읽을 수 있게 한다.
 * 접근성 계약은 공용 LoadingState와 같다: role="status" + aria-label, 시각 요소는 aria-hidden.
 */

export function ThreadListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-label="대화 목록을 불러오는 중" className="py-1">
      <div aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="flex min-h-[76px] items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
            <span className="skeleton size-10 shrink-0 rounded-full" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className={cn("skeleton h-3.5 rounded", index % 2 === 0 ? "w-24" : "w-16")} />
                <span className="skeleton ml-auto h-3 w-10 shrink-0 rounded" />
              </span>
              <span className={cn("skeleton mt-2 block h-3 rounded", index % 3 === 0 ? "w-3/4" : "w-1/2")} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ConversationSkeleton() {
  return (
    <div role="status" aria-label="대화를 불러오는 중" className="flex min-h-[620px] flex-col">
      <div aria-hidden="true" className="flex min-h-16 items-center gap-3 border-b border-line bg-card px-3 py-2 sm:px-5">
        <span className="skeleton size-10 shrink-0 rounded-full" />
        <span className="min-w-0 flex-1">
          <span className="skeleton block h-3.5 w-28 rounded" />
          <span className="skeleton mt-2 block h-3 w-40 rounded" />
        </span>
      </div>
      <div aria-hidden="true" className="flex-1 space-y-5 px-4 py-5 sm:px-6">
        <div className="flex items-end gap-2">
          <span className="skeleton size-8 shrink-0 rounded-full" />
          <span className="skeleton h-11 w-56 max-w-[70%] rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <span className="skeleton h-11 w-44 max-w-[70%] rounded-2xl rounded-br-md" />
        </div>
        <div className="flex items-end gap-2">
          <span className="skeleton size-8 shrink-0 rounded-full" />
          <span className="skeleton h-16 w-64 max-w-[70%] rounded-2xl rounded-bl-md" />
        </div>
        <div className="flex justify-end">
          <span className="skeleton h-11 w-36 max-w-[70%] rounded-2xl rounded-br-md" />
        </div>
      </div>
      <div aria-hidden="true" className="border-t border-line bg-card p-3 sm:p-4">
        <span className="skeleton block h-14 w-full rounded-2xl" />
      </div>
    </div>
  );
}
