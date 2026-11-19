import { CheckCircle2, HeartHandshake, PenTool, Vote } from "lucide-react";
import { useState } from "react";

import Link from "@/shared/navigation/router-link";

interface CoCreationPollOption {
  readonly id: string;
  readonly labelKo: string;
  readonly votes: number;
}

const INITIAL_POLL_OPTIONS: readonly CoCreationPollOption[] = [
  { id: "opt-prequel", labelKo: "숨겨진 조력자 시점 프리퀄 3컷", votes: 142 },
  { id: "opt-branch", labelKo: "다음 회차 분기 선택지 투표 반영", votes: 198 },
  { id: "opt-local", labelKo: "독자 사연 기반 로컬 4컷 스핀오프", votes: 94 },
];

export function CutsFandomCoCreationBar() {
  const [audienceLens, setAudienceLens] = useState<"all" | "30-plus-depth" | "healing">("all");
  const [votedId, setVotedId] = useState<string | null>(null);
  const [options, setOptions] = useState<readonly CoCreationPollOption[]>(INITIAL_POLL_OPTIONS);

  const totalVotes = options.reduce((sum, item) => sum + item.votes, 0);

  const handleVote = (optionId: string) => {
    if (votedId === optionId) return;
    setOptions((prev) =>
      prev.map((item) => {
        if (item.id === optionId) return { ...item, votes: item.votes + 1 };
        if (item.id === votedId) return { ...item, votes: Math.max(0, item.votes - 1) };
        return item;
      }),
    );
    setVotedId(optionId);
  };

  return (
    <section
      aria-label="독자 공동기획 및 시즌 완결 동행 바"
      className="mt-2 flex flex-col gap-3 rounded-xl border border-line bg-panel p-3.5 text-xs text-fg break-keep [overflow-wrap:break-word] sm:p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <HeartHandshake className="size-4 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
          <span className="font-semibold leading-[1.4] tracking-[-0.01em] text-fg">
            독자 공동기획 · 시즌 완결 동행
          </span>
        </div>
        <div
          role="group"
          aria-label="취향 큐레이션 렌즈"
          className="flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 sm:flex-wrap sm:overflow-visible sm:pb-0"
        >
          {([
            { id: "all", label: "전체 큐레이션" },
            { id: "30-plus-depth", label: "30대+ 서사·직장인" },
            { id: "healing", label: "감정 체크인·힐링" },
          ] as const).map((lens) => (
            <button
              key={lens.id}
              type="button"
              aria-pressed={audienceLens === lens.id}
              onClick={() => setAudienceLens(lens.id)}
              className={`inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg px-3 text-xs font-medium leading-[1.35] transition-colors duration-150 sm:min-h-8 sm:px-2.5 ${
                audienceLens === lens.id
                  ? "bg-accent-soft text-accent"
                  : "bg-card text-fg-2 hover:bg-raised hover:text-fg"
              }`}
            >
              {lens.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {options.map((option) => {
          const ratio = totalVotes > 0 ? Math.round((option.votes / totalVotes) * 100) : 0;
          const selected = votedId === option.id;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              onClick={() => handleVote(option.id)}
              className={`flex min-h-11 flex-col gap-1.5 rounded-lg p-3 text-left transition-colors duration-150 ${
                selected ? "bg-accent-soft ring-1 ring-accent" : "bg-card hover:bg-raised"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex items-start gap-1.5 font-medium leading-[1.4] tracking-[-0.01em] text-fg">
                  {selected ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-accent" strokeWidth={1.5} aria-hidden="true" />
                  ) : (
                    <Vote className="mt-0.5 size-3.5 shrink-0 text-fg-3" strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span>{option.labelKo}</span>
                </span>
                <span className="shrink-0 font-mono tabular-nums text-fg-2">{ratio}%</span>
              </div>
              <span className="tabular-nums text-[11px] text-fg-3">{option.votes}명 참여</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-col gap-2.5 border-t border-line/60 pt-2.5 text-xs leading-[1.6] tracking-[-0.01em] text-fg-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <span>
          {audienceLens === "30-plus-depth"
            ? "30대+ 성인 독자 취향 맞춤 서사·시즌 펀딩 작품을 우선 표시합니다."
            : audienceLens === "healing"
              ? "감정 체크인·번아웃 힐링 4컷 시리즈를 우선 표시합니다."
              : "마음에 드는 연출을 골라 3컷 파일럿으로 바로 창작을 시작할 수 있습니다."}
        </span>
        <Link
          href="/studio/growth-ip#rights"
          className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-raised px-3 font-medium text-fg transition-colors duration-150 hover:bg-accent-soft hover:text-accent sm:min-h-9 sm:w-auto"
        >
          <PenTool className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
          이 연출로 3컷 파일럿 시작
        </Link>
      </div>
    </section>
  );
}
