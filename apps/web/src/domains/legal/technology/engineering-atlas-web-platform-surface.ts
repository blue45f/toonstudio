import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/** 기술 도감 · web-platform · 화면 표면 세 장(View Transitions·현대 CSS, Speculation Rules, Intl.Segmenter). 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. */
export const ENGINEERING_ATLAS_WEB_PLATFORM_SURFACE: readonly EngineeringAtlasEntry[] = [
  {
    id: "view-transitions-modern-css",
    category: "web-platform",
    name: "View Transitions",
    title: t("한 군데에만 켠 화면 전환과 현대 CSS", "One screen transition and modern CSS"),
    status: "live",
    tagline: t(
      "작품 상세에서 리더로 가는 한 곳에만 전환 효과를 켜고, 나머지는 선언형 CSS로 풉니다.",
      "A transition only from title page to reader; everything else is solved with declarative CSS.",
    ),
    background: [
      t(
        "웹앱에서 화면이 바뀔 때 예전에는 자바스크립트 애니메이션 라이브러리로 두 화면을 겹쳐 그려야 했습니다. View Transitions 는 브라우저가 바뀌기 전 화면을 사진처럼 찍어 두었다가 새 화면과 부드럽게 섞어 주는 기능입니다. ToonStudio 는 작품 상세의 '첫 화부터 읽기' 링크 한 곳에만 이를 켜서, 160ms 동안 사라지고 200ms 동안 나타나는 크로스페이드를 입힙니다.",
        "In a web app, changing screens used to mean overlaying two views with a JavaScript animation library. View Transitions lets the browser snapshot the screen before the change and blend it smoothly into the new one. ToonStudio turns it on at a single place, the Start from episode 1 link on the title page, adding a crossfade that fades out over 160 ms and in over 200 ms.",
      ),
      t(
        "동작은 두 겹의 안전장치 위에 있습니다. react-router 의 Link 가 viewTransition 속성을 받아 내부에서 document.startViewTransition 을 부르고(앱 코드가 직접 부르지 않습니다), 미지원 브라우저는 평범하게 이동합니다. CSS 는 prefers-reduced-motion: no-preference 일 때만 애니메이션을 주고, reduce 면 animation: none 으로 즉시 전환합니다. 설정의 실험 기능에서 끌 수도 있습니다.",
        "It rests on two layers of safety. The react-router Link takes a viewTransition prop and calls document.startViewTransition itself (app code never calls it), and unsupported browsers navigate normally. The CSS animates only under prefers-reduced-motion: no-preference and uses animation: none under reduce for an instant switch. It can also be turned off in the experimental settings.",
      ),
      t(
        "같은 선언형 정신이 다른 현대 CSS 에도 있습니다. 컨테이너 쿼리는 화면 폭이 아니라 패널 폭에 맞춰 격자를 바꾸고(에셋 작업공간이 72rem 이상이면 3열), :has() 는 모바일 편집 독이 접혔는지에 따라 캔버스 하단 여백을 계산합니다. content-visibility: auto 는 화면 밖 페이지 카드의 렌더를 미루고, @property 는 도넛 차트 각도를 부드럽게 움직이며, @layer 는 스타일 우선순위 충돌을 막습니다.",
        "The same declarative spirit runs through other modern CSS. Container queries change the grid by panel width rather than screen width (three columns when the asset workspace is 72rem or wider), and :has() computes the canvas bottom inset by whether the mobile editing dock is collapsed. content-visibility: auto postpones rendering of off-screen page cards, @property animates the donut chart angle smoothly, and @layer prevents style-priority clashes.",
      ),
      t(
        "스크롤 구동 애니메이션은 지원할 때만 이미 보이는 기본 상태 위에 진입 연출을 얹습니다(@supports와 reduced-motion 이중 가드, forwards 만 사용해 빈 화면 사고를 막음). 쓰지 않는 기능도 분명히 합니다. 요소 단위 전환(view-transition-name), Popover API, Anchor Positioning, field-sizing, @starting-style 은 코드에서 쓰이지 않고 설정 화면의 지원 여부 표시에만 일부 나옵니다. 브라우저별 지원 범위는 코드로 알 수 없으니 MDN·web.dev 의 Baseline 표시를 보세요.",
        "Scroll-driven animation adds an entry effect on top of an already visible default, only where supported (a double guard of @supports and reduced-motion, using forwards only to avoid blank-screen accidents). The unused features are stated plainly too: element-level transitions (view-transition-name), the Popover API, Anchor Positioning, field-sizing and @starting-style are not used in code and some appear only as support indicators in the settings. Per-browser support cannot be read from code, so see the Baseline marks on MDN and web.dev.",
      ),
    ],
    keyPoints: [
      t("전환 효과는 '첫 화부터 읽기' 한 곳만", "The transition is on one link only"),
      t("미지원이거나 동작 줄이기면 즉시 이동", "Unsupported or reduced motion: switch instantly"),
      t("컨테이너 쿼리·:has() 로 선언형 레이아웃", "Declarative layout via container queries and :has()"),
      t("스크롤 연동은 @supports + 동작 줄이기 이중 가드", "Scroll effects sit behind @supports and reduced-motion"),
    ],
    diagram: {
      id: "view-transitions-modern-css-diagram",
      kind: "graph",
      title: t("점진적 강화로 입히는 화면 전환", "A transition added by progressive enhancement"),
      caption: t(
        "지원도 되고 동작 줄이기도 꺼져 있을 때만 크로스페이드를 입히고, 아니면 곧바로 이동합니다.",
        "The crossfade runs only when supported and reduced motion is off; otherwise the page just changes.",
      ),
      alt: t(
        "첫 화부터 읽기 링크를 누르면 먼저 브라우저가 전환 효과를 지원하는지 확인하고, 지원하면 사용자가 동작 줄이기를 켰는지 확인합니다. 둘 다 통과하면 160ms 사라지고 200ms 나타나는 크로스페이드로 리더가 열리고, 하나라도 걸리면 효과 없이 곧바로 리더가 열립니다.",
        "Clicking Start from episode 1 first checks that the browser supports the transition, then whether the user turned on reduced motion. If both pass, the reader opens with a 160 ms fade-out and 200 ms fade-in; if either fails, the reader opens at once without the effect.",
      ),
      nodes: [
        { id: "click", label: t("첫 화부터 읽기", "Start reading"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "supported", label: t("전환 지원?", "Supported?"), tone: "neutral", shape: "diamond", at: [1, 0] },
        { id: "reduced", label: t("동작 줄이기?", "Reduce motion?"), tone: "neutral", shape: "diamond", at: [2, 0] },
        {
          id: "fade",
          label: t("크로스페이드", "Crossfade"),
          sub: t("160ms 사라짐 · 200ms 나타남", "160 ms out, 200 ms in"),
          tone: "good",
          at: [3, 0],
        },
        { id: "reader", label: t("리더 화면", "Reader"), tone: "good", shape: "pill", at: [4, 0] },
        { id: "instant", label: t("즉시 이동", "Switch at once"), sub: t("효과 없이", "no effect"), tone: "local", at: [2, 1] },
      ],
      edges: [
        { from: "click", to: "supported" },
        { from: "supported", to: "reduced", label: t("예", "yes") },
        { from: "reduced", to: "fade", label: t("아니오", "no") },
        { from: "fade", to: "reader" },
        { from: "supported", to: "instant", label: t("아니오", "no"), style: "dashed" },
        { from: "reduced", to: "instant", label: t("예", "yes"), style: "dashed" },
        { from: "instant", to: "reader", style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("작품 상세 → 리더 (첫 화부터 읽기)", "Title page to reader (Start from episode 1)"),
        role: t(
          "링크 한 곳에 viewTransition 을 켜 크로스페이드를 입히고, 동작 줄이기에서는 애니메이션 없이 즉시 전환합니다.",
          "Turns on viewTransition at one link for a crossfade, and switches instantly with no animation under reduced motion.",
        ),
        paths: [
          "apps/web/src/domains/catalog/TitleDetailHero.tsx",
          "apps/web/src/shared/navigation/router-link.tsx",
          "apps/web/src/app/styles/globals.css",
          "apps/web/src/shared/lib/nextgen-lab-settings.ts",
        ],
      },
      {
        feature: t("스튜디오 에셋 작업공간 · 옵션 패널", "Studio asset workspace and option panels"),
        role: t(
          "컨테이너 쿼리(studio-asset-workspace, studio-draw-options)로 패널 폭에 맞춰 격자 열 수를 바꿉니다.",
          "Container queries (studio-asset-workspace, studio-draw-options) change the grid columns to fit the panel width.",
        ),
        paths: ["apps/web/src/app/styles/globals.css"],
        route: "/studio",
      },
      {
        feature: t("모바일 편집 독 · 떠 있는 카드", "Mobile editing dock and floating cards"),
        role: t(
          ":has() 로 독이 접혔는지 펼쳐졌는지 읽어 캔버스 하단 여백과 떠 있는 카드의 위치를 계산합니다.",
          "Reads with :has() whether the dock is collapsed or expanded to compute the canvas bottom inset and floating-card position.",
        ),
        paths: ["apps/web/src/app/styles/globals.css"],
      },
      {
        feature: t("페이지 정리 격자 · 스크롤 리빌", "Page organizer grid and scroll reveal"),
        role: t(
          "content-visibility: auto 로 화면 밖 카드의 렌더를 미루고, 스크롤 구동 애니메이션은 @supports 안에서만 진입 연출을 얹습니다.",
          "content-visibility: auto defers rendering of off-screen cards, and scroll-driven animation adds entry motion only inside @supports.",
        ),
        paths: [
          "apps/web/src/domains/creator/StudioPageOrganizerGrid.tsx",
          "apps/web/src/app/styles/globals.css",
        ],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("전환을 입히되 없어도 되는 구조", "A transition that is optional by design"),
        language: "ts",
        ...sampleSource([
          ["export function withTransition(update: () => void): void {"],
          ['  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;'],
          ['  if (reduce || typeof document.startViewTransition !== "function") {'],
          ["    update();", "연출 없이 즉시 바꾼다", "switch at once, with no effect"],
          ["    return;"],
          ["  }"],
          ["  document.startViewTransition(update);", "브라우저가 전후 화면을 섞어 준다", "the browser blends the before and after views"],
          ["}"],
        ]),
        explain: t(
          "실제 앱은 이 코드를 직접 쓰지 않고 react-router Link 의 viewTransition 속성에 맡깁니다. 라우터가 내부에서 같은 일을 하며, 동작 줄이기는 CSS 쪽에서 처리합니다. 구조(없어도 동작)를 보여 주는 교육용 예제입니다.",
          "The real app does not run this code; it leaves it to the react-router Link viewTransition prop, which does the same inside, and reduced motion is handled on the CSS side. This teaching sample shows the structure: it works even without the feature.",
        ),
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("동작 줄이기와 스크롤 연동의 CSS 가드", "CSS guards for reduced motion and scroll-driven effects"),
        language: "css",
        ...sampleSource(
          [
            ["@media (prefers-reduced-motion: no-preference) {", "동작 줄이기를 켜지 않은 사용자에게만 전환 연출을 준다", "give the transition only to users who did not ask for reduced motion"],
            ["  ::view-transition-old(root) { animation: nextgen-vt-fade-out 160ms ease-out; }"],
            ["  ::view-transition-new(root) { animation: nextgen-vt-fade-in 200ms ease-in; }"],
            ["}"],
            [""],
            [".reveal-children > * { opacity: 1; }", "기본 상태는 항상 보인다", "the default state is always visible"],
            ["@supports (animation-timeline: view()) {", "지원할 때만 연출을 얹는다", "add the effect only where supported"],
            ["  @media (prefers-reduced-motion: no-preference) {"],
            ["    .reveal-children > * {"],
            ["      animation: reveal-rise linear forwards;", "both/backwards 는 금지: 진입 전 투명 고정을 막는다", "no both/backwards: avoids staying transparent before entry"],
            ["      animation-timeline: view();"],
            ["      animation-range: entry 5% entry 60%;"],
            ["    }"],
            ["  }"],
            ["}"],
          ],
          "/*",
        ),
        explain: t(
          "globals.css 의 View Transitions 규칙과 스크롤 리빌 규칙을 합쳐 줄였습니다. 핵심은 연출이 없어도 내용이 항상 보이는 기본 상태를 먼저 두고, 지원과 동작 허용이 확인될 때만 그 위에 얹는 것입니다.",
          "Condensed from the View Transitions and scroll-reveal rules in globals.css. The point is to keep a default state where content is always visible and add the effect only when support and motion permission are both confirmed.",
        ),
        source: "apps/web/src/app/styles/globals.css",
      },
    ],
    links: [
      {
        title: "MDN · View Transition API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API",
        kind: "docs",
        note: t("개념과 브라우저 호환성 표", "Concepts and the browser compatibility table"),
      },
      {
        title: "Chrome for Developers · View Transitions",
        url: "https://developer.chrome.com/docs/web-platform/view-transitions",
        kind: "guide",
      },
      {
        title: "MDN · CSS container queries",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries",
        kind: "docs",
      },
      {
        title: "MDN · :has()",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Selectors/:has",
        kind: "docs",
      },
      {
        title: "MDN · CSS scroll-driven animations",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Scroll-driven_animations",
        kind: "docs",
      },
      {
        title: "MDN · content-visibility",
        url: "https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/content-visibility",
        kind: "docs",
      },
    ],
    chapterIds: ["nextgen-web-experiments", "performance"],
    talk: {
      pitch: t(
        "화면 전환 효과를 자바스크립트 애니메이션 라이브러리 없이 브라우저가 사진을 찍어 섞어 주는 기능으로 처리합니다. 다만 모든 곳에 켜지 않고 첫 화부터 읽기 한 곳에만, 동작 줄이기 설정을 존중하는 점진적 강화로 넣었습니다. 레이아웃과 상태 스타일은 컨테이너 쿼리와 :has() 같은 선언형 CSS 로 풀어 자바스크립트 리사이즈 처리를 줄였습니다.",
        "Screen transitions use a browser feature that snapshots and blends views, with no JavaScript animation library. It is not turned on everywhere, only at the Start from episode 1 link, as progressive enhancement that respects the reduced-motion setting. Layout and state styling are solved with declarative CSS such as container queries and :has(), cutting JavaScript resize handling.",
      ),
      analogy: t(
        "연극에서 장면을 바꿀 때 이전 장면을 사진으로 걸어 두고 새 장면을 천천히 비추는 것과 같습니다. 사진을 걸 수 없는 극장이면 그냥 장면을 바꿉니다.",
        "It is like hanging a photo of the previous scene while slowly lighting the next one. In a theatre that cannot hang the photo, the scene simply changes.",
      ),
      questions: [
        {
          question: t("모든 화면 이동에 전환 효과가 있나요?", "Does every navigation have a transition?"),
          answer: t(
            "아니요. 작품 상세에서 리더로 가는 링크 한 곳뿐입니다. 요소가 이어지는 morph 전환(view-transition-name)은 쓰지 않습니다.",
            "No. Only the link from the title page to the reader. Element-level morph transitions (view-transition-name) are not used.",
          ),
        },
        {
          question: t("동작 줄이기를 켠 사용자는요?", "What about users who enabled reduced motion?"),
          answer: t(
            "애니메이션 없이 즉시 전환합니다. 스크롤 연동 연출도 같은 조건에서 꺼집니다.",
            "They get an instant switch with no animation, and the scroll-driven effect is turned off under the same condition.",
          ),
        },
        {
          question: t("지원하지 않는 브라우저에서는요?", "And in browsers without support?"),
          answer: t(
            "라우터가 일반 이동으로 처리하고, 스크롤 연동은 @supports 밖이라 적용되지 않을 뿐 내용은 항상 보입니다.",
            "The router navigates normally, and the scroll effect simply does not apply outside @supports while content stays visible.",
          ),
        },
      ],
      pitfall: t(
        "문서 간 전환(@view-transition)은 쓰지 않습니다. 브라우저별 Baseline 상태는 코드로 확인되지 않으니 web.dev/baseline 을 보여 주세요. Popover API 와 Anchor Positioning 은 설정 화면의 감지 후보일 뿐 실제로는 쓰지 않습니다.",
        "Cross-document transitions (@view-transition) are not used. Per-browser Baseline status cannot be confirmed from code, so show web.dev/baseline. The Popover API and Anchor Positioning are only detection candidates in the settings and are not actually used.",
      ),
    },
    technologies: ["View Transitions", "Container Queries", ":has()", "content-visibility", "Scroll-driven Animations", "Tailwind CSS"],
    facts: [
      {
        value: "160 ms · 200 ms",
        label: t("크로스페이드의 사라짐 · 나타남 시간", "Fade-out and fade-in durations of the crossfade"),
        source: "apps/web/src/app/styles/globals.css",
      },
      {
        value: "7.18.2",
        label: t("viewTransition 속성을 받는 react-router-dom 버전", "react-router-dom version that accepts the viewTransition prop"),
        source: "package.json",
      },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "speculation-rules-prerender",
    category: "web-platform",
    name: "Speculation Rules",
    title: t("공개 페이지에서 스튜디오를 미리 준비 (부팅은 활성화 뒤)", "Preparing the studio from public pages (boot waits for activation)"),
    status: "experimental",
    tagline: t(
      "CSP 가 규칙 해시로 허용하고, 숨은 스튜디오 문서는 사용자가 실제로 열 때까지 부팅하지 않습니다.",
      "The CSP allows the rule by its hash, and the hidden studio document does not boot until the user actually opens it.",
    ),
    background: [
      t(
        "공개 페이지에서 스튜디오로 갈 때는 앱 안 이동이 아니라 문서를 통째로 새로 불러옵니다(COOP/COEP 경계 때문). 그래서 첫 화면이 뜰 때까지 기다려야 합니다. Speculation Rules 는 곧 이 주소로 갈 것 같으니 미리 받아서 그려 두라고 브라우저에 귀띔하는 기능으로, 맞으면 이동이 거의 즉시 끝납니다.",
        "Going from a public page to the studio loads a whole new document rather than an in-app navigation (because of the COOP and COEP boundary), so the user waits for the first screen. Speculation Rules whisper to the browser that the user will probably go to this address soon, so fetch and render it ahead; when right, the move finishes almost instantly.",
      ),
      t(
        "구현은 작습니다. 규칙 JSON 한 덩이(prerender, list, /studio, eagerness moderate)를 script type=speculationrules 로 head 에 한 번 넣습니다. moderate 는 포인터를 올리는 등 의도가 보일 때 시작한다는 뜻이고, 같은 출처의 절대 경로만 허용합니다. 코드 주석은 Chromium 계열에서만 동작하고 다른 브라우저는 태그를 무시한다고 적고 있어, 폴백이 필요 없는 점진적 강화입니다. 설정의 스튜디오 미리 준비하기로 끌 수 있습니다.",
        "The implementation is small: one rule JSON (prerender, list, /studio, eagerness moderate) is added once to the head as script type=speculationrules. Moderate means start when intent shows, such as a pointer hover, and only same-origin absolute paths are allowed. A code comment says only Chromium-family browsers act on it and others ignore the tag, so it is progressive enhancement needing no fallback. It can be switched off with Prepare the studio ahead of time in settings.",
      ),
      t(
        "CSP 는 규칙 JSON 의 해시('sha256-GrX39s3Az4qEddGQLCYCCB+jrL9X7dvOAVgBXB8l6nM=')로 허용합니다. script-src 에 해시가 하나라도 있으면 'inline-speculation-rules' 키워드는 'unsafe-inline' 처럼 무시되어, 운영 모양 CSP 로 Chromium 156 에서 재 보니 키워드만으로는 프리렌더 요청조차 나가지 않았고 해시를 넣자 요청과 부팅이 일어났습니다(2026-10-23). 규칙 문자열이 바뀌면 해시가 달라지므로, 대상 주소를 STUDIO_PRERENDER_URLS 하나로 두고 CSP 생성기(cloudflare-static-rules.mjs)가 같은 문자열의 해시를 지키게 했습니다. 두 문자열이 다르면 시험이 실패합니다.",
        "The CSP allows the rule by the hash of its JSON ('sha256-GrX39s3Az4qEddGQLCYCCB+jrL9X7dvOAVgBXB8l6nM='). When script-src holds any hash, the 'inline-speculation-rules' keyword is ignored the way 'unsafe-inline' is: with a production-shaped CSP in Chromium 156, the keyword alone did not even send the prerender request, while the hash produced both the request and the boot (2026-10-23). Because the hash changes with the rule string, the target lives in one STUDIO_PRERENDER_URLS constant and the CSP generator (cloudflare-static-rules.mjs) keeps the hash of the same string; a test fails if the two strings differ.",
      ),
      t(
        "격리(COOP/COEP) 문서도 프리렌더됩니다. DevTools 를 붙이지 않은 헤드리스 Chromium 156 에서 /studio 가 숨은 채 부팅했고 crossOriginIsolated 도 참이었습니다(DevTools 가 붙으면 PrerenderingDisabledByDevTools 로 꺼져 자동화 도구로는 잴 수 없습니다). 그래서 부작용을 막는 쪽이 핵심입니다. 스튜디오 홈은 그리는 순간 페이지뷰 전송, 로컬 SQLite 소유 잠금, 라이브러리 동기화를 시작하는데, 숨은 문서가 그 잠금을 쥐면 이미 열린 편집기 탭이 세션 전용 저장으로 떨어집니다. 그래서 main.tsx 는 앱 부팅 전체를 prerenderingchange 뒤로 미루고, 미리 끝나는 일은 HTML·엔트리 번들의 다운로드와 파싱으로 한정합니다. 복구 안내 타이머(offline-draw/bootstrap.js)도 같은 경계를 따르고, 페이지뷰 로드 시간에서는 activationStart 를 뺍니다.",
        "Isolated (COOP/COEP) documents are prerendered too: in headless Chromium 156 without DevTools attached, /studio booted while hidden and crossOriginIsolated was true (with DevTools attached it is switched off as PrerenderingDisabledByDevTools, so automation tools cannot measure it). Stopping side effects is therefore the core. The studio home starts a page-view send, the local SQLite ownership lock and library sync the moment it renders, and if a hidden document takes that lock an already open editor tab drops to session-only saving. So main.tsx defers the whole app boot until prerenderingchange, and what finishes ahead is limited to downloading and parsing the HTML and entry bundles. The recovery-notice timer (offline-draw/bootstrap.js) follows the same boundary, and the page-view load time subtracts activationStart.",
      ),
    ],
    keyPoints: [
      t("공개 → /studio 문서 이동을 미리 렌더링하려는 시도", "An attempt to prerender the public-to-studio move"),
      t("CSP 는 규칙 해시로 허용(키워드는 해시가 있으면 무시됨, Chromium 156 실측)", "The CSP allows the rule by hash (the keyword is ignored next to a hash; measured in Chromium 156)"),
      t("앱 부팅 전체가 prerenderingchange 뒤로 미뤄진다", "The whole app boot waits for prerenderingchange"),
      t("운영 사이트의 체감 효과는 아직 재지 않아 실험으로 표시", "The effect on the production site is not measured yet, so it stays experimental"),
    ],
    diagram: {
      id: "speculation-rules-prerender-diagram",
      kind: "sequence",
      title: t("미리 준비 흐름과 활성화 경계", "The prepare-ahead flow and the activation boundary"),
      caption: t(
        "CSP 가 규칙 해시로 허용하면 엔진이 /studio 를 숨은 채 받아 두고, 앱 부팅은 클릭으로 활성화된 뒤에 시작합니다. 격리 문서의 프리렌더 부팅은 Chromium 156 에서 확인했고 활성화 뒤 체감 속도는 운영에서 재지 않았습니다.",
        "With the rule allowed by its hash, the engine fetches /studio hidden and the app boot starts only after a click activates it. Prerender boot of the isolated document was confirmed in Chromium 156; post-activation speed was not measured in production.",
      ),
      alt: t(
        "공개 페이지가 규칙 JSON 을 주입하면 브라우저 엔진이 CSP 의 규칙 해시를 확인하고 받아들입니다. 방문자가 스튜디오 링크에 포인터를 올리면 엔진이 숨은 상태로 /studio 를 받아 HTML 과 엔트리 번들을 준비하지만, 앱은 아직 부팅하지 않습니다. 클릭하면 문서가 활성화되고 prerenderingchange 를 받은 뒤에야 앱이 부팅합니다.",
        "The public page injects the rule JSON and the browser engine accepts it by its hash in the CSP. When the visitor hovers the studio link, the engine fetches /studio hidden and prepares the HTML and entry bundles, but the app does not boot yet. A click activates the document, and the app boots only after prerenderingchange.",
      ),
      actors: [
        { id: "visitor", label: t("방문자", "Visitor"), tone: "neutral" },
        { id: "public", label: t("공개 페이지", "Public page"), sub: t("규칙 JSON 주입", "injects the rule JSON"), tone: "local" },
        { id: "engine", label: t("브라우저 엔진", "Browser engine"), sub: t("CSP 검사 · 프리렌더", "CSP check, prerender"), tone: "local" },
        { id: "studio", label: t("/studio 문서", "/studio document"), sub: t("COOP 격리 문서", "COOP-isolated"), tone: "warn" },
      ],
      messages: [
        {
          from: "public",
          to: "engine",
          label: t("규칙 JSON 주입", "Inject the rule JSON"),
          note: t("prerender /studio, moderate", "prerender /studio, moderate"),
        },
        {
          from: "engine",
          to: "engine",
          label: t("CSP script-src 확인", "Check CSP script-src"),
          note: t("규칙 해시로 허용(키워드는 해시 옆에서 무시됨)", "Allowed by the rule hash (the keyword is ignored next to a hash)"),
        },
        {
          from: "visitor",
          to: "public",
          label: t("스튜디오 링크에 포인터", "Hover the studio link"),
          note: t("의도가 보이면 시작", "Starts when intent shows"),
        },
        {
          from: "engine",
          to: "studio",
          label: t("숨은 상태로 프리렌더", "Prerender while hidden"),
          style: "dashed",
          note: t("HTML·번들만 준비, 앱은 부팅하지 않음", "Only HTML and bundles are prepared; the app does not boot"),
        },
        {
          from: "visitor",
          to: "studio",
          label: t("클릭하면 활성화", "Click to activate"),
          note: t("prerenderingchange 뒤 앱 부팅", "The app boots after prerenderingchange"),
        },
      ],
    },
    usage: [
      {
        feature: t("공개 페이지 → 스튜디오 진입", "Public page to studio entry"),
        role: t(
          "공개 페이지가 열릴 때 /studio 프리렌더 규칙을 한 번 넣습니다(스튜디오 문서에서는 넣지 않음).",
          "Adds the /studio prerender rule once when a public page opens (not on studio documents).",
        ),
        paths: ["apps/web/src/shared/lib/speculation-rules.ts", "apps/web/src/app/main.tsx"],
        route: "/",
      },
      {
        feature: t("설정 · 실험 기능", "Settings · experimental features"),
        role: t(
          "스튜디오 미리 준비하기 토글(기본 켜짐)로 사용자가 끌 수 있고, 지원 여부는 감지 결과로 표시합니다.",
          "A toggle (on by default) lets users turn it off, and support is shown from detection results.",
        ),
        paths: [
          "apps/web/src/shared/lib/nextgen-lab-settings.ts",
          "apps/web/src/domains/account/NextgenLabSettingsSection.tsx",
        ],
      },
      {
        feature: t("보안 헤더 (CSP)", "Security headers (CSP)"),
        role: t(
          "script-src 에 index.html JSON-LD 해시와 규칙 JSON 해시가 함께 있습니다. 생성기가 두 해시만 남기고, 규칙 문자열이 앱과 다르면 시험이 실패합니다.",
          "script-src carries the index.html JSON-LD hash and the rule JSON hash. The generator keeps only those two, and a test fails if the rule string drifts from the app.",
        ),
        paths: ["config/http-response-headers.json", "scripts/cloudflare-static-rules.mjs", "apps/web/src/app/main.tsx"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("규칙을 안전하게 한 번만 넣기", "Adding the rule once, safely"),
        language: "ts",
        ...sampleSource([
          ["export function addPrerender(urls: readonly string[]): boolean {"],
          ['  if (!HTMLScriptElement.supports?.("speculationrules")) return false;', "미지원 브라우저는 태그를 무시한다", "unsupported browsers ignore the tag"],
          ['  const safe = urls.filter((url) => url.startsWith("/") && !url.startsWith("//"));', "같은 출처의 경로만", "same-origin paths only"],
          ['  if (safe.length === 0 || document.querySelector(\'script[type="speculationrules"]\')) return false;'],
          ['  const script = document.createElement("script");'],
          ['  script.type = "speculationrules";'],
          ['  script.textContent = JSON.stringify({ prerender: [{ source: "list", urls: safe, eagerness: "moderate" }] });'],
          ["  document.head.append(script);", "CSP 가 인라인 규칙을 허용하는지는 실브라우저로 확인해야 한다", "whether the CSP allows inline rules must be checked in a real browser"],
          ["  return true;", "넣었다는 뜻일 뿐 동작한다는 뜻이 아니다", "this means added, not working"],
          ["}"],
        ]),
        explain: t(
          "return true 는 태그를 넣었다는 뜻이지 브라우저가 규칙을 받아들였다는 뜻이 아닙니다. CSP 가 막아도 appendChild 는 성공하므로, 허용 여부는 생성기의 해시 시험과 실브라우저 측정으로 확인합니다.",
          "Returning true means the tag was added, not that the browser accepted the rule. appendChild succeeds even when the CSP blocks it, so acceptance is checked by the generator's hash test and real-browser measurement.",
        ),
        source: "apps/web/src/shared/lib/speculation-rules.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("실제로 주입되는 규칙", "The rule that is actually injected"),
        language: "json",
        code: '{\n  "prerender": [\n    { "source": "list", "urls": ["/studio"], "eagerness": "moderate" }\n  ]\n}',
        explain: t(
          "source: list 는 주소를 직접 나열한다는 뜻이고, eagerness: moderate 는 포인터를 올리는 등 의도가 보일 때 시작한다는 뜻입니다. 대상은 /studio 하나뿐입니다.",
          "source: list means the addresses are listed directly, and eagerness: moderate means start when intent shows, such as a hover. The only target is /studio.",
        ),
        source: "apps/web/src/shared/lib/speculation-rules.ts",
      },
    ],
    links: [
      {
        title: "MDN · Speculation Rules API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API",
        kind: "docs",
        note: t("CSP 요구와 호환성 표", "The CSP requirement and the compatibility table"),
      },
      {
        title: "Chrome for Developers · Prerender pages",
        url: "https://developer.chrome.com/docs/web-platform/prerender-pages",
        kind: "guide",
        note: t("프리렌더 중 부작용을 다루는 방법", "Handling side effects while prerendering"),
      },
      {
        title: "WICG · Speculation Rules",
        url: "https://wicg.github.io/nav-speculation/speculation-rules.html",
        kind: "spec",
      },
      {
        title: "MDN · Document.prerendering",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Document/prerendering",
        kind: "docs",
      },
    ],
    chapterIds: ["nextgen-web-experiments", "pwa-continuity"],
    talk: {
      pitch: t(
        "공개 페이지에서 스튜디오로 갈 때의 로딩을 줄이려고, 곧 갈 것 같으니 미리 받아 두라는 귀띔을 브라우저에 넣었습니다. 처음에는 보안 정책(CSP)에 막혀 아무 일도 없었는데, 정책에 규칙의 지문(해시)을 넣으면 숨은 스튜디오가 실제로 실행된다는 것을 확인했습니다. 숨은 문서가 저장소 잠금을 쥐거나 방문으로 집계되면 안 되므로, 앱은 사용자가 실제로 열 때까지 부팅하지 않고 파일만 미리 받아 둡니다.",
        "To cut the loading from a public page to the studio, we hint to the browser to fetch the studio ahead. At first the security policy (CSP) blocked it and nothing happened; adding the rule's fingerprint (hash) to the policy made the hidden studio actually run. Because a hidden document must not take the storage lock or count as a visit, the app does not boot until the user opens it, and only the files are fetched ahead.",
      ),
      analogy: t(
        "식당에서 단골이 문 앞에 서면 재료를 꺼내 두되, 손님이 앉기 전에는 불을 켜지 않는 것과 같습니다.",
        "It is like laying out a regular's ingredients when they reach the door, without lighting the stove until they sit down.",
      ),
      questions: [
        {
          question: t("정말 빨라지나요?", "Does it really make things faster?"),
          answer: t(
            "운영 체감 속도는 아직 재지 않았습니다. 확인한 것은 규칙 해시가 있으면 Chromium 이 /studio 를 숨은 채 받아 부팅까지 할 수 있다는 점이고, 앱은 부팅을 활성화 뒤로 미루므로 미리 끝나는 일은 HTML·엔트리 번들의 다운로드와 파싱입니다.",
            "The production speed-up is not measured yet. What was confirmed is that with the rule hash Chromium can fetch and even boot /studio hidden; since the app defers its boot until activation, what finishes ahead is downloading and parsing the HTML and entry bundles.",
          ),
        },
        {
          question: t("다른 브라우저에서는요?", "What about other browsers?"),
          answer: t(
            "코드 주석 기준으로 Chromium 계열만 규칙을 이해하고, 다른 브라우저는 태그를 무시해 평소처럼 이동합니다. 최신 지원 현황은 MDN 에서 확인하세요.",
            "Per a code comment only Chromium-family browsers act on the rule; others ignore the tag and navigate as usual. Check MDN for current support.",
          ),
        },
        {
          question: t("비용이나 낭비는 없나요?", "Is there any cost or waste?"),
          answer: t(
            "같은 출처의 /studio 하나만 대상이고, 포인터를 올리는 등 의도가 보일 때(moderate)만 시작해 가만히 있는 페이지에서는 낭비가 없습니다. 끄는 설정도 있습니다.",
            "The only target is the same-origin /studio, and it starts only when intent shows (moderate), so an idle page wastes nothing. There is also a switch to turn it off.",
          ),
        },
      ],
      pitfall: t(
        "CSP 에 'inline-speculation-rules' 키워드를 더하는 것으로 고쳤다고 생각하지 마세요. script-src 에 해시가 있으면 키워드는 무시되어 규칙이 조용히 막힙니다(Chromium 156 실측). 또 규칙을 허용한 채 앱 부팅의 활성화 경계를 지우면, 숨은 문서가 페이지뷰로 집계되고 로컬 저장소 잠금을 쥡니다. 두 조건은 시험이 함께 지킵니다.",
        "Do not assume adding the 'inline-speculation-rules' keyword to the CSP fixes it: with a hash in script-src the keyword is ignored and the rule is silently blocked (measured in Chromium 156). And if the app-boot activation boundary is removed while the rule is allowed, hidden documents count as visits and take the local storage lock. Tests guard both conditions together.",
      ),
    },
    technologies: ["Speculation Rules", "CSP", "COOP", "Prerender"],
    facts: [
      {
        value: "moderate",
        label: t("프리렌더 시작 조건(eagerness)", "Prerender start condition (eagerness)"),
        source: "apps/web/src/shared/lib/speculation-rules.ts",
      },
      {
        value: "/studio",
        label: t("프리렌더 대상(목록 한 개)", "Prerender target (a single-item list)"),
        source: "apps/web/src/app/main.tsx",
      },
    ],
    reviewedAt: "2026-10-23",
  },
  {
    id: "intl-segmenter-korean-lines",
    category: "web-platform",
    name: "Intl.Segmenter",
    title: t("글자 수와 줄바꿈을 사람이 읽는 단위로", "Counting and breaking text in human units"),
    status: "live",
    tagline: t(
      "한글·이모지를 쪼개지 않고 세고, 번역문이 말풍선에 들어가는지 금칙까지 따져 봅니다.",
      "Counts Hangul and emoji without splitting them and checks translated lines, kinsoku included.",
    ),
    background: [
      t(
        "문자열의 길이(string.length)는 사람이 보는 글자 수가 아닙니다. 이모지 하나가 여러 칸으로 세어지고, 자모가 풀어진 형태로 입력된 한글도 한 글자가 여러 조각이라 글자 수로 자르거나 줄을 바꾸면 글자가 깨집니다. Intl.Segmenter 는 브라우저의 유니코드 라이브러리(ICU)가 사람이 인식하는 한 글자(grapheme)와 단어 경계를 알려 주는 내장 도구입니다.",
        "A string's length (string.length) is not the number of characters a person sees. One emoji counts as several units, and Hangul typed in decomposed jamo form is several pieces for one character, so cutting or wrapping by count breaks characters. Intl.Segmenter is a built-in tool where the browser's Unicode library (ICU) reports what a person perceives as one character (a grapheme) and word boundaries.",
      ),
      t(
        "ToonStudio 에서 이 도구가 실제로 도는 곳은 세 군데입니다. 첫째, 대사 번역 패널의 말풍선 오버플로 판정입니다. 번역문을 자소 단위로 나눠 줄 첫머리에 올 수 없는 부호(?! …)와 줄 끝에 올 수 없는 접두 기호(₩ 등)를 피해 줄바꿈을 앞으로 물리고(금칙 처리), 줄 길이의 들쭉날쭉함도 줄입니다(금칙과 세로쓰기는 드로잉 카드가 자세히 다룹니다). 둘째, 작업공간 이름처럼 글자 수 한도가 있는 입력에서 사용자가 보는 글자를 반쯤 자르지 않습니다. 셋째, 가상 스튜디오 입장 닉네임의 길이로, 자소 수로 세어 최소·최대 길이를 판정합니다.",
        "It really runs in three places. First, the balloon-overflow verdict in the dialogue translation panel: translated text is split into graphemes, line breaks are pulled earlier to avoid marks that cannot start a line (?! …) and prefix symbols that cannot end one (such as the won sign), a rule called kinsoku, and ragged line lengths are smoothed (the drawing cards cover kinsoku and vertical writing in detail). Second, inputs with a character limit, such as workspace names, never cut a visible character in half. Third, the virtual studio entry nickname's length, counted in graphemes to judge its minimum and maximum.",
      ),
      t(
        "Intl.Segmenter 가 없는 엔진에서는 코드포인트 단위로 나누는 폴백(서로게이트 쌍은 보존)을 씁니다. 자소 분할은 로케일 영향이 작지만 단어 분할은 ICU 버전과 로케일에 따라 달라질 수 있어, 단어 분할을 쓰는 balloon-text-layout 은 로케일 ko 를 명시해 결과를 고정합니다. 깊은 복사에는 브라우저 내장 structuredClone 을 쓰며(비테스트 약 50개 파일), JSON 으로 복사하는 폴리필은 내장이 없는 환경 전용입니다.",
        "Where Intl.Segmenter is missing, the code falls back to splitting by code point (keeping surrogate pairs). Grapheme splitting barely depends on locale, but word splitting can vary with the ICU version and locale, so balloon-text-layout, which uses word splitting, states the ko locale to pin results. For deep copies it uses the built-in structuredClone (in about 50 non-test files); the JSON-based polyfill is only for environments without it.",
      ),
      t(
        "정직하게 구분할 점이 있습니다. 말풍선 글자 크기를 맞추는 줄바꿈 추정(wrapBubbleTextLines)은 공백 기준 그리디 방식이고 실제 캔버스 렌더는 Konva 텍스트의 자체 줄바꿈에 맡깁니다. 금칙·어절 규칙은 번역 QA 판정에만 쓰입니다. 어절 단위 줄바꿈을 구현한 balloon-text-layout 은 테스트까지 있지만 제품 호출처가 없습니다(메타 카드 참고).",
        "One distinction must be made honestly. The line-wrap estimate that fits balloon font size (wrapBubbleTextLines) is a whitespace-based greedy method, and the real canvas rendering is left to Konva text's own wrapping. Kinsoku and word rules are used only in the translation QA verdict. balloon-text-layout, which implements word-unit wrapping, has tests but no product caller (see the meta card).",
      ),
    ],
    keyPoints: [
      t("length 가 아니라 사람이 읽는 한 글자로 센다", "Count what a person reads as one character"),
      t("번역문이 말풍선에 들어가는지 금칙까지 판정", "Translation fit checks include kinsoku rules"),
      t("미지원 엔진은 코드포인트 단위 폴백", "Engines without it fall back to code points"),
      t("실제 말풍선 줄바꿈은 아직 공백 기준", "Real balloon wrapping is still space-based"),
    ],
    diagram: {
      id: "intl-segmenter-korean-lines-diagram",
      kind: "graph",
      title: t("번역문이 말풍선에 들어가는지 따지는 길", "How a translation is checked against its balloon"),
      caption: t(
        "자소로 나눠 금칙을 피해 줄을 정하고, 들어가는지 판정합니다.",
        "Split into graphemes, avoid kinsoku violations to set the lines, then judge the fit.",
      ),
      alt: t(
        "번역문을 Intl.Segmenter 로 자소 단위로 나누고, 줄 첫머리와 끝에 올 수 없는 글자를 피하도록 줄바꿈 지점을 앞으로 물립니다. 줄 길이를 고르게 만든 뒤 말풍선 크기에 들어가는지 판정하고, 결과는 번역 QA 보고서로 보여 줍니다. Intl.Segmenter 가 없으면 코드포인트 분할로 대신합니다.",
        "The translation is split into graphemes with Intl.Segmenter, and break points are pulled earlier to avoid characters that cannot start or end a line. After line lengths are evened out, the fit to the balloon is judged and shown in the translation QA report. Without Intl.Segmenter, code-point splitting takes over.",
      ),
      nodes: [
        { id: "text", label: t("번역문", "Translation"), tone: "local", shape: "pill", at: [0, 0] },
        {
          id: "split",
          label: t("자소로 나누기", "Split to graphemes"),
          sub: t("Intl.Segmenter", "Intl.Segmenter"),
          tone: "local",
          at: [1, 0],
        },
        {
          id: "kinsoku",
          label: t("금칙 피하기", "Avoid kinsoku"),
          sub: t("최대 4자소 앞으로", "retreat up to 4"),
          tone: "local",
          at: [2, 0],
        },
        { id: "balance", label: t("줄 길이 고르기", "Even out the lines"), tone: "local", at: [3, 0] },
        { id: "fit", label: t("말풍선에 맞나?", "Fits the balloon?"), tone: "neutral", shape: "diamond", at: [4, 0] },
        { id: "report", label: t("번역 QA 보고서", "Translation QA report"), tone: "good", shape: "pill", at: [4, 1] },
        {
          id: "fallback",
          label: t("코드포인트 분할", "Code-point split"),
          sub: t("엔진에 없을 때", "when the engine lacks it"),
          tone: "warn",
          at: [1, 1],
        },
      ],
      edges: [
        { from: "text", to: "split" },
        { from: "split", to: "kinsoku" },
        { from: "kinsoku", to: "balance" },
        { from: "balance", to: "fit" },
        { from: "fit", to: "report", label: t("판정 기록", "verdict") },
        { from: "split", to: "fallback", label: t("미지원", "missing"), style: "dashed" },
        { from: "fallback", to: "kinsoku", style: "dashed" },
      ],
    },
    usage: [
      {
        feature: t("대사 번역 · 말풍선 오버플로 판정", "Dialogue translation · balloon overflow verdict"),
        role: t(
          "번역문을 자소 단위로 나눠 금칙을 피하고 줄 균형을 맞춘 뒤 말풍선에 들어가는지 판정합니다.",
          "Splits translated text into graphemes, avoids kinsoku violations, balances the lines and judges whether it fits the balloon.",
        ),
        paths: [
          "apps/web/src/domains/creator/lettering/studio-kinsoku-line-break.ts",
          "apps/web/src/domains/creator/lettering/studio-localization-overflow-gate.ts",
          "apps/web/src/domains/creator/StudioDialogueTranslatePanel.tsx",
        ],
        route: "/studio",
      },
      {
        feature: t("작업공간 이름 자르기", "Truncating workspace names"),
        role: t(
          "코드포인트 한도로 자르되 사용자가 보는 글자(자소 군집)는 쪼개지 않습니다.",
          "Truncates by a code-point limit without splitting a user-visible character (grapheme cluster).",
        ),
        paths: ["apps/web/src/domains/creator/studio-workspaces.ts#truncateWorkspaceNameBase"],
      },
      {
        feature: t("가상 스튜디오 · 닉네임 길이 세기", "Virtual studio · counting nickname length"),
        role: t(
          "입장 닉네임 길이를 자소 수로 세어 최소·최대를 판정하고, 금칙 줄바꿈 모듈도 같은 자소 단위로 번역문을 나눕니다.",
          "Counts the entry nickname's length in graphemes to judge its minimum and maximum, and the kinsoku line-break module splits translated text into the same grapheme units.",
        ),
        paths: [
          "apps/web/src/domains/creator/virtual-space/studio-virtual-space-entry-preference.ts",
          "apps/web/src/domains/creator/lettering/studio-kinsoku-line-break.ts",
        ],
      },
      {
        feature: t("깊은 복사 (structuredClone)", "Deep copies (structuredClone)"),
        role: t(
          "데이터 복제에 내장 structuredClone 을 쓰고, 내장이 없는 환경용 JSON 폴리필은 main.tsx 맨 위에서 먼저 불러옵니다.",
          "Data is copied with the built-in structuredClone, and the JSON polyfill for environments without it is loaded first at the top of main.tsx.",
        ),
        paths: ["apps/web/src/platform/browser/polyfills.ts", "apps/web/src/app/main.tsx"],
      },
    ],
    samples: [
      {
        kind: "teaching",
        title: t("자소와 어절 단위로 나누기", "Splitting into graphemes and word units"),
        language: "ts",
        ...sampleSource([
          ['export function graphemes(text: string, locale = "ko"): string[] {'],
          ['  if (typeof Intl.Segmenter !== "function") return Array.from(text);', "폴백: 코드포인트(서로게이트 쌍은 보존)", "fallback: code points (surrogate pairs preserved)"],
          ['  return Array.from(new Intl.Segmenter(locale, { granularity: "grapheme" }).segment(text), (part) => part.segment);'],
          ["}"],
          [""],
          ["export function wordUnits(text: string, locale = \"ko\"): string[] {", "말풍선 줄바꿈 후보: 한글은 어절 단위로 나온다", "balloon break candidates: Hangul comes out as word units"],
          ['  return Array.from(new Intl.Segmenter(locale, { granularity: "word" }).segment(text), (part) => part.segment);'],
          ["}"],
        ]),
        explain: t(
          "granularity 를 grapheme 으로 두면 사람이 보는 한 글자, word 로 두면 단어(한글은 어절) 경계가 나옵니다. 로케일을 명시하면 ICU 버전이 같을 때 결과가 같습니다.",
          "Granularity grapheme gives one visible character, and word gives word boundaries (word units for Hangul). With an explicit locale, results match when the ICU version is the same.",
        ),
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("structuredClone 과 JSON 복사의 차이", "structuredClone versus a JSON copy"),
        language: "ts",
        ...sampleSource([
          ['const original = { at: new Date(0), tags: new Set(["a"]), pixels: new Uint8Array([1, 2, 3]) };'],
          [""],
          ["const good = structuredClone(original);", "Date·Set·TypedArray 가 그대로 복제된다", "Date, Set and typed arrays are cloned intact"],
          ["const lossy: unknown = JSON.parse(JSON.stringify(original));", "폴리필식 복사: Date 는 문자열, Set 은 빈 객체가 된다", "polyfill-style copy: Date becomes a string and Set an empty object"],
          [""],
          ["console.log(good.at instanceof Date, good.tags.has(\"a\"), lossy);"],
        ]),
        explain: t(
          "브라우저에 structuredClone 이 있으면 폴리필은 실행되지 않습니다. 그러나 내장이 없는 오래된 WebView 에서는 폴리필의 JSON 복사 때문에 조용히 데이터가 바뀔 수 있어, 빌드 타깃(Chrome 111·Safari 16.4 이상)에서는 사실상 필요 없는 폴리필이라는 점이 점검 후보입니다.",
          "Where the browser has structuredClone the polyfill never runs. But on an old WebView without it, the polyfill's JSON copy can silently change data, and since the build target (Chrome 111, Safari 16.4 or newer) effectively does not need it, removing it is a review candidate.",
        ),
        verify: "types",
      },
    ],
    links: [
      {
        title: "MDN · Intl.Segmenter",
        url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Segmenter",
        kind: "docs",
        note: t("grapheme·word·sentence 단위와 호환성 표", "Grapheme, word and sentence granularity and the compatibility table"),
      },
      {
        title: "ECMA-402 · Segmenter objects",
        url: "https://tc39.es/ecma402/#segmenter-objects",
        kind: "spec",
      },
      {
        title: "Unicode · UAX #29 Text Segmentation",
        url: "https://unicode.org/reports/tr29/",
        kind: "spec",
        note: t("자소 군집(grapheme cluster)을 나누는 규칙", "The rules that define grapheme clusters"),
      },
      {
        title: "MDN · structuredClone()",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone",
        kind: "docs",
      },
    ],
    chapterIds: ["on-device-translation", "browser-local-compute"],
    talk: {
      pitch: t(
        "글자 수를 센다고 length 를 쓰면 이모지와 자모가 풀어진 한글이 깨집니다. 브라우저에 들어 있는 Intl.Segmenter 로 사람이 읽는 한 글자 단위로 세고 자르며, 이 단위로 번역문이 말풍선에 들어가는지, 줄 첫머리에 물음표나 말줄임표가 홀로 남는 금칙 위반이 없는지 점검합니다. 다만 화면에 말풍선을 그리는 실제 줄바꿈은 아직 공백 기준이라는 점을 구분해서 말씀드립니다.",
        "Using length to count characters breaks emoji and Hangul in decomposed form. With the Intl.Segmenter built into the browser, text is counted and cut in units a person reads as one character, and a translation is checked for whether it fits the balloon and for kinsoku violations such as a lone question mark or ellipsis at the start of a line. I should add that the real wrapping that draws the balloon text on screen is still whitespace-based.",
      ),
      analogy: t(
        "조합형으로 입력된 한글 각은 자모 세 조각이지만 사람에게는 한 글자입니다. 가족 이모지 하나가 사람 셋과 연결 기호로 이루어진 것도 마찬가지입니다.",
        "A Hangul syllable typed in decomposed form is three jamo pieces but one character to a person; a family emoji built from three people and joiners is the same.",
      ),
      questions: [
        {
          question: t("length 와 뭐가 다른가요?", "How is it different from length?"),
          answer: t(
            "length 는 내부 저장 단위(UTF-16)를 셉니다. Intl.Segmenter 는 사람이 인식하는 글자와 단어 경계를 알려 줘서 자르거나 줄을 바꿔도 글자가 깨지지 않습니다.",
            "length counts internal storage units (UTF-16). Intl.Segmenter reports the characters and word boundaries a person perceives, so cutting or wrapping never breaks a character.",
          ),
        },
        {
          question: t("금칙이 뭔가요?", "What is kinsoku?"),
          answer: t(
            "줄 첫머리에 ?, !, … 같은 부호가 혼자 남거나 줄 끝에 ₩ 같은 접두 기호가 남지 않게 하는 조판 규칙입니다. 만화·웹툰 식자의 기본 매너입니다.",
            "A typesetting rule that keeps marks like ?, ! or … from standing alone at the start of a line and prefix symbols like the won sign from ending one. It is basic manners in comic and webtoon lettering.",
          ),
        },
        {
          question: t("Intl.Segmenter 가 없는 브라우저는요?", "What about browsers without Intl.Segmenter?"),
          answer: t(
            "코드포인트 단위로 나누는 폴백을 쓰며 서로게이트 쌍은 보존합니다. 지원 현황은 MDN 호환성 표로 확인하세요.",
            "A code-point splitting fallback is used and surrogate pairs are preserved. Check the MDN compatibility table for support.",
          ),
        },
      ],
      pitfall: t(
        "가로쓰기 말풍선 글자를 화면에 그리는 줄바꿈(Konva)과 글자 크기 맞춤용 추정(wrapBubbleTextLines)은 공백 기준이며 금칙·어절 분할을 적용하지 않습니다. 금칙은 번역 QA 판정에서만 쓰입니다. Intl.Segmenter 어절 분할을 쓰는 balloon-text-layout 은 호출처가 없습니다.",
        "The wrapping that draws horizontal balloon text on screen (Konva) and the estimate that fits its font size (wrapBubbleTextLines) are whitespace-based and apply no kinsoku or word splitting. Kinsoku is used only in the translation QA verdict, and balloon-text-layout, which uses Intl.Segmenter word splitting, has no caller.",
      ),
    },
    technologies: ["Intl.Segmenter", "structuredClone", "Unicode", "ICU"],
    facts: [
      {
        value: "4",
        label: t("금칙 때문에 줄바꿈을 앞으로 물릴 수 있는 최대 자소 수", "Most graphemes a line break may retreat because of kinsoku"),
        source: "apps/web/src/domains/creator/lettering/studio-kinsoku-line-break.ts",
      },
      {
        value: "ko",
        label: t("단어 분할 로케일(결과를 고정)", "Locale for word splitting (pins the result)"),
        source: "packages/studio-project-model/src/ir/balloon-text-layout.ts",
      },
    ],
    reviewedAt: "2026-10-07",
  },
];
