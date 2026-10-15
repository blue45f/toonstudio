import { CreatorAiTrainingBadgeFor } from "./CreatorAiTrainingBadge";

import type { CreatorCommunityMetadata } from "@/shared/lib/creator-community-publication-contract";
import type { CreatorPublicationSourceLink } from "@toonstudio/contracts/creator-publication-integrity";

export interface CreatorWorkRightsAsideProps {
  /** 공개 응답의 메타데이터. 구버전 응답처럼 `aiTraining`이 없어도 계약의 해석 규칙으로 읽는다. */
  readonly community: CreatorCommunityMetadata | undefined;
  readonly source: Pick<CreatorPublicationSourceLink, "disclosure" | "revisionId"> | null;
}

/**
 * 작품 상세(공유 상세)의 "제작 출처와 이용 조건" 블록. 출처 고지·다운로드 허용 여부와 함께
 * AI 학습 허용 표기를 설명·한계 고지와 같이 보여 준다. "미지정"은 "비허용"과 다른 상태이므로
 * 값을 밝히지 않은 작품을 불허로 오인하게 하는 불리언 표기를 쓰지 않는다.
 */
export function CreatorWorkRightsAside({ community, source }: CreatorWorkRightsAsideProps) {
  return (
    <aside
      className="mt-4 rounded-xl border border-line bg-card/55 px-3.5 py-3 text-xs leading-relaxed text-fg-2"
      aria-label="제작 출처와 이용 조건"
    >
      <p className="font-semibold text-fg">제작 출처와 이용 조건</p>
      {source?.disclosure && (
        <p className="mt-1 whitespace-pre-wrap">{source.disclosure}</p>
      )}
      {community?.attributionText && (
        <p className="mt-1 whitespace-pre-wrap text-fg-3">{community.attributionText}</p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {source?.revisionId && (
          <span className="rounded-full border border-line bg-canvas px-2 py-0.5">
            원본 revision {source.revisionId}
          </span>
        )}
        <span className="rounded-full border border-line bg-canvas px-2 py-0.5">
          다운로드 {community?.downloadAllowed ? "허용" : "비허용"}
        </span>
      </div>
      <CreatorAiTrainingBadgeFor community={community} variant="detail" className="mt-3" />
    </aside>
  );
}
