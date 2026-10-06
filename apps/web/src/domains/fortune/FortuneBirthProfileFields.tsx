import { useState } from "react";

import { Calendar, Trash2 } from "lucide-react";

import { cn } from "@/shared/lib/utils";

// 오늘의 운세 입력 카드 — 생년월일·출생시간·성별 입력 + 저장 고지와 삭제 동선.
// 민감정보 정책 (LOW-2): 입력값은 이 기기에만 저장되며, 저장된 생년월일은
// 이 카드에서 언제든 지울 수 있다. 지우면 페이지는 재입력 상태로 돌아간다.
interface FortuneBirthProfileFieldsProps {
  birthDate: string;
  birthTime: string;
  gender: string;
  onBirthDateChange: (value: string) => void;
  onBirthTimeChange: (value: string) => void;
  onGenderChange: (value: string) => void;
  hasSavedBirthProfile: boolean;
  onClearBirthProfile: () => void;
  tx: (source: string) => string;
}

export function FortuneBirthProfileFields({
  birthDate,
  birthTime,
  gender,
  onBirthDateChange,
  onBirthTimeChange,
  onGenderChange,
  hasSavedBirthProfile,
  onClearBirthProfile,
  tx,
}: FortuneBirthProfileFieldsProps) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="rounded-xl border border-line/50 bg-card/15 p-4 text-left space-y-3">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-accent">
        <Calendar className="h-3.5 w-3.5" /> 내 생년월일 (선택 입력 시 개인화)
      </span>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1">
          <label htmlFor="today-birth-date" className="text-[11px] font-semibold text-fg-2">{tx("생년월일 (양력)")}</label>
          <input
            id="today-birth-date"
            type="date"
            value={birthDate}
            onChange={(e) => onBirthDateChange(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="today-birth-time" className="text-[11px] font-semibold text-fg-2">{tx("태어난 시간")}</label>
          <input
            id="today-birth-time"
            type="time"
            value={birthTime}
            onChange={(e) => onBirthTimeChange(e.target.value)}
            className="w-full rounded-lg border border-line bg-card px-3 py-2.5 text-sm text-fg focus:border-accent focus:outline-none"
          />
        </div>
      </div>
      <div className="flex gap-2">
        {["none", "male", "female"].map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => onGenderChange(g)}
            className={cn(
              "min-h-10 flex-1 rounded-lg border py-2 text-[11px] font-semibold transition-all",
              gender === g
                ? "border-accent bg-accent-soft text-accent"
                : "border-line bg-card text-fg-2 hover:text-fg"
            )}
          >
            {g === "none" ? "선택 안 함" : g === "male" ? "남성" : "여성"}
          </button>
        ))}
      </div>
      <div className="border-t border-line/50 pt-3 space-y-2">
        <p className="text-[11px] leading-relaxed text-fg-3">
          {tx("입력한 생년월일·출생시간은 이 기기에만 저장돼 다음 방문에 다시 입력하지 않아도 돼요.")}
        </p>
        {hasSavedBirthProfile && !confirming && (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="inline-flex items-center gap-1 text-[11px] font-semibold text-fg-3 hover:text-fg"
          >
            <Trash2 className="h-3 w-3" />
            {tx("저장된 생년월일 지우기")}
          </button>
        )}
        {hasSavedBirthProfile && confirming && (
          <div className="space-y-2">
            <p className="text-[11px] leading-relaxed text-fg-2">
              {tx("지우면 생년월일이 필요한 운세는 다시 입력해야 해요. 저장된 운세 기록은 그대로 남아요.")}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  onClearBirthProfile();
                  setConfirming(false);
                }}
                className="rounded-lg border border-line bg-card px-3 py-1.5 text-[11px] font-semibold text-fg hover:text-accent"
              >
                {tx("지우기")}
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="rounded-lg px-3 py-1.5 text-[11px] font-semibold text-fg-3 hover:text-fg"
              >
                {tx("취소")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
