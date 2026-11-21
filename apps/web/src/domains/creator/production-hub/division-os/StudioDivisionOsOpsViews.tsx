import {
  Download,
  FileLock2,
  Fingerprint,
  ShieldAlert,
} from "lucide-react";

import type {
  BinaryLockRegistry,
  ForensicWatermarkEmbedResult,
  ForensicWatermarkExtractResult,
  OutsourceScopedLink,
} from "./binary-lock-forensic-guard";
import type { CutSlicePacket } from "./cut-slice-partition-stitch";
import {
  DIVISION_ROLE_METADATA,
  LAYER_FOLDER_METADATA,
  STANDARD_LAYER_FOLDERS,
  type DivisionRoleId,
  type LayerFolderId,
  type LayerGuardDecision,
  type TeamPresetSeat,
} from "./layer-authority-rbac";
import type {
  RoyaltySettlementStatement,
  SettlementModelMode,
} from "./studio-royalty-ledger";

import { useBilingual } from "@/shared/lib/i18n-bilingual-copy";

function sliceStatusTone(status: CutSlicePacket["status"]): "good" | "warn" | "bad" | "accent" {
  if (status === "approved") return "good";
  if (status === "retake") return "bad";
  if (status === "submitted") return "accent";
  return "warn";
}

const SAMPLE_BINARY_ASSETS: readonly string[] = [
  "ep12/20_LINE/ep12_slice01_line.clip",
  "ep12/40_SHADE/ep12_slice02_color.psd",
  "ep12/10_BG_3D/post_office_night.blend",
  "ep12/10_BG_3D/rooftop_chase.skp",
  "ep12/10_BG_3D/haewon_rig.vrm",
];

export interface WorkerInboxViewProps {
  readonly seats: readonly TeamPresetSeat[];
  readonly activeSeatId: string;
  readonly activeRoles: readonly DivisionRoleId[];
  readonly selectedFolder: LayerFolderId;
  readonly guardDecision: LayerGuardDecision;
  readonly slices: readonly CutSlicePacket[];
  readonly binaryRegistry: BinaryLockRegistry;
  readonly onSelectSeat: (seatId: string) => void;
  readonly onSelectFolder: (folder: LayerFolderId) => void;
  readonly onLeaseSlice: (sliceId: string) => void;
  readonly onSubmitSlice: (sliceId: string) => void;
  readonly onCheckoutBinary: (assetPath: string) => void;
  readonly onReleaseBinary: (assetPath: string) => void;
  readonly onForceReclaimBinary: (assetPath: string) => void;
}

