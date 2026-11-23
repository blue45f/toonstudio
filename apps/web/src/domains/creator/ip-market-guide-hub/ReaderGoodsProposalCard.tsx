/**
 * 독자 역제안 굿즈(ReaderGoodsProposal) 팬 투표 → 작가 1클릭 승인 → 제안자 혜택·로열티 정산 카드.
 */

import { useState } from "react";

import {
  approveReaderGoodsProposalByCreator,
  calculateReaderGoodsProposalSettlement,
  READER_GOODS_PROPOSAL_PRESETS,
  voteReaderGoodsProposal,
  type ReaderGoodsProposal,
} from "./market-tryon-bounty-engine";

export interface ReaderGoodsProposalCardProps {
  readonly onNotify?: (message: string) => void;
}

const STATUS_LABEL: Readonly<Record<ReaderGoodsProposal["status"], string>> = {
  voting: "팬 투표 진행 중",
  "goal-reached": "투표 목표 달성 · 작가 승인 대기",
  "creator-approved": "작가 1클릭 승인 완료 · 제작 예약",
  "in-production": "POD 제작 진행 중",
};

export function ReaderGoodsProposalCard({ onNotify }: ReaderGoodsProposalCardProps) {
  const [proposals, setProposals] = useState<readonly ReaderGoodsProposal[]>(READER_GOODS_PROPOSAL_PRESETS);

  const handleVote = (proposalId: string, votes: number) => {
    setProposals((prev) =>
      prev.map((item) => (item.id === proposalId ? voteReaderGoodsProposal(item, votes) : item)),
    );
    const target = proposals.find((item) => item.id === proposalId);
    if (target) {
      onNotify?.(`${target.titleKo} 독자 역제안 목업에 팬 투표 +${votes}표를 반영했습니다.`);
    }
  };

  const handleApprove = (proposal: ReaderGoodsProposal) => {
    const result = approveReaderGoodsProposalByCreator(proposal, "2026-11-23T12:25:00Z");
    if (result.approved) {
      setProposals((prev) =>
        prev.map((item) => (item.id === proposal.id ? result.proposal : item)),
      );
    }
    onNotify?.(result.reasonKo);
  };

  return (
    <section
      className="img-hub-card"
      aria-labelledby="reader-goods-heading"
      data-testid="reader-goods-proposal-section"
    >
      <div className="img-hub-section-head">
        <h3 id="reader-goods-heading" className="img-hub-section-title">
          <img
            src="/assets/studio/vibrant-sprites/emblem-community.webp"
            alt=""
            aria-hidden="true"
            className="img-hub-sprite-img"
          />
          독자 역제안 굿즈 (명장면 목업 → 팬 투표 → 작가 1클릭 승인)
        </h3>
        <span className="img-hub-badge img-hub-num" data-tone="cool">
          역제안 {proposals.length}건
        </span>
      </div>

      <p className="img-hub-muted">
        독자가 웹툰 명장면 컷을 지정해 아크릴 스탠드·포토카드·키링·담요 목업을 제안하고, 팬 투표 목표를
        달성하면 작가가 1클릭으로 승인해 제작과 제안자 로열티·초판 혜택을 자동 정산합니다.
      </p>

      <ul className="img-hub-step-list">
        {proposals.map((proposal) => {
          const votePercent = Math.min(100, Math.round((proposal.voteCount / Math.max(1, proposal.voteGoal)) * 100));
          const settlement = calculateReaderGoodsProposalSettlement(proposal);
          const isApproved =
            proposal.status === "creator-approved" || proposal.status === "in-production";
          const canApprove = proposal.voteCount >= proposal.voteGoal && !isApproved;

          return (
            <li key={proposal.id} className="img-hub-subcard" data-testid={`reader-proposal-${proposal.id}`}>
              <div className="img-hub-section-head">
                <div>
                  <strong className="text-sm font-bold text-fg">{proposal.titleKo}</strong>
                  <p className="img-hub-muted">
                    {proposal.cutReference} · 제안자 {proposal.proposerHandle} ({proposal.productLabelKo})
                  </p>
                </div>
                <span
                  className="img-hub-badge img-hub-num"
                  data-tone={isApproved ? "good" : canApprove ? "cool" : "warn"}
                >
                  {STATUS_LABEL[proposal.status]}
                </span>
              </div>

              <p className="img-hub-muted">{proposal.mockupNoteKo}</p>

              <div className="img-hub-progress-track">
                <div className="img-hub-progress-fill" style={{ width: `${votePercent}%` }} />
              </div>

              <div className="img-hub-section-head">
                <span className="img-hub-muted img-hub-num">
                  팬 투표 {proposal.voteCount.toLocaleString("ko-KR")} /{" "}
                  {proposal.voteGoal.toLocaleString("ko-KR")}표 ({votePercent}%) · 제안자 예상 로열티 ₩
                  {settlement.proposerRoyaltyKrw.toLocaleString("ko-KR")} ({settlement.proposerRoyaltyPercent}%)
                </span>
                <div className="img-hub-pill-row">
                  <button
                    type="button"
                    className="img-hub-btn"
                    onClick={() => handleVote(proposal.id, 10)}
                  >
                    팬 투표 +10
                  </button>
                  <button
                    type="button"
                    className={canApprove ? "img-hub-btn img-hub-btn-primary" : "img-hub-btn"}
                    disabled={isApproved}
                    onClick={() => handleApprove(proposal)}
                  >
                    {isApproved ? "작가 승인 완료" : "작가 1클릭 승인"}
                  </button>
                </div>
              </div>

              <p className="img-hub-muted img-hub-num">
                혜택: {settlement.proposerPerkKo} · 작가 정산 ₩
                {settlement.creatorShareKrw.toLocaleString("ko-KR")}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
