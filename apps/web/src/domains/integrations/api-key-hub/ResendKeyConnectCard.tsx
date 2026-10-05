/**
 * Resend 발송 키 연결 카드 — 작가 뉴스레터 실발송용 BYOK 키를 등록한다.
 *
 * Unsplash 카드와 다른 점: 연결 테스트를 하지 않는다. 등록 시점에 실제로 해볼 수
 * 있는 검증은 형식뿐이고, 실제 발송을 시도하는 테스트는 금지돼 있다(실메일 발송).
 * 대신 그 사실을 화면에 그대로 적는다 — 첫 발송에서 키가 확인되고, 발송이
 * 실패하면 실패 이력이 남는다.
 *
 * 키 저장은 뉴스레터 도메인의 공개 경계(`newsletter/public/newsletter-mail-key`)를
 * 쓴다. 현재 탭의 sessionStorage에만 보관하며, 발송 시 서버 릴레이로 1회 전달된다.
 */
import { ExternalLink, Eye, EyeOff, Mail, Unlink } from "lucide-react";
import { useEffect, useState } from "react";

import {
  browserNewsletterSessionStorage,
  isNewsletterResendConfigured,
  loadNewsletterResendApiKey,
  saveNewsletterResendApiKey,
} from "@/domains/newsletter/public/newsletter-mail-key";
import { MaskedKeyField, StoredKeyRow, type StoredKeyActionStatus } from "./MaskedKeyField";
import { validateApiKeyFormat } from "./api-key-hub-model";

const RESEND_API_KEYS_URL = "https://resend.com/api-keys";
/** Resend 키는 `re_`로 시작한다(공식 문서 기준). 접두사가 다르면 등록 전에 알려준다. */
const RESEND_API_KEY_PREFIX = "re_";

type ResendKeyStatus = StoredKeyActionStatus | "idle" | "registered";

