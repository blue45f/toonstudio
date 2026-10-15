import { LockKeyhole } from "lucide-react";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

/**
 * 개인 이야기 안내 — 이 기기에만 임시 저장된다는 사실과 실명·가족 정보 작성 요령을 항상 보여 준다.
 * 접어 두지 않는다: 민감한 내용을 쓰기 전에 읽는 것이 목적이다.
 */
export function MyStoryPrivacyNotice({ compact = false, className }: {
  readonly compact?: boolean;
  readonly className?: string;
}) {
  const bt = useBilingual("MyStoryPrivacy");
  return (
    <aside
      aria-labelledby="my-story-privacy-title"
      className={cn("rounded-2xl border border-line bg-panel/40 p-4 sm:p-5", className)}
    >
      <h2 id="my-story-privacy-title" className="flex items-center gap-2 text-sm font-bold text-fg">
        <LockKeyhole size={16} aria-hidden className="text-accent" />
        {bt("이 기기에만 저장돼요", "Saved on this device only")}
      </h2>
      <ul className={cn("mt-2 space-y-1.5 text-sm leading-6 text-fg-2", compact && "text-xs leading-5")}>
        <li>
          {bt(
            "쓰는 중인 답변은 이 기기의 브라우저에만 임시 저장돼요. 서버로 보내지 않아요.",
            "Answers you are writing are kept only in this browser on this device. They are not sent to a server.",
          )}
        </li>
        <li>
          {bt(
            "AI로 다듬기를 직접 누를 때만, 그 순간 나레이션이 될 답변이 클라우드 AI로 전송돼요.",
            "Only when you press the AI polish button are the answers that become narration sent to the cloud AI.",
          )}
        </li>
        <li>
          {bt(
            "실명·연락처·주소·계좌번호는 적지 않는 게 안전해요. 가족이나 이웃 이야기는 이름 대신 ‘엄마’, ‘옆집 아저씨’처럼 호칭으로 적어 주세요.",
            "It is safest not to write real names, contact details, addresses or account numbers. For family or neighbors, use a title such as “Mom” or “the man next door” instead of a name.",
          )}
        </li>
      </ul>
    </aside>
  );
}
