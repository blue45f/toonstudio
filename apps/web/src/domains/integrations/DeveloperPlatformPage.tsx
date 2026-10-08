import { Braces, Code2, Download, KeyRound, Rocket, Webhook } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import { getApiErrorMessage } from "@/platform/api";
import { useI18n } from "@/shared/lib/i18n";
import { useDocumentTitle } from "@/shared/seo/use-document-title";

import { IntegrationError, IntegrationLoading, IntegrationPage } from "./IntegrationUi";
import { integrationPlatformClient } from "./integration-platform-client";
import { downloadIntegrationJson } from "./integration-platform-storage";
import type { DeveloperManifestResponse } from "./integration-platform-types";

function TokenList({ values }: { values: readonly string[] }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {values.map((value) => (
        <code key={value} className="rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg-2">{value}</code>
      ))}
    </div>
  );
}

const START_STEPS = [
  {
    ko: ["무슨 API인가", "공개 카탈로그 조회와 사용자 승인 프로젝트 기능을 REST API로 호출하고, 변경 알림은 서명 Webhook으로, 도구 연결은 MCP로 받습니다."],
    en: ["What API is it", "Call the public catalog and user-authorized project features over REST, receive change notifications through signed webhooks, and connect tools through MCP."],
  },
  {
    ko: ["어떤 권한인가", "접근 범위는 OAuth scope가 정합니다. API 키 발급·OAuth 앱 심사·MCP 외부 공개는 운영자 활성화가 필요한 단계라, 그 전까지는 이 계약 공개가 시작점입니다."],
    en: ["Which grant applies", "OAuth scopes define the access boundary. API key issuance, OAuth app review and public MCP exposure are operator activation steps, so this published contract is the starting point until then."],
  },
  {
    ko: ["어디서 시작하나", "첫 요청으로 계약을 불러와 버전을 고정하고, 아래 본문에서 scope·이벤트·액션을 확인하세요. 공급자별 연결 상태는 연동 센터에서 봅니다."],
    en: ["Where to start", "Load the contract with the first request, pin its version, then check the scopes, events and actions below. Per-provider connection state lives in the integration center."],
  },
] as const;

const START_LINKS = [
  { href: "/about/technology/references", ko: "기술 참고 자료", en: "Engineering references" },
  { href: "/about/technology/playbook", ko: "엔지니어링 플레이북", en: "Engineering playbook" },
  { href: "/settings/api-keys", ko: "API 키 화면", en: "API key settings" },
  { href: "/settings/integrations", ko: "연동 센터", en: "Integration center" },
] as const;

/**
 * 계약 본문(Manifest 응답)이 도착하기 전에도 읽히는 진입 구도.
 * 단계 설명과 첫 요청은 서버 상태와 무관한 정적 사실만 적는다 — 실제 호출 주소와
 * 활성화 단계의 경계는 이 화면이 이미 공개하고 있는 계약 그대로다.
 */