export function ResendKeyConnectCard() {
  const [savedKey, setSavedKey] = useState(() =>
    loadNewsletterResendApiKey(browserNewsletterSessionStorage()),
  );
  const [input, setInput] = useState("");
  const [showInput, setShowInput] = useState(false);
  const [status, setStatus] = useState<ResendKeyStatus>("idle");

  useEffect(() => {
    if (status === "idle" || status === "copied") return;
    const timer = window.setTimeout(() => setStatus("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [status]);

  const configured = isNewsletterResendConfigured(savedKey);

  const registerKey = () => {
    const formatError = validateApiKeyFormat(input);
    if (formatError) {
      setStatus(formatError === "empty" ? "empty" : "too_short");
      return;
    }
    const saved = saveNewsletterResendApiKey(browserNewsletterSessionStorage(), input);
    if (!saved) {
      setStatus("save_failed");
      return;
    }
    setSavedKey(input.trim());
    setInput("");
    setShowInput(false);
    setStatus("registered");
  };

  const disconnectKey = () => {
    const saved = saveNewsletterResendApiKey(browserNewsletterSessionStorage(), "");
    if (!saved) {
      setStatus("save_failed");
      return;
    }
    setSavedKey("");
    setStatus("disconnected");
  };

  return (
    <section
      aria-labelledby="resend-key-title"
      className="rounded-3xl border border-line bg-panel p-5 shadow-card sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-accent/12 text-accent">
            <Mail className="h-5 w-5" aria-hidden />
          </span>
          <div>
            <h2 id="resend-key-title" className="text-base font-bold text-fg">
              뉴스레터 실발송
            </h2>
            <p className="mt-0.5 text-xs text-fg-3">
              Resend · 작가 뉴스레터 이메일 발송
            </p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            configured ? "bg-success/12 text-success" : "bg-panel-2 text-fg-3"
          }`}
        >
          <span className={`h-1.5 w-1.5 rounded-full ${configured ? "bg-success" : "bg-fg-4"}`} />
          {configured ? "연결됨" : "미설정"}
        </span>
      </div>

      <p className="mt-4 text-sm leading-6 text-fg-2">
        Resend에서 발급한 내 API 키를 등록하면 뉴스레터 발송이 실제 이메일로 나갑니다.
        키가 없으면 발송은 로컬 기록만 남고 메일은 나가지 않습니다. 발송은 ToonStudio
        서버 릴레이를 거치며, 릴레이가 준비되지 않은 환경에서는 발송이 실패로 기록되고
        초안은 그대로 남습니다.
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <a
          href={RESEND_API_KEYS_URL}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 font-semibold text-accent hover:underline"
        >
          Resend에서 키 발급받기
          <ExternalLink className="h-3.5 w-3.5" aria-hidden />
        </a>
        <span className="text-xs text-fg-3">
          키는 <code className="font-mono">re_</code>로 시작합니다. 실제 발송에는 Resend에서
          발신 도메인 인증(SPF/DKIM)도 필요합니다.
        </span>
      </div>

      {configured ? (
        <div className="mt-5">
          <StoredKeyRow
            label="내 Resend 키"
            apiKey={savedKey}
            status={status}
            onStatusChange={setStatus}
            trailingAction={
              <button
                type="button"
                onClick={disconnectKey}
                className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-danger transition hover:bg-danger/10"
              >
                <Unlink className="h-3.5 w-3.5" aria-hidden />
                연결 해제
              </button>
            }
          />
          <p className="mt-2 text-xs leading-5 text-fg-3" role="status" aria-live="polite">
            {status === "registered"
              ? "키를 등록했어요. 연결 테스트는 하지 않으며, 첫 발송에서 키가 확인됩니다."
              : status === "save_failed"
                ? "키를 저장하지 못했습니다. 이 탭에서 다시 시도해 주세요."
                : "키는 이 탭을 여는 동안만 유지됩니다. 탭을 닫으면 다시 등록해야 합니다."}
          </p>
        </div>
      ) : (
        <div className="mt-5">
          <label htmlFor="resend-api-key-input" className="text-sm font-semibold text-fg">
            내 Resend API 키
          </label>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <input
                id="resend-api-key-input"
                type={showInput ? "text" : "password"}
                value={input}
                onChange={(event) => {
                  setInput(event.target.value);
                  setStatus("idle");
                }}
                placeholder="re_…"
                autoComplete="off"
                spellCheck={false}
                className="w-full rounded-xl border border-line bg-panel-2 py-2.5 pl-3 pr-10 font-mono text-sm text-fg outline-none transition placeholder:text-fg-4 focus:border-accent focus:ring-2 focus:ring-accent/25"
              />
              <button
                type="button"
                onClick={() => setShowInput((value) => !value)}
                aria-label={showInput ? "키 가리기" : "키 보기"}
                aria-pressed={showInput}
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-fg-3 transition hover:bg-panel hover:text-fg"
              >
                {showInput ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
            <button
              type="button"
              onClick={registerKey}
              disabled={!input.trim()}
              className="shrink-0 rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-45"
            >
              등록하기
            </button>
          </div>
          <div aria-live="polite">
            {status === "empty" ? (
              <p className="mt-2 text-xs font-medium text-danger" role="alert">
                키를 입력해 주세요.
              </p>
            ) : status === "too_short" ? (
              <p className="mt-2 text-xs font-medium text-danger" role="alert">
                키가 너무 짧습니다. Resend에서 복사한 키 전체를 붙여 넣어 주세요.
              </p>
            ) : status === "save_failed" ? (
              <p className="mt-2 text-xs font-medium text-danger" role="alert">
                키를 저장하지 못했습니다. 이 탭에서 다시 시도해 주세요.
              </p>
            ) : input.trim() && !input.trim().startsWith(RESEND_API_KEY_PREFIX) ? (
              <p className="mt-2 text-xs text-fg-3">
                Resend 키는 보통 <code className="font-mono">re_</code>로 시작합니다. 다른
                서비스의 키가 아닌지 확인해 주세요.
              </p>
            ) : (
              <MaskedKeyField apiKey={input} label="입력한 키 미리보기" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
