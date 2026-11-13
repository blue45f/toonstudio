import { Images, KeyRound, Layers, Mail, ShieldCheck, Sparkles } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router-dom";

import {
  isStudioStockImageConfigured,
  loadStudioStockImageAccessKey,
} from "@/domains/creator/public/studio-stock-image-key";
import {
  browserStudioFalSessionStorage,
  isStudioFalConfigured,
  loadStudioFalApiKey,
} from "@/domains/creator/public/studio-lora-fal-key";
import {
  browserNewsletterSessionStorage,
  isNewsletterResendConfigured,
  loadNewsletterResendApiKey,
} from "@/domains/newsletter/public/newsletter-mail-key";
import { useUserAi } from "@/shared/ai/user-ai-store";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/shared/seo/use-document-title";
import { Container } from "@/shared/components/section";

import { AiKeyStatusCard } from "./AiKeyStatusCard";
import { FalKeyConnectCard } from "./FalKeyConnectCard";
import { ResendKeyConnectCard } from "./ResendKeyConnectCard";
import { UnsplashKeyConnectCard } from "./UnsplashKeyConnectCard";
import { summarizeAiKeyStatus, summarizeHubConnections } from "./api-key-hub-model";

function browserSessionStorage(): Storage | null {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * 세션 키 3종(Unsplash·Resend·fal)의 구성 여부를 "010" 형태 스냅샷으로 읽는다.
 * 카드 안에서 키를 연결·해제하면 세션 저장소가 바뀌므로, 포커스·가시성·클릭
 * 시점에 다시 읽어 첫 화면 요약이 카드 상태와 어긋나지 않게 한다.
 * 키 원문은 이 훅을 통과하지 않는다 — 구성 여부만 읽는다.
 */
function readSessionKeyPresenceSnapshot(): string {
  const unsplash = isStudioStockImageConfigured(
    loadStudioStockImageAccessKey(browserSessionStorage()),
  );
  const resend = isNewsletterResendConfigured(
    loadNewsletterResendApiKey(browserNewsletterSessionStorage()),
  );
  const fal = isStudioFalConfigured(loadStudioFalApiKey(browserStudioFalSessionStorage()));
  return `${unsplash ? "1" : "0"}${resend ? "1" : "0"}${fal ? "1" : "0"}`;
}

function subscribeKeyPresence(onStoreChange: () => void): () => void {
  window.addEventListener("focus", onStoreChange);
  window.addEventListener("storage", onStoreChange);
  window.addEventListener("click", onStoreChange);
  document.addEventListener("visibilitychange", onStoreChange);
  return () => {
    window.removeEventListener("focus", onStoreChange);
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener("click", onStoreChange);
    document.removeEventListener("visibilitychange", onStoreChange);
  };
}

function useSessionKeyPresence(): { unsplash: boolean; resend: boolean; fal: boolean } {
  const snapshot = useSyncExternalStore(
    subscribeKeyPresence,
    readSessionKeyPresenceSnapshot,
    () => "000",
  );
  return {
    unsplash: snapshot.charAt(0) === "1",
    resend: snapshot.charAt(1) === "1",
    fal: snapshot.charAt(2) === "1",
  };
}

const KEY_GUIDE = [
  {
    id: "api-key-ai",
    icon: Sparkles,
    name: { ko: "AI API 키", en: "AI API keys" },
    unlocks: {
      ko: "글·이미지·영상 생성을 내 AI 계정으로 실행합니다. 키가 없어도 기본 무료 AI가 먼저 동작하고, 연결하면 모델 선택과 한도가 내 계정 기준으로 넓어집니다.",
      en: "Runs text, image and video generation on your own AI account. The built-in free AI works without a key; connecting one widens model choice and limits to your account.",
    },
  },
  {
    id: "api-key-unsplash",
    icon: Images,
    name: { ko: "Unsplash 키", en: "Unsplash key" },
    unlocks: {
      ko: "소재 찾기에서 실제 사진을 검색해 원고에 넣을 수 있게 합니다. 키가 없으면 사진 검색이 비활성화됩니다.",
      en: "Enables real photo search in the asset finder. Without a key, photo search stays off.",
    },
  },
  {
    id: "api-key-resend",
    icon: Mail,
    name: { ko: "Resend 키", en: "Resend key" },
    unlocks: {
      ko: "작가 뉴스레터를 실제로 발송합니다. 키가 없으면 발송 대신 발송 기록만 남습니다.",
      en: "Sends author newsletters for real. Without a key, sends are only recorded locally.",
    },
  },
  {
    id: "api-key-fal",
    icon: Layers,
    name: { ko: "fal.ai 키", en: "fal.ai key" },
    unlocks: {
      ko: "캐릭터·화풍 LoRA 학습과 생성을 내 fal 계정으로 실행합니다. 키가 없으면 학습·생성이 비활성화됩니다.",
      en: "Runs character and style LoRA training and generation on your fal account. Without a key, training and generation stay off.",
    },
  },
] as const;

/**
 * API 키 허브 — 모든 외부 연동 키를 한 화면에서 관리한다.
 *
 * - AI API 키: 상태만 표시, 편집은 `/settings/ai` 소유 (기존 소유권 유지)
 * - Unsplash Access Key: 인라인 원클릭 연결 플로우
 * - Resend 키: 뉴스레터 실발송 BYOK (연결 테스트 없음 — 실발송으로만 확인)
 * - fal.ai 키: 캐릭터·화풍 LoRA 학습/생성 BYOK (연결 테스트 없음 — 과금 호출이라 부르지 않음)
 * - 키 원문은 절대 렌더·로그하지 않고 마스킹 + 복사만 제공한다
 *
 * 첫 화면은 "고급 도구"임을 밝히고, 내 연결 상태 요약과 키별 용도 안내를 먼저
 * 보여 준다 — 카드마다 들어가 보지 않아도 왜·무엇이 필요한지 읽히게 한다.
 */
export function ApiKeyHubPage() {
  const location = useLocation();
  const keyParams = new URLSearchParams(location.search);
  const selectedKey = KEY_GUIDE.find((item) => item.id === (keyParams.get("service") ?? location.hash.slice(1)))?.id;
  keyParams.delete("service");
  const keyHref = (id: string) => {
    const params = new URLSearchParams(location.search);
    params.set("service", id);
    return { pathname: location.pathname, search: params.toString(), hash: `#${id}` };
  };
  const previousSelection = useRef(selectedKey);
  useEffect(() => {
    if (previousSelection.current === selectedKey) return;
    previousSelection.current = selectedKey;
    const heading = selectedKey ? document.getElementById(selectedKey)?.querySelector("h2") : document.querySelector("main h1, h1");
    if (!(heading instanceof HTMLElement)) return;
    heading.setAttribute("tabindex", "-1");
    heading.focus({ preventScroll: true });
  }, [selectedKey]);
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  useDocumentTitle(ko ? "API 키 허브 · ToonStudio" : "API key hub · ToonStudio");

  const { configuration } = useUserAi();
  const aiSummary = summarizeAiKeyStatus(configuration);
  const sessionPresence = useSessionKeyPresence();
  const connectionStates = {
    ai: aiSummary.configuredConnections > 0,
    unsplash: sessionPresence.unsplash,
    resend: sessionPresence.resend,
    fal: sessionPresence.fal,
  };
  const hubSummary = summarizeHubConnections(connectionStates);
  const stateByGuideId: Readonly<Record<string, boolean>> = {
    "api-key-ai": connectionStates.ai,
    "api-key-unsplash": connectionStates.unsplash,
    "api-key-resend": connectionStates.resend,
    "api-key-fal": connectionStates.fal,
  };

  return (
    <Container size="wide" className="py-8 sm:py-12">
      <Link
        to="/settings/integrations"
        className="inline-flex min-h-11 items-center text-sm font-bold text-accent"
      >
        ← {ko ? "연동 센터" : "Integration center"}
      </Link>

      <header className="mb-7 mt-3" data-site-page-header-size="default">

        <div className="max-w-3xl">
            <p className="eyebrow flex items-center gap-1.5 text-accent">
              <KeyRound size={14} aria-hidden /> API KEY HUB
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2.5">
              <h1 className="text-[length:var(--site-task-heading-size)] font-bold leading-[1.2] tracking-[-0.025em] text-fg">
                {ko ? "API 키 허브" : "API key hub"}
              </h1>
              <span className="inline-flex min-h-7 items-center rounded-full border border-line bg-panel px-2.5 text-xs font-bold text-fg-2">
                {ko ? "고급 도구" : "Advanced tool"}
              </span>
            </div>
            <p className="mt-3 text-sm leading-7 text-fg-2">
              {ko
                ? "필요한 서비스의 키만 연결하세요. 키를 연결한 서비스의 비용은 내 서비스 계정으로 청구됩니다. 키는 마스킹해서 표시합니다."
                : "Connect only the services you need. Connected services bill your own service account. Stored keys are shown masked."}
            </p>
        </div>
      </header>

      <section
        className="mb-6 rounded-2xl border border-line bg-panel/50 p-4"
        hidden={Boolean(selectedKey)}
        aria-label={ko ? "내 연결 상태" : "My connection status"}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-bold text-fg">{ko ? "내 연결 상태" : "My connection status"}</h2>
          <p className="text-sm font-bold text-fg" role="status">
            {ko
              ? `${hubSummary.totalCount}개 중 ${hubSummary.configuredCount}개 연결됨`
              : `${hubSummary.configuredCount} of ${hubSummary.totalCount} connected`}
          </p>
        </div>
        <ul className="mt-3 flex flex-wrap gap-2">
          {KEY_GUIDE.map((item) => {
            const connected = stateByGuideId[item.id];
            return (
              <li key={item.id}>
                <Link
                  to={keyHref(item.id)} state={location.state}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full border border-line bg-card px-3.5 text-sm font-semibold text-fg-2 transition-colors hover:border-accent/50 hover:text-fg"
                >
                  <span
                    aria-hidden
                    className={`size-2 shrink-0 rounded-full ${connected ? "bg-good" : "bg-fg-3/40"}`}
                  />
                  {ko ? item.name.ko : item.name.en}
                  <span className={connected ? "text-good" : "text-fg-3"}>
                    {connected ? (ko ? "연결됨" : "Connected") : ko ? "미연결" : "Not connected"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-5 text-fg-3">
          {hubSummary.noneConfigured
            ? ko
              ? "아직 연결된 키가 없어요. 필요한 기능의 키만 골라 아래 카드에서 연결하면 됩니다 — 전부 연결할 필요는 없습니다."
              : "No keys connected yet. Connect only the keys for features you need — there is no need to connect them all."
            : ko
              ? "연결한 서비스의 기능은 각 기능 화면에서 바로 사용할 수 있어요. 칩을 누르면 해당 키 카드로 이동합니다."
              : "Connected services are available right away in their feature screens. Select a chip to jump to its key card."}
        </p>
      </section>

      {selectedKey ? <Link to={{ pathname: location.pathname, search: keyParams.toString(), hash: "" }} state={location.state} className="mb-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-sm font-bold text-accent">{ko ? "다른 서비스 선택" : "Choose another service"}</Link> : null}
      <details className="mb-4 rounded-xl border border-line bg-panel px-4">
        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-bold text-fg-2">{ko ? "키별 용도·보관·전송 안내" : "Key use, storage and transmission"}</summary>
      <section
        className="mb-6 rounded-2xl border border-line bg-panel/50 p-4 sm:p-5"
        aria-label={ko ? "키별 용도 안내" : "What each key unlocks"}
      >
        <h2 className="font-bold text-fg">
          {ko ? "어떤 키가 무슨 기능을 켜나요?" : "What does each key unlock?"}
        </h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {KEY_GUIDE.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.id} className="rounded-xl border border-line bg-card/60 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-accent-soft text-accent">
                    <Icon size={16} aria-hidden />
                  </span>
                  <h3 className="text-sm font-bold text-fg">{ko ? item.name.ko : item.name.en}</h3>
                </div>
                <p className="mt-2.5 text-sm leading-6 text-fg-2">
                  {ko ? item.unlocks.ko : item.unlocks.en}
                </p>
                <Link
                  to={keyHref(item.id)} state={location.state}
                  className="mt-2 inline-flex min-h-11 items-center text-sm font-bold text-accent"
                >
                  {ko ? "키 카드로 이동" : "Go to the key card"}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section
        className="mb-6 rounded-2xl border border-line bg-panel/50 p-4"
        aria-label={ko ? "보안 안내" : "Security notice"}
      >
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <ShieldCheck size={18} aria-hidden />
          </span>
          <div>
            <h2 className="font-bold text-fg">{ko ? "키는 내 브라우저에만" : "Keys stay in your browser"}</h2>
            <p className="mt-1 text-sm leading-6 text-fg-2">
              {ko
                ? "AI 키는 메모리 전용 또는 암호화 보관함에, Unsplash·Resend·fal 키는 현재 탭 세션에만 저장됩니다. 키가 서버에 보관되지는 않지만, Resend 키는 뉴스레터 발송 순간에만 서버 릴레이로 한 번 전달되고, fal 키는 학습·생성 순간에 브라우저에서 fal로 직접 전송됩니다. 키를 다른 사람과 공유하지 마세요."
                : "AI keys live in memory or an encrypted vault; the Unsplash, Resend and fal keys live in this tab's session only. Keys are never stored on ToonStudio servers, though the Resend key is passed to the sending relay once, at the moment you send a newsletter, and the fal key is sent from your browser directly to fal when you train or generate. Never share your keys."}
            </p>
          </div>
        </div>
      </section>

        <figure className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-line">
          <img
            src="/brand/hero-20261009/api-keys-hero.webp"
            srcSet="/brand/hero-20261009/api-keys-hero-960.webp 960w, /brand/hero-20261009/api-keys-hero.webp 1680w"
            sizes="(max-width: 1280px) 100vw, 1216px"
            width={1680}
            height={560}
            alt="어두운 보드 위에 놓인 황금 열쇠 고리에서 각 서비스 아이콘으로 빛줄기가 이어지는 모습"
            fetchPriority="high"
            decoding="async"
            className="block aspect-[3/1] w-full object-cover motion-safe:animate-fade-up"
          />
          <figcaption className="absolute bottom-3 left-3 rounded-full bg-black/45 px-2.5 py-1 text-[0.65rem] font-semibold text-white/90 backdrop-blur-sm">
            {ko ? "브랜드 콘셉트 아트 · 실제 화면이 아닙니다" : "Brand concept art · not a product screen"}
          </figcaption>
        </figure>
      </details>
      <section
        className="grid max-w-3xl gap-4"
        aria-label={ko ? "연동 키 목록" : "Integration keys"}
      >
        <div hidden={selectedKey !== "api-key-ai"}><AiKeyStatusCard /></div>
        <div hidden={selectedKey !== "api-key-unsplash"}><UnsplashKeyConnectCard /></div>
        <div hidden={selectedKey !== "api-key-resend"}><ResendKeyConnectCard /></div>
        <div hidden={selectedKey !== "api-key-fal"}><FalKeyConnectCard /></div>
      </section>

      <section
        className="mt-6 rounded-2xl border border-dashed border-line bg-card/50 p-6"
        aria-label={ko ? "추가 연동 안내" : "More integrations"}
      >
        <h2 className="font-bold text-fg">
          {ko ? "더 많은 연동이 필요하신가요?" : "Need more integrations?"}
        </h2>
        <p className="mt-2 text-sm leading-7 text-fg-2">
          {ko
            ? "저장소·업무·알림·게시·결제 공급자는 연동 센터에서 확인하세요. 키가 필요한 공급자는 여기에 카드가 추가됩니다."
            : "See storage, work, notification, publishing and payment providers in the integration center. Providers that need keys will appear here as cards."}
        </p>
        <Link
          to="/settings/integrations"
          className="mt-4 inline-flex min-h-11 items-center rounded-xl border border-line px-4 py-2 text-sm font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg"
        >
          {ko ? "연동 센터 열기" : "Open integration center"}
        </Link>
      </section>
    </Container>
  );
}