export function WorkerInboxView({
  seats,
  activeSeatId,
  activeRoles,
  selectedFolder,
  guardDecision,
  slices,
  binaryRegistry,
  onSelectSeat,
  onSelectFolder,
  onLeaseSlice,
  onSubmitSlice,
  onCheckoutBinary,
  onReleaseBinary,
  onForceReclaimBinary,
}: WorkerInboxViewProps) {
  const bt = useBilingual("DivisionOsWorkerView");
  const activeSeat = seats.find((seat) => seat.seatId === activeSeatId) ?? seats[0];

  return (
    <div className="space-y-4" data-testid="divos-panel-worker">
      {/* 1. 직군 좌석 선택 & 8레이어 폴더 RBAC 쓰기 가드 */}
      <section className="divos-card space-y-3" aria-label={bt("8레이어 폴더 권한 가드", "8-folder layer RBAC guard")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt("8레이어 폴더 RBAC 쓰기 가드", "8-Folder Layer Authority RBAC Guard")}
            </h3>
            <p className="text-xs text-fg-2 [word-break:keep-all]">
              {bt(
                `현재 좌석 겸임 직군: ${activeRoles.map((r) => DIVISION_ROLE_METADATA[r].shortKo).join(", ")}`,
                `Assigned roles: ${activeRoles.map((r) => DIVISION_ROLE_METADATA[r].shortEn).join(", ")}`,
              )}
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-fg">
            <span>{bt("작업 좌석", "Active Seat")}</span>
            <select
              aria-label={bt("분업 OS 작업 좌석 선택", "Select Division OS worker seat")}
              value={activeSeat?.seatId ?? ""}
              onChange={(event) => onSelectSeat(event.target.value)}
              className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-xs text-fg"
            >
              {seats.map((seat) => (
                <option key={seat.seatId} value={seat.seatId}>
                  {bt(seat.seatNameKo, seat.seatNameEn)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {STANDARD_LAYER_FOLDERS.map((folderId) => {
            const meta = LAYER_FOLDER_METADATA[folderId];
            const isSelected = folderId === selectedFolder;
            return (
              <button
                key={folderId}
                type="button"
                className="divos-folder-btn justify-between text-left"
                aria-pressed={isSelected}
                onClick={() => onSelectFolder(folderId)}
              >
                <span className="truncate text-xs font-bold">{bt(meta.labelKo, meta.labelEn)}</span>
              </button>
            );
          })}
        </div>

        <div data-testid="divos-rbac-decision" className="rounded-xl border border-line bg-canvas p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="divos-pill" data-tone={guardDecision.allowed ? "good" : "bad"}>
              <span className="divos-pill-dot" aria-hidden="true" />
              {guardDecision.allowed ? bt("쓰기 허용", "WRITE ALLOWED") : bt("쓰기 차단", "WRITE DENIED")}
            </span>
            <span className="font-semibold text-fg [word-break:keep-all]">
              {bt(guardDecision.reasonKo, guardDecision.reasonEn)}
            </span>
          </div>
        </div>
      </section>

      {/* 2. 할당 Cut-Slice 인박스 & 앞뒤 1컷 컨텍스트 */}
      <section className="divos-card space-y-3" aria-label={bt("작업자 슬라이스 인박스", "Worker slice inbox")}>
        <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
          {bt("내 Cut-Slice 작업 인박스 (앞뒤 1컷 읽기 전용 컨텍스트)", "Assigned Cut-Slice Inbox (±1 Read-Only Context)")}
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2">
          {slices.slice(0, 4).map((slice) => (
            <article key={slice.sliceId} className="rounded-xl border border-line bg-canvas p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <strong className="divos-num font-bold text-fg">{slice.label}</strong>
                <span className="divos-pill" data-tone={sliceStatusTone(slice.status)}>
                  {slice.lease ? slice.lease.holderName : slice.status.toUpperCase()}
                </span>
              </div>
              <p className="mt-1 text-[11px] text-fg-2 [word-break:keep-all]">
                {slice.previousCutContext
                  ? bt(slice.previousCutContext.summaryKo, slice.previousCutContext.summaryEn)
                  : bt("첫 구간(이전 컷 없음)", "Opening slice (no previous cut)")}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="divos-action-btn"
                  data-variant="primary"
                  onClick={() => onLeaseSlice(slice.sliceId)}
                >
                  {bt("Lease 시작", "Claim Lease")}
                </button>
                <button
                  type="button"
                  className="divos-action-btn"
                  data-variant="good"
                  onClick={() => onSubmitSlice(slice.sliceId)}
                >
                  {bt("검수 제출", "Submit for QA")}
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* 3. 바이너리 원본(.clip/.psd/.blend/.skp/.vrm) 단독 체크아웃 잠금 */}
      <section className="divos-card space-y-3" aria-label={bt("바이너리 원본 단독 체크아웃 잠금", "Binary original exclusive checkout locks")}>
        <h3 className="flex items-center gap-2 text-sm font-bold text-fg [word-break:keep-all]">
          <FileLock2 className="size-4 text-accent" aria-hidden="true" />
          {bt("바이너리 원본 단독 체크아웃 잠금 (.clip · .psd · .blend · .skp · .vrm)", "Binary Checkout Lock (.clip · .psd · .blend · .skp · .vrm)")}
        </h3>
        <ul className="space-y-2">
          {SAMPLE_BINARY_ASSETS.map((assetPath) => {
            const lock = binaryRegistry.locks[assetPath];
            return (
              <li key={assetPath} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-canvas p-3 text-xs">
                <div className="min-w-0 flex-1">
                  <code className="block truncate font-semibold text-fg">{assetPath}</code>
                  <p className="mt-0.5 text-[11px] text-fg-2">
                    {lock
                      ? bt(`${lock.holderName} 단독 점유 중`, `Locked exclusively by ${lock.holderName}`)
                      : bt("잠금 없음 · 체크아웃 가능", "Unlocked · Available for checkout")}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {!lock ? (
                    <button
                      type="button"
                      className="divos-action-btn"
                      data-variant="primary"
                      onClick={() => onCheckoutBinary(assetPath)}
                    >
                      {bt("체크아웃", "Check Out")}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        className="divos-action-btn"
                        data-variant="good"
                        onClick={() => onReleaseBinary(assetPath)}
                      >
                        {bt("잠금 해제", "Release Lock")}
                      </button>
                      <button
                        type="button"
                        className="divos-action-btn"
                        data-variant="danger"
                        onClick={() => onForceReclaimBinary(assetPath)}
                      >
                        {bt("PD 강제 회수", "PD Force Reclaim")}
                      </button>
                    </>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}

export interface OutsourceRoyaltyDeskViewProps {
  readonly settlementMode: SettlementModelMode;
  readonly platformFeeRate: number;
  readonly statement: RoyaltySettlementStatement;
  readonly exportedFormat: "csv" | "json" | null;
  readonly exportedPayload: string;
  readonly scopedLink: OutsourceScopedLink;
  readonly scopedLinkStatusText: string;
  readonly watermarkEmbed: ForensicWatermarkEmbedResult | null;
  readonly watermarkExtract: ForensicWatermarkExtractResult | null;
  readonly onChangeSettlementMode: (mode: SettlementModelMode) => void;
  readonly onChangePlatformFee: (rate: number) => void;
  readonly onAccrueG3Cuts: () => void;
  readonly onGenerateExport: (format: "csv" | "json") => void;
  readonly onIssueOutsourceLink: () => void;
  readonly onRunForensicWatermark: () => void;
}

export function OutsourceRoyaltyDeskView({
  settlementMode,
  platformFeeRate,
  statement,
  exportedFormat,
  exportedPayload,
  scopedLink,
  scopedLinkStatusText,
  watermarkEmbed,
  watermarkExtract,
  onChangeSettlementMode,
  onChangePlatformFee,
  onAccrueG3Cuts,
  onGenerateExport,
  onIssueOutsourceLink,
  onRunForensicWatermark,
}: OutsourceRoyaltyDeskViewProps) {
  const bt = useBilingual("DivisionOsOutsourceView");

  return (
    <div className="space-y-4" data-testid="divos-panel-outsource">
      {/* 1. Studio No.9 인세 기본 + 한국 CP MG/RS 정산 원장 */}
      <section className="divos-card space-y-3" aria-label={bt("정산 원장 및 인세 계산", "Settlement ledger and royalty calculator")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-fg [word-break:keep-all]">
              {bt("스튜디오 공정별 인세 · MG/RS 자동 정산 원장", "Studio Royalty & Korean CP MG/RS Settlement Ledger")}
            </h3>
            <p className="divos-num text-xs text-fg-2">
              {bt(
                `총매출 ${statement.grossPlatformRevenueKrw.toLocaleString("ko-KR")}원 · 플랫폼 수수료 ${Math.round(platformFeeRate * 100)}% · 순매출 ${statement.netDistributableRevenueKrw.toLocaleString("ko-KR")}원`,
                `Gross ₩${statement.grossPlatformRevenueKrw.toLocaleString("en-US")} · Platform Fee ${Math.round(platformFeeRate * 100)}% · Net ₩${statement.netDistributableRevenueKrw.toLocaleString("en-US")}`,
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="divos-preset-btn"
              aria-pressed={settlementMode === "studio-no9-cut-plus-royalty"}
              onClick={() => onChangeSettlementMode("studio-no9-cut-plus-royalty")}
            >
              {bt("Studio No.9 (컷 단가 + 인세%)", "Studio No.9 (Cut + Royalty %)")}
            </button>
            <button
              type="button"
              className="divos-preset-btn"
              aria-pressed={settlementMode === "korean-cp-mg-rs"}
              onClick={() => onChangeSettlementMode("korean-cp-mg-rs")}
            >
              {bt("한국 CP 표준 (MG 선공제 + RS%)", "Korean CP (MG Recoup + RS %)")}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-xs font-semibold text-fg">
            <span>{bt("플랫폼 수수료", "Platform Fee")}</span>
            <select
              aria-label={bt("플랫폼 수수료율 선택", "Select platform fee rate")}
              value={String(platformFeeRate)}
              onChange={(event) => onChangePlatformFee(Number(event.target.value))}
              className="min-h-11 rounded-lg border border-line bg-canvas px-3 text-xs text-fg"
            >
              <option value="0.3">30%</option>
              <option value="0.35">35%</option>
              <option value="0.4">40%</option>
              <option value="0.5">50%</option>
            </select>
          </label>
          <button type="button" className="divos-action-btn" data-variant="good" onClick={onAccrueG3Cuts}>
            {bt("G3 승인 컷 +10 적립", "Accrue +10 G3 Cuts")}
          </button>
          <button type="button" className="divos-action-btn" data-variant="primary" onClick={() => onGenerateExport("csv")}>
            <Download className="size-4" aria-hidden="true" />
            {bt("CSV 정산서 생성", "Generate CSV Statement")}
          </button>
          <button type="button" className="divos-action-btn" onClick={() => onGenerateExport("json")}>
            {bt("JSON 정산서", "Generate JSON")}
          </button>
        </div>

        <div className="divos-table-wrap">
          <table className="divos-matrix-table">
            <thead>
              <tr>
                <th scope="col">{bt("참여자", "Contributor")}</th>
                <th scope="col">{bt("직군", "Role")}</th>
                <th scope="col">{bt("G3 컷", "G3 Cuts")}</th>
                <th scope="col">{bt("컷 단가 지급", "Cut Base")}</th>
                <th scope="col">{bt("인세/RS 총액", "Royalty/RS")}</th>
                <th scope="col">{bt("MG 공제", "MG Recoup")}</th>
                <th scope="col">{bt("세금(3.3%/VAT)", "Tax")}</th>
                <th scope="col">{bt("실지급액", "Net Payout")}</th>
              </tr>
            </thead>
            <tbody>
              {statement.lines.map((line) => (
                <tr key={line.contributorId}>
                  <td className="font-semibold text-fg">{line.name}</td>
                  <td className="text-fg-2">{bt(line.roleLabelKo, line.roleLabelEn)}</td>
                  <td className="divos-num">{line.approvedG3Cuts}</td>
                  <td className="divos-num">{line.baseCutPayKrw.toLocaleString("ko-KR")}</td>
                  <td className="divos-num">{line.royaltyOrRsGrossKrw.toLocaleString("ko-KR")}</td>
                  <td className="divos-num">{line.mgRecoupedThisPeriodKrw.toLocaleString("ko-KR")}</td>
                  <td className="divos-num">{line.taxDeltaKrw.toLocaleString("ko-KR")}</td>
                  <td className="divos-num font-bold text-fg">{line.netPayoutKrw.toLocaleString("ko-KR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {exportedFormat && exportedPayload ? (
          <div data-testid="divos-settlement-export" className="space-y-1">
            <p className="text-xs font-bold text-fg">
              {bt(`생성된 ${exportedFormat.toUpperCase()} 정산서 미리보기`, `Generated ${exportedFormat.toUpperCase()} Statement Preview`)}
            </p>
            <pre className="divos-code-preview divos-num">{exportedPayload}</pre>
          </div>
        ) : null}
      </section>

      {/* 2. 외주 스코프 시한부 링크 + 실제 RGBA LSB 비가시 포렌식 워터마크 */}
      <section className="divos-card space-y-3" aria-label={bt("외주 보안 링크 및 포렌식 워터마크", "Outsource scoped link and forensic watermark")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-sm font-bold text-fg [word-break:keep-all]">
              <Fingerprint className="size-4 text-accent" aria-hidden="true" />
              {bt("외주 시한부 스코프 링크 · RGBA 비가시 LSB 포렌식 워터마크", "Scoped Outsource Link · RGBA Invisible LSB Forensic Watermark")}
            </h3>
            <p className="divos-num text-xs text-fg-2">
              Token: <code>{scopedLink.token}</code> · {scopedLink.sliceId} ({scopedLink.allowedFolders.join(", ")})
            </p>
            <p className="mt-0.5 text-[11px] text-fg-3 [word-break:keep-all]">{scopedLinkStatusText}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" className="divos-action-btn" onClick={onIssueOutsourceLink}>
              <ShieldAlert className="size-4" aria-hidden="true" />
              {bt("48h 외주 링크 재발급", "Issue 48h Scoped Link")}
            </button>
            <button
              type="button"
              className="divos-action-btn"
              data-variant="primary"
              onClick={onRunForensicWatermark}
            >
              <Fingerprint className="size-4" aria-hidden="true" />
              {bt("RGBA 워터마크 삽입·복원 검증", "Embed & Verify RGBA LSB Watermark")}
            </button>
          </div>
        </div>

        {watermarkEmbed && watermarkExtract ? (
          <div data-testid="divos-watermark-proof" className="rounded-xl border border-line bg-canvas p-3 text-xs space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="divos-pill" data-tone={watermarkExtract.verified ? "good" : "bad"}>
                <span className="divos-pill-dot" aria-hidden="true" />
                {watermarkExtract.verified ? bt("비트 복원 · CRC-16 검증 PASS", "BIT RECOVERY · CRC-16 PASS") : bt("검증 실패", "VERIFY FAIL")}
              </span>
              <span className="divos-num font-semibold text-fg">
                {watermarkEmbed.embeddedBits} bits · ΔRGB ≤ ±{watermarkEmbed.maxChannelDelta} · PSNR {watermarkEmbed.psnrDb} dB · CRC-16 {watermarkEmbed.crc16Hex}
              </span>
            </div>
            <p className="divos-num text-fg-2">
              {bt("복원 페이로드:", "Recovered Payload:")} <code>{watermarkExtract.payload}</code>
            </p>
          </div>
        ) : null}
      </section>
    </div>
  );
}