function DeveloperStartGuide({ ko }: { ko: boolean }) {
  return (
    <section aria-labelledby="developer-start-title" className="mb-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-line bg-card p-5">
          <h2 id="developer-start-title" className="flex items-center gap-2 text-lg font-bold text-fg">
            <Rocket size={18} aria-hidden /> {ko ? "시작하기" : "Start here"}
          </h2>
          <ol className="mt-4 space-y-4">
            {START_STEPS.map((step, index) => {
              const [title, body] = ko ? step.ko : step.en;
              return (
                <li key={title} className="flex gap-3">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-bold text-accent" aria-hidden="true">{index + 1}</span>
                  <div>
                    <h3 className="text-sm font-bold text-fg">{title}</h3>
                    <p className="mt-1 text-sm leading-6 text-fg-2">{body}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
        <figure className="flex flex-col overflow-hidden rounded-2xl border border-line bg-card">
          <figcaption className="flex items-center justify-between border-b border-line px-5 py-3">
            <span className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-fg-2">{ko ? "첫 요청 · 계약 불러오기" : "First request · load the contract"}</span>
            <Code2 size={14} aria-hidden />
          </figcaption>
          <div className="flex flex-1 flex-col justify-center p-5">
            <pre className="overflow-x-auto rounded-xl border border-line bg-canvas p-4 text-xs leading-6 text-fg"><code>GET /api/integrations/developer-manifest</code></pre>
            <p className="mt-3 text-sm leading-6 text-fg-2">
              {ko
                ? "이 화면이 실제로 호출하는 주소입니다. 응답의 schema·scopes·events·actions·webhook·safety가 아래 본문 그대로 그려집니다."
                : "This is the exact endpoint this page calls. Its schema, scopes, events, actions, webhook and safety fields are rendered verbatim below."}
            </p>
          </div>
        </figure>
      </div>
      <nav className="mt-4 flex flex-wrap gap-2" aria-label={ko ? "개발자 자료와 설정" : "Developer resources and settings"}>
        {START_LINKS.map((link) => (
          <Link key={link.href} to={link.href} className="inline-flex min-h-10 items-center rounded-xl border border-line bg-card px-3 text-sm font-semibold text-fg hover:text-accent">
            {ko ? link.ko : link.en}
          </Link>
        ))}
      </nav>
      <p className="mt-3 text-xs leading-5 text-fg-3">
        {ko
          ? "창작 기능에 연결하는 외부 서비스 키는 설정의 API 키 화면에서 관리합니다. 이 페이지의 개발자 계약과는 별개의 키입니다."
          : "External service keys connected to creation features are managed on the API key settings screen — separate from the developer contract on this page."}
      </p>
    </section>
  );
}

export function DeveloperPlatformPage() {
  const lang = useI18n((state) => state.lang);
  const ko = lang.startsWith("ko");
  useDocumentTitle(ko ? "개발자 플랫폼 · ToonStudio" : "Developer platform · ToonStudio");
  const [manifest, setManifest] = useState<DeveloperManifestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadCount, setReloadCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void integrationPlatformClient.developerManifest()
      .then((response) => { if (!cancelled) { setManifest(response); setError(null); } })
      .catch(async (reason: unknown) => {
        if (!cancelled) setError(await getApiErrorMessage(reason, "개발자 계약을 불러오지 못했습니다."));
      });
    return () => { cancelled = true; };
  }, [reloadCount]);

  const retry = () => {
    setError(null);
    setReloadCount((count) => count + 1);
  };

  return (
    <IntegrationPage
      eyebrow={ko ? "API · Webhook · MCP" : "API · Webhook · MCP"}
      title={ko ? "개발자 플랫폼" : "Developer platform"}
      description={ko
        ? "공개 카탈로그와 사용자 승인 프로젝트 기능을 REST API·서명 Webhook·MCP 도구로 확장하기 위한 권한 계약입니다. 원본 파일 접근은 별도 강한 권한으로 분리됩니다."
        : "A scoped contract for public catalog, user-authorized project APIs, signed webhooks and MCP tools. Raw project files require a separate strong grant."}
      art={{ kind: "ai", caption: ko ? "브랜드 콘셉트 아트 · 실제 화면이 아닙니다" : "Brand concept art · not a product screen" }}
    >
      <DeveloperStartGuide ko={ko} />
      {!manifest && !error ? <IntegrationLoading message={ko ? "개발자 계약을 불러오고 있습니다." : "Loading developer contract."} /> : null}
      {error ? <IntegrationError message={error} onRetry={retry} /> : null}
      {manifest ? (
        <>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-card p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-fg-3">{manifest.schema}</p>
              <p className="mt-1 text-sm text-fg-2">{ko ? `${manifest.providers}개 공급자 계약이 동일한 안전 경계를 사용합니다.` : `${manifest.providers} providers share the same safety boundary.`}</p>
            </div>
            <button type="button" onClick={() => downloadIntegrationJson("toonstudio-developer-manifest.json", manifest)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-line px-3 text-sm font-semibold text-fg">
              <Download size={15} aria-hidden /> {ko ? "Manifest 다운로드" : "Download manifest"}
            </button>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><KeyRound size={18} aria-hidden /> OAuth scopes</h2>
              <TokenList values={manifest.scopes} />
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Webhook size={18} aria-hidden /> Webhook contract</h2>
              <figure className="mt-3 overflow-hidden rounded-xl border border-line bg-canvas">
                <figcaption className="flex items-center justify-between border-b border-line px-4 py-2.5">
                  <span className="text-[0.64rem] font-bold uppercase tracking-[0.15em] text-fg-2">{ko ? "웹훅 계약 JSON" : "Webhook contract JSON"}</span>
                  <Code2 size={14} aria-hidden />
                </figcaption>
                <pre className="overflow-x-auto p-4 text-xs leading-6 text-fg-2"><code>{JSON.stringify(manifest.webhook, null, 2)}</code></pre>
              </figure>
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Braces size={18} aria-hidden /> {ko ? "이벤트" : "Events"}</h2>
              <TokenList values={manifest.events} />
            </section>
            <section className="rounded-2xl border border-line bg-card p-5">
              <h2 className="flex items-center gap-2 text-lg font-bold text-fg"><Braces size={18} aria-hidden /> {ko ? "액션" : "Actions"}</h2>
              <TokenList values={manifest.actions} />
            </section>
          </div>

          <section className="mt-5 rounded-2xl border border-line bg-panel/50 p-5">
            <h2 className="font-bold text-fg">{ko ? "기본 안전 규칙" : "Default safety rules"}</h2>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(manifest.safety).map(([key, value]) => (
                <div key={key} className="rounded-xl border border-line bg-card p-3">
                  <dt className="break-all text-xs text-fg-3">{key}</dt>
                  <dd className={`mt-1 font-bold ${value ? "text-good" : "text-fg"}`}>{String(value)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-4 text-sm leading-6 text-fg-2">
              {ko
                ? "API 키 발급·OAuth 앱 심사·MCP 외부 공개는 운영자 활성화가 필요한 별도 단계입니다. 이 화면은 현재 구현된 범위와 권한 계약을 숨기지 않고 공개합니다."
                : "API key issuance, OAuth app review and public MCP exposure remain explicit operator activation steps. This surface exposes the implemented contract without implying activation."}
            </p>
          </section>
        </>
      ) : null}
    </IntegrationPage>
  );
}
