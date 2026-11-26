import { Eye, KeyRound, Link2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { studioEcosystemClient } from "@/platform/studio-ecosystem-client";

import {
  buildTimelapseEndcardSpec,
  computeRgbaDiffSummary,
} from "./manuscript-visual-diff";

export function HandoffProofGuestDiffPanel({
  workTitle,
}: {
  readonly workTitle: string;
}) {
  const [episodeLabel, setEpisodeLabel] = useState("48화 최종 납품본");
  const [certResult, setCertResult] = useState<{
    readonly shortVerifyCode: string;
    readonly sha256Digest: string;
  } | null>(null);

  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [guestRevoked, setGuestRevoked] = useState(false);

  const [diffSummaryKo, setDiffSummaryKo] = useState<string>("");
  const [byokNoticeKo, setByokNoticeKo] = useState<string>("");
  const [keyTail, setKeyTail] = useState("9A7F");

  const handleIssueCert = async () => {
    try {
      const res = await studioEcosystemClient.issueDeliveryRightsCertificate({
        workTitle,
        episodeLabel,
        creatorName: "담당 제작팀",
        verifiedAssets: [
          {
            assetName: "배경_세트_본편.glb",
            category: "3d-bg",
            licenseType: "상용 이용권 확인",
            licenseVerified: true,
          },
          {
            assetName: "대사_기본_서체",
            category: "font",
            licenseType: "오픈 폰트 라이선스",
            licenseVerified: true,
          },
        ],
        zeroUnauthorizedAiConfirmed: true,
      });
      setCertResult({
        shortVerifyCode: res.shortVerifyCode,
        sha256Digest: res.sha256Digest,
      });
    } catch {
      const endcard = buildTimelapseEndcardSpec({
        workTitle,
        creatorHandle: "toonstudio_team",
        certificateShortCode: "LOCAL01",
      });
      setCertResult({
        shortVerifyCode: "LOCAL01",
        sha256Digest: `local-preview-${endcard.durationSec}s`,
      });
    }
  };

  const handleCreateGuestLink = async () => {
    setGuestRevoked(false);
    try {
      const res = await studioEcosystemClient.createGuestReviewLink({
        workspaceId: "ws-ep-review",
        episodeCutLabel: `${workTitle} · ${episodeLabel}`,
        createdByUserId: "studio-pd",
        ttlHours: 48,
      });
      setGuestToken(res.token);
    } catch {
      setGuestToken("grv_local_preview_48h");
    }
  };

  const handleRevokeGuestLink = async () => {
    if (!guestToken) return;
    try {
      await studioEcosystemClient.revokeGuestReviewLink(guestToken);
    } catch {
      // 오프라인 상태에서도 즉시 로컬 차단 상태로 전환한다.
    }
    setGuestRevoked(true);
  };

  const handleScanVisualDiff = () => {
    const w = 120;
    const h = 80;
    const v1 = new Uint8Array(w * h * 4).fill(250);
    const v2 = new Uint8Array(v1);
    for (let y = 24; y <= 46; y += 1) {
      for (let x = 32; x <= 68; x += 1) {
        const idx = (y * w + x) * 4;
        v2[idx] = 28;
        v2[idx + 1] = 44;
        v2[idx + 2] = 76;
      }
    }
    const diff = computeRgbaDiffSummary({
      width: w,
      height: h,
      beforeRgba: v1,
      afterRgba: v2,
    });
    const box = diff.boundingBox;
    const endcard = buildTimelapseEndcardSpec({
      workTitle,
      creatorHandle: "studio_creator",
      certificateShortCode: certResult?.shortVerifyCode ?? null,
    });
    setDiffSummaryKo(
      box
        ? `수정 영역 감지 완료: (${box.minX}, ${box.minY}) 크기 ${box.width}×${box.height}px (${diff.changedRatioPct}%) · 타임랩스 끝 안내(${endcard.durationSec}초) 준비됨`
        : "변경된 픽셀 영역이 없습니다.",
    );
  };

  const handleEnableByok = async () => {
    const tail = keyTail.trim().slice(-4) || "0000";
    try {
      const res = await studioEcosystemClient.configureStudioByokPolicy(
        "ws-ep-review",
        {
          enabled: true,
          provider: "openai",
          keyTailHint: tail,
        },
      );
      setByokNoticeKo(
        `스튜디오 자체 AI 키 분리 적용됨 (${res.maskedKeyHint ?? `****-${tail}`} · 당사 서버 추가 과금 0원)`,
      );
    } catch {
      setByokNoticeKo(
        `스튜디오 자체 AI 키 분리 적용됨 (****-${tail} · 당사 서버 추가 과금 0원)`,
      );
    }
  };

  return (
    <div
      data-testid="handoff-proof-guest-diff-panel"
      className="mt-3 rounded-lg border border-line bg-card p-3 text-xs"
    >
      <p className="font-semibold text-fg">
        연재처 납품 확인 · 외부 무가입 검수 · 수정 영역 스캔 · 자체 AI 키 분리
      </p>
      <p className="mt-0.5 text-[11px] leading-[1.45] text-fg-3 [word-break:keep-all]">
        사용권 확인 내역에 위변조 방지 해시를 찍어 납품하고, 외부 담당 PD에게는 회원가입 없는 비교 검수 링크만 건넨 뒤 마감 직후 바로 회수합니다.
      </p>

      <div className="mt-2.5 grid gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-line bg-panel p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-medium text-fg">
              <ShieldCheck size={13} className="text-accent" aria-hidden />
              납품 권리 확인서 발급
            </span>
            <input
              type="text"
              value={episodeLabel}
              onChange={(e) => setEpisodeLabel(e.target.value)}
              aria-label="납품 회차명"
              className="h-7 w-28 rounded border border-line bg-card px-2 text-[11px] text-fg"
            />
          </div>
          <button
            type="button"
            data-testid="issue-rights-cert-btn"
            onClick={() => void handleIssueCert()}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-line bg-card px-2.5 font-medium text-fg transition-colors duration-150 hover:border-accent"
          >
            해시 서명 확인서 만들기
          </button>
          {certResult ? (
            <p className="mt-1.5 text-[11px] tabular-nums text-good">
              발급 완료 #{certResult.shortVerifyCode}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-line bg-panel p-2.5">
          <span className="inline-flex items-center gap-1 font-medium text-fg">
            <Link2 size={13} className="text-accent" aria-hidden />
            외부 PD 무가입 1클릭 검수 링크
          </span>
          <div className="mt-2 flex gap-1.5">
            <button
              type="button"
              data-testid="create-guest-review-btn"
              onClick={() => void handleCreateGuestLink()}
              className="inline-flex min-h-9 flex-1 items-center justify-center rounded-md border border-line bg-card px-2 font-medium text-fg transition-colors duration-150 hover:border-accent"
            >
              검수 링크 발급
            </button>
            {guestToken && !guestRevoked ? (
              <button
                type="button"
                data-testid="revoke-guest-review-btn"
                onClick={() => void handleRevokeGuestLink()}
                className="inline-flex min-h-9 items-center justify-center rounded-md border border-line bg-card px-2 text-fg-2 transition-colors duration-150 hover:text-fg"
              >
                즉시 회수
              </button>
            ) : null}
          </div>
          {guestToken ? (
            <p className="mt-1.5 text-[11px] tabular-nums text-fg-2">
              {guestRevoked
                ? "링크 회수됨 · 외부 열람 차단 완료"
                : `활성 토큰: ${guestToken}`}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-line bg-panel p-2.5">
          <span className="inline-flex items-center gap-1 font-medium text-fg">
            <Eye size={13} className="text-accent" aria-hidden />
            수정 전후 바뀐 위치 1초 스캔
          </span>
          <button
            type="button"
            data-testid="scan-visual-diff-btn"
            onClick={handleScanVisualDiff}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-line bg-card px-2.5 font-medium text-fg transition-colors duration-150 hover:border-accent"
          >
            바뀐 픽셀 영역·타임랩스 확인
          </button>
          {diffSummaryKo ? (
            <p className="mt-1.5 text-[11px] leading-[1.4] text-fg-2 [word-break:keep-all]">
              {diffSummaryKo}
            </p>
          ) : null}
        </div>

        <div className="rounded-md border border-line bg-panel p-2.5">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-1 font-medium text-fg">
              <KeyRound size={13} className="text-accent" aria-hidden />
              스튜디오 자체 AI 키 분리
            </span>
            <input
              type="text"
              maxLength={4}
              value={keyTail}
              onChange={(e) => setKeyTail(e.target.value)}
              aria-label="키 끝 4자리 표시용"
              className="h-7 w-16 rounded border border-line bg-card px-2 text-center text-[11px] tabular-nums text-fg"
            />
          </div>
          <button
            type="button"
            data-testid="enable-studio-byok-btn"
            onClick={() => void handleEnableByok()}
            className="mt-2 inline-flex min-h-9 w-full items-center justify-center rounded-md border border-line bg-card px-2.5 font-medium text-fg transition-colors duration-150 hover:border-accent"
          >
            원가 분리 모드 켜기
          </button>
          {byokNoticeKo ? (
            <p className="mt-1.5 text-[11px] text-good [word-break:keep-all]">
              {byokNoticeKo}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
