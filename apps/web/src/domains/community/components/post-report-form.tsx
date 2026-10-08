import { translateCurrentStaticSourceText } from "@/shared/lib/i18n-bilingual-copy";
import { Flag } from "lucide-react";
import { useState } from "react";

import { api } from "@/platform/api";

interface PostReportFormProps {
  postId: string;
  sessionToken: string | null;
}

const t = (text: string) =>
  translateCurrentStaticSourceText("domains.community.CommunityPostPage", "ko", text);

// 글 신고 폼 — 홍보 상세의 신고 폼과 같은 구조·문구·길이 검증을 쓴다.
// 접수 결과는 운영 신고 큐로 넘어가며, 중복 신고도 같은 완료 문구로 응답한다(서버 멱등).
export function PostReportForm({ postId, sessionToken }: PostReportFormProps) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await api.post(
        `/community/posts/${encodeURIComponent(postId)}/reports`,
        { reason },
        { headers: sessionToken ? { "x-user-id": sessionToken } : undefined },
      );
      setDone(true);
      setReason("");
    } catch {
      setError(t("신고를 접수하지 못했습니다. 잠시 후 다시 시도해 주세요."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <details className="mt-6 rounded-2xl border border-line bg-card px-5 py-4">
      <summary className="inline-flex cursor-pointer items-center gap-1.5 text-sm font-semibold text-fg-2">
        <Flag size={15} aria-hidden />
        {t("도용·스팸·부적절한 게시물 신고")}
      </summary>
      {done ? (
        <p role="status" className="mt-3 text-sm text-fg-2">
          {t("신고를 접수했어요. 운영자가 검토합니다.")}
        </p>
      ) : (
        <form className="mt-3" onSubmit={(event) => void submit(event)}>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-fg-2">
            {t("신고 사유")}
            <textarea
              required
              minLength={10}
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={4}
              placeholder={t(
                "구체적인 사유와 확인할 수 있는 출처를 적어 주세요. 신고 내용은 공개 댓글에 표시되지 않습니다.",
              )}
              className="w-full resize-y rounded-xl border border-line bg-canvas px-3 py-2 text-sm text-fg outline-none focus:border-accent/60"
            />
          </label>
          {error && (
            <p role="alert" className="mt-2 text-xs text-bad">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="mt-3 min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-on-accent disabled:opacity-45"
          >
            {busy ? t("보내는 중...") : t("신고 보내기")}
          </button>
        </form>
      )}
    </details>
  );
}
