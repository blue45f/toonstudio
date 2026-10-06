/**
 * fal.ai 키 연결 카드 — 캐릭터·화풍 LoRA 학습/생성용 BYOK 키를 등록한다.
 *
 * Unsplash 카드와 다른 점: 연결 테스트를 하지 않는다. 등록 시점에 해볼 수 있는
 * 무과금 검증은 형식뿐이고, 학습·생성 제출은 사용자 본인 fal 계정에 과금이
 * 발생하므로 테스트로 호출하지 않는다. 대신 그 사실을 화면에 그대로 적는다 —
 * 키는 첫 학습/생성에서 확인된다.
 *
 * 키 저장은 창작 도메인의 공개 경계(`creator/public/studio-lora-fal-key`)를
 * 쓴다. 현재 탭의 sessionStorage에만 보관하고, 학습·생성 순간에 브라우저에서
 * fal로 직접 전송한다(ToonStudio 서버를 거치지 않는다). fal 키의 접두사 형식은
 * 공식 문서로 확인되지 않아 접두사 힌트는 단정하지 않는다.
 */
import { CheckCircle2, ExternalLink, Layers, PlugZap } from "lucide-react";
import { useEffect, useState } from "react";

import {
  browserStudioFalSessionStorage,
  isStudioFalConfigured,
  loadStudioFalApiKey,
  saveStudioFalApiKey,
  STUDIO_FAL_API_KEYS_URL,
} from "@/domains/creator/public/studio-lora-fal-key";

import { maskApiKey, validateApiKeyFormat } from "./api-key-hub-model";
import { StoredKeyRow } from "./MaskedKeyField";

const INPUT =
  "min-h-11 w-full rounded-xl border border-line bg-canvas px-3 py-2 font-mono text-sm text-fg outline-none transition-colors placeholder:font-sans placeholder:text-fg-3 focus:border-accent";
const BUTTON =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg transition-colors hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const PRIMARY = `${BUTTON} border-accent bg-accent text-on-accent hover:bg-accent/90`;

type Phase = "idle" | "success" | "error";

export function FalKeyConnectCard() {
  const [storedKey, setStoredKey] = useState(() =>
    loadStudioFalApiKey(browserStudioFalSessionStorage()),
  );
  const [draft, setDraft] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [message, setMessage] = useState("");

  const configured = isStudioFalConfigured(storedKey);
  const formatIssue = validateApiKeyFormat(draft);

  useEffect(() => {
    if (phase !== "success") return;
    const timer = window.setTimeout(() => setPhase("idle"), 3000);
    return () => window.clearTimeout(timer);
  }, [phase]);

  async function copyKey(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(storedKey);
      return true;
    } catch {
      return false;
    }
  }

  function disconnect() {
    if (!saveStudioFalApiKey(browserStudioFalSessionStorage(), "")) {
      setPhase("error");
      setMessage("저장된 키를 지우지 못했습니다. 브라우저 저장소 상태를 확인하고 다시 시도하세요.");
      return;
    }
    setStoredKey("");
    setDraft("");
    setPhase("idle");
    setMessage("연결을 해제했습니다. 이 탭의 저장된 키를 지웠습니다.");
  }

  function connect() {
    const issue = validateApiKeyFormat(draft);
    if (issue) {
      setPhase("error");
      setMessage(
        issue === "empty"
          ? "fal.ai API 키를 입력하세요."
          : "키가 너무 짧습니다. fal 대시보드에서 복사한 키 전체를 붙여넣으세요.",
      );
      return;
    }
    const candidate = draft.trim();
    if (!saveStudioFalApiKey(browserStudioFalSessionStorage(), candidate)) {
      setPhase("error");
      setMessage("이 탭에 키를 저장하지 못했습니다. 시크릿 모드이거나 저장 공간이 부족할 수 있어요.");
      return;
    }
    setStoredKey(candidate);
    setDraft("");
    setPhase("success");
    setMessage(
      "등록했습니다. 연결 테스트는 하지 않으며(학습·생성은 과금 호출이라 테스트로 부르지 않습니다), 첫 학습에서 키가 확인됩니다.",
    );
  }

  return (
    <article
      id="api-key-fal"
      className="flex min-h-64 scroll-mt-24 flex-col rounded-2xl border border-line bg-card p-5 shadow-sm"
      aria-labelledby="fal-key-title"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Layers size={20} aria-hidden />
          </span>
          <div>
            <h2 id="fal-key-title" className="text-lg font-bold text-fg">
              캐릭터·화풍 학습 (LoRA)
            </h2>
            <p className="text-xs text-fg-3">fal.ai · FLUX LoRA 학습·생성</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
            configured ? "bg-good/10 text-good" : "bg-fg-3/10 text-fg-3"
          }`}
        >
          {configured ? <CheckCircle2 size={13} aria-hidden /> : null}
          {configured ? "연결됨" : "미설정"}
        </span>
      </div>

      <p className="mt-3 text-sm leading-6 text-fg-2">
        fal.ai에서 발급한 내 API 키를 등록하면 스튜디오의 캐릭터 도구에서 참조 이미지로 LoRA를
        학습하고, 학습된 모델로 생성할 수 있어요. 학습·생성 요금은 본인의 fal 계정에 청구됩니다.{" "}
        <a
          href={STUDIO_FAL_API_KEYS_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 font-medium text-accent hover:underline"
        >
          키 발급받기 <ExternalLink size={11} aria-hidden />
        </a>
      </p>

      <div className="mt-4 flex-1">
        {configured ? (
          <StoredKeyRow
            label="fal.ai API 키"
            masked={maskApiKey(storedKey)}
            meta="현재 탭 세션에만 저장 · 학습/생성 때 브라우저에서 fal로 직접 전송"
            onCopy={copyKey}
            onRemove={disconnect}
          />
        ) : (
          <div className="flex flex-col gap-2">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-fg-2">API 키 붙여넣기</span>
              <input
                type="password"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value);
                  if (phase === "error") {
                    setPhase("idle");
                    setMessage("");
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") connect();
                }}
                placeholder="fal.ai API 키"
                className={INPUT}
                spellCheck={false}
                autoComplete="off"
                aria-describedby="fal-key-hint"
              />
            </label>
            <p id="fal-key-hint" className="text-[0.7rem] leading-5 text-fg-3">
              등록만으로는 아무것도 호출하지 않습니다. 키는 학습·생성을 직접 실행할 때만 쓰입니다.
            </p>
          </div>
        )}
      </div>

      {message ? (
        <p
          role={phase === "error" ? "alert" : "status"}
          className={`mt-3 text-sm leading-6 ${
            phase === "error" ? "text-bad" : phase === "success" ? "text-good" : "text-fg-2"
          }`}
        >
          {phase === "success" ? <CheckCircle2 size={14} className="mr-1 inline" aria-hidden /> : null}
          {message}
        </p>
      ) : null}

      <div className="mt-auto pt-4">
        {!configured ? (
          <button
            type="button"
            onClick={connect}
            disabled={formatIssue !== null}
            className={PRIMARY}
          >
            <PlugZap size={16} aria-hidden />
            등록하기
          </button>
        ) : null}
      </div>
    </article>
  );
}
