/**
 * PayoutDialog.tsx
 *
 * 정산금 출금 안내 다이얼로그.
 *
 * 백엔드 정산·출금 API가 아직 없어 신청을 실제로 접수할 수 없다.
 * 이전에는 계좌 폼을 받고, 접수되지도 않는 신청을 "출금 요청 완료 /
 * 정산일에 입금됩니다"로 표시하는 모의 흐름이었는데, 이는 사용자가
 * 오지 않을 입금을 기다리게 만드는 잘못된 안내라 제거했다.
 * 지금은 출금 예정액과 함께 신청이 아직 열리지 않았음을 분명히
 * 알리고, 저장할 곳이 없는 계좌 정보도 받지 않는다.
 *
 * 실연결 시: getPayoutAvailability()가 신청 가능을 반환하게 되면
 * 신청 폼과 접수·이력·상태 표시를 이 자리에 되살린다.
 */
import * as Dialog from "@radix-ui/react-dialog";
import { Info, X } from "lucide-react";
import { useEffect, useRef } from "react";

import { useT } from "@/shared/lib/i18n";
import { cn } from "@/shared/lib/utils";
import { buttonClass } from "@/shared/components/ui/button-utils";

import { formatKrw } from "../revenue-aggregator";
import { getPayoutAvailability } from "../models/payout-availability";

interface PayoutDialogProps {
  readonly open: boolean;
  readonly netKrw: number;
  readonly onClose: () => void;
}

export function PayoutDialog({ open, netKrw, onClose }: PayoutDialogProps) {
  const t = useT();
  const contentRef = useRef<HTMLDivElement>(null);
  const availability = getPayoutAvailability();

  useEffect(() => {
    if (open) {
      contentRef.current?.querySelector("button")?.focus();
    }
  }, [open ]);

  if (!open) return null;

  return (
    <Dialog.Root open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" />
        <Dialog.Content
          ref={contentRef}
          className="fixed left-1/2 top-1/2 z-50 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-line bg-bg p-6 shadow-2xl"
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          <div className="flex items-start justify-between">
            <div>
              <Dialog.Title className="text-lg font-bold text-fg">{t("revenue.payout.title")}</Dialog.Title>
              <Dialog.Description className="mt-1 text-sm text-muted">
                {t("revenue.payout.amount", { amount: formatKrw(netKrw) })}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                onClick={onClose}
                aria-label={t("revenue.payout.close")}
                className="rounded-lg p-1.5 text-muted hover:bg-fg/10 hover:text-fg"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </Dialog.Close>
          </div>

          {!availability.submissionEnabled && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-accent/40 bg-accent/10 px-4 py-3"
            >
              <p className="flex items-center gap-2 text-sm font-semibold text-fg">
                <Info className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                {t("revenue.payout.notAvailableTitle")}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                {t("revenue.payout.notAvailableBody")}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={onClose}
            className={cn(buttonClass({ variant: "solid" }), "mt-5 w-full")}
          >
            {t("revenue.payout.close")}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
