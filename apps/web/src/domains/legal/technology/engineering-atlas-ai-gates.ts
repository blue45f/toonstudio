import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · ai 카테고리 — 유료 길 관문 카드(BYOK 승인 관문·무료로 인정하는 공급자 허용 목록).
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. 사실은 2026-10-07 기준 코드·테스트로 확인했다.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-ai-routing.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const BYOK_PAID_APPROVAL_GATE: EngineeringAtlasEntry = {
  id: "byok-paid-approval-gate",
  category: "ai",
  name: "BYOK approval gate",
  title: t("유료 길은 내 키와 내 승인이 있어야", "Paid routes need your key and your approval"),
  status: "live",
  tagline: t(
    "내 키는 이 탭의 메모리에만 두고, 유료 길은 내가 허락해야 자동 순서에 들어옵니다.",
    "Your key stays in this tab's memory, and a paid route joins the automatic order only if you allow it.",
  ),
  background: [
    t(
      "BYOK(Bring Your Own Key)는 '내 열쇠를 가져와 쓴다'는 뜻입니다. 호텔 금고에 맡기지 않고 열쇠를 내 주머니에 두는 것과 같아서, 서비스가 열쇠를 보관하지 않고 요금도 내 공급자 계정에 청구됩니다. ToonStudio는 내 키로 AI 공급자에게 브라우저에서 곧바로 요청을 보내고, 키는 기본적으로 이 탭의 메모리에만 있다가 탭을 닫거나 새로고침하면 사라집니다. 돈이 드는 키는 내가 허락해야 자동 순서에 들어옵니다.",
      "BYOK (Bring Your Own Key) means you bring your own key. It is like keeping the key in your pocket instead of leaving it in the hotel safe: the service never holds it, and the bill goes to your own provider account. ToonStudio sends requests to the AI provider straight from your browser with your key, which by default lives only in this tab's memory and disappears when you close or reload the tab. A key that costs money enters the automatic order only after you allow it.",
    ),
    t(
      "키가 지나는 길은 세 갈래입니다. ① 기본: 문서 하나의 메모리에만 있습니다. ② 선택 저장: 비밀번호(12자 이상)로 PBKDF2-SHA256(310,000회) 키를 만들고 AES-GCM-256으로 설정 전체를 암호화해 localStorage에 둡니다. 비밀번호는 저장하지 않고, 새 탭에서는 직접 잠금을 풀어야 합니다. ③ 전송: fetch에 credentials 'omit'·redirect 'error'·no-referrer·no-store를 주고 Cookie와 X-User-Id 헤더를 지워 쿠키 없이 공급자에게만 보냅니다. 잠금(다른 탭 신호·pagehide·세션 종료·잠금 버튼)이 걸리면 진행 중인 요청을 모두 취소합니다.",
      "A key travels three ways. (1) By default it lives only in the memory of one document. (2) Optional saving derives a PBKDF2-SHA256 key (310,000 rounds) from a password of 12 or more characters, encrypts the whole configuration with AES-GCM-256 and stores it in localStorage; the password is never stored, and a new tab must unlock by hand. (3) On the wire, fetch uses credentials 'omit', redirect 'error', no-referrer and no-store, and the Cookie and X-User-Id headers are removed, so the request goes to the provider only and without cookies. Any lock (another tab's signal, pagehide, session end, the lock button) aborts every in-flight request.",
    ),
    t(
      "승인 게이트는 비용 정책에서 시작합니다. 네 가지 중 user-funded-byok(사용자 결제)만 공개 HTTPS 주소를 자유롭게 쓸 수 있지만 자동 순서에는 기본으로 들어오지 않습니다. 자동 후보에는 무료 정책이 늘 들어가고, 유료 키는 allowPaidFallback(기본 false)을 켜거나 수동 모드로 경로를 직접 고를 때만 들어옵니다. 대안인 '서버가 키를 보관하며 대신 호출'은 편하지만, 서버가 비밀 보관 책임자가 되고 운영자 비용이 사용자 호출에 묶입니다.",
      "The approval gate starts with the cost policy. Of the four, only user-funded-byok (the user pays) may use any public HTTPS address, yet it does not join the automatic order by default. Free policies are always automatic candidates, and a paid key joins only when allowPaidFallback (default false) is turned on or the user picks that route in manual mode. The alternative, a server that stores keys and calls on your behalf, is convenient but makes the server the custodian of secrets and ties operator cost to user calls.",
    ),
    t(
      "예외와 한계도 있습니다. 3D 생성(Hyper3D) 키는 브라우저 메모리에 있다가 요청 헤더(x-studio-3d-provider-key)로 ToonStudio API를 거쳐 공급자에 전달됩니다. LoRA 학습의 fal 키는 현재 탭의 sessionStorage에 따로 둡니다. 반복 횟수 310,000회는 OWASP 치트시트의 현행 권고(PBKDF2-HMAC-SHA256 600,000회)보다 낮아 올릴 여지가 있고, 같은 출처에 XSS가 있으면 메모리의 키도 위험해 엄격한 CSP가 전제입니다.",
      "There are exceptions and limits. The 3D (Hyper3D) key sits in browser memory and is passed to the provider through the ToonStudio API in a request header (x-studio-3d-provider-key). The fal key for LoRA training is kept separately in the current tab's sessionStorage. The 310,000 rounds are below the OWASP cheat sheet's current recommendation (600,000 for PBKDF2-HMAC-SHA256), so there is room to raise them, and an XSS in the same origin would expose even in-memory keys, so a strict CSP is a precondition.",
    ),
  ],
  keyPoints: [
    t("키는 기본적으로 이 탭의 메모리에만 있습니다", "By default the key lives only in this tab's memory"),
    t("저장하려면 비밀번호로 암호화해 이 기기에만 둡니다", "Saving means encrypting with a password, on this device only"),
    t("유료 키는 설정에서 허락해야 자동 순서에 들어옵니다", "A paid key joins the automatic order only after you allow it"),
    t("요청은 쿠키 없이 브라우저에서 공급자로 곧바로 갑니다", "Requests go from the browser straight to the provider, without cookies"),
  ],
  diagram: {
    id: "byok-paid-approval-gate-diagram",
    kind: "sequence",
    title: t("내 키가 지나는 길", "The path your key takes"),
    caption: t(
      "키는 탭의 메모리에서 공급자로 곧바로 가고, 저장은 암호화해서만 하며, 유료 폴백은 내가 허락해야 켜집니다.",
      "The key goes from tab memory straight to the provider, is saved only encrypted, and paid fallback turns on only if you allow it.",
    ),
    alt: t(
      "사용자가 키와 비용 정책을 입력하면 탭의 메모리에만 보관됩니다. 원하면 비밀번호로 암호화해 보관함에 저장하고, 유료 폴백은 따로 허락해야 합니다. 요청은 쿠키 없이 탭에서 AI 공급자로 곧바로 가며, 잠금이 걸리면 진행 중인 요청을 모두 취소합니다.",
      "The user enters a key and a cost policy, and it is kept only in the tab's memory. If wanted, it is encrypted with a password and saved to the vault, and paid fallback needs a separate permission. Requests go from the tab straight to the AI provider without cookies, and a lock cancels every in-flight request.",
    ),
    actors: [
      { id: "user", label: t("사용자", "You"), tone: "neutral" },
      { id: "tab", label: t("브라우저 탭", "Browser tab"), sub: t("메모리 · 앱 코드", "Memory · app code"), tone: "local" },
      { id: "vault", label: t("암호화 보관함", "Encrypted vault"), sub: t("localStorage · AES-GCM", "localStorage · AES-GCM"), tone: "local" },
      { id: "provider", label: t("AI 공급자", "AI provider"), sub: t("내 계정으로 과금", "Billed to your account"), tone: "external" },
    ],
    messages: [
      {
        from: "user",
        to: "tab",
        label: t("키 입력 + 비용 정책 선택", "Enter key, pick cost policy"),
        note: t("기본: 이 탭의 메모리에만 둠", "Default: memory of this tab only"),
      },
      {
        from: "user",
        to: "tab",
        label: t("유료 폴백 허락(선택)", "Allow paid fallback (optional)"),
        note: t("기본값은 허락 안 함", "Default is not allowed"),
      },
      {
        from: "user",
        to: "tab",
        label: t("보관함에 저장(선택)", "Save to vault (optional)"),
        note: t("비밀번호 12자 이상, 저장하지 않음", "Password of 12+ characters, never stored"),
      },
      {
        from: "tab",
        to: "vault",
        label: t("PBKDF2 → AES-GCM 암호화", "Encrypt: PBKDF2 → AES-GCM"),
        note: t("310,000회 · 암호문만 기록", "310,000 rounds · ciphertext only"),
      },
      {
        from: "tab",
        to: "provider",
        label: t("요청 (쿠키 없음)", "Request (no cookies)"),
        note: t("credentials omit · redirect error", "credentials omit · redirect error"),
      },
      {
        from: "provider",
        to: "tab",
        label: t("응답", "Response"),
        style: "dashed",
        note: t("ToonStudio 서버를 지나지 않음", "Does not pass through ToonStudio's server"),
      },
      {
        from: "tab",
        to: "tab",
        label: t("잠금: 진행 중 요청 모두 취소", "Lock: abort all in-flight requests"),
        note: t("다른 탭 신호 · pagehide · 세션 종료", "Other-tab signal · pagehide · session end"),
      },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 클라우드 연결과 암호화 보관함", "AI settings · cloud connections and encrypted vault"),
      role: t(
        "키를 문서 메모리에 두고, 원하면 비밀번호로 암호화해 이 기기에 저장·잠금 해제·삭제합니다. 다른 탭에서 저장소 신호가 오면 잠급니다.",
        "Keeps keys in document memory and, if wanted, encrypts them with a password to save, unlock and delete on this device. A storage signal from another tab locks them.",
      ),
      paths: [
        "apps/web/src/shared/ai/user-ai-store.ts#persistUserAiVault",
        "apps/web/src/shared/ai/user-ai-crypto.ts#encryptUserAiVault",
        "apps/web/src/shared/ai/UnifiedAiSettings.tsx",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("텍스트·이미지 AI 호출 (내 키)", "Text and image AI calls (your key)"),
      role: t(
        "내 키로 공급자에게 직접 보냅니다. 쿠키·리다이렉트·리퍼러를 끄고, 응답 텍스트에 키 문자열이 보이면 가립니다.",
        "Sends straight to the provider with your key, with cookies, redirects and referrers turned off, and masks any key string that shows up in the answer.",
      ),
      paths: ["apps/web/src/shared/ai/user-ai-transport.ts#userAiFetch"],
      route: "/studio",
    },
    {
      feature: t("유료 폴백 허락 스위치", "Paid-fallback switch"),
      role: t(
        "allowPaidFallback의 기본값은 false입니다. 유료 키는 허락했거나 수동 모드로 고른 경로만 자동 후보가 됩니다.",
        "allowPaidFallback defaults to false. A paid key is an automatic candidate only if you allowed it or chose that route in manual mode.",
      ),
      paths: [
        "apps/web/src/shared/ai/user-ai-types.ts#DEFAULT_USER_AI_ROUTING",
        "apps/web/src/shared/ai/user-ai-store.ts#userAiAutomaticExternalConnectionsForCapability",
      ],
      route: "/settings/ai",
    },
    {
      feature: t("AI 3D 생성 (Hyper3D 키)", "AI 3D generation (Hyper3D key)"),
      role: t(
        "3D 키는 메모리에만 두고, 요청 헤더로 ToonStudio API를 거쳐 공급자에 전달합니다. 텍스트·이미지 직통과 다른 길입니다.",
        "The 3D key stays in memory and is passed through the ToonStudio API in a request header. This differs from the direct text and image path.",
      ),
      paths: [
        "apps/web/src/shared/ai/unified-ai-settings.ts",
        "apps/api/src/modules/studio-ai/studio-3d-generation.controller.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("보관함 암호화: PBKDF2 → AES-GCM", "Vault encryption: PBKDF2 → AES-GCM"),
      language: "ts",
      code: [
        "const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));",
        "",
        "// 비밀번호 → PBKDF2(SHA-256) → AES-GCM 키. 설정 JSON을 암호화해 문자열로 돌려준다.",
        "export async function encryptVault(json: string, passphrase: string): Promise<string> {",
        "  const enc = new TextEncoder();",
        "  const salt = crypto.getRandomValues(new Uint8Array(16));",
        "  const iv = crypto.getRandomValues(new Uint8Array(12));",
        '  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);',
        "  const key = await crypto.subtle.deriveKey(",
        '    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },',
        '    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);',
        "  const data = await crypto.subtle.encrypt(",
        '    { name: "AES-GCM", iv, additionalData: enc.encode("app-vault-v1") }, key, enc.encode(json));',
        "  return JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) });",
        "}",
      ].join("\n"),
      codeEn: [
        "const b64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));",
        "",
        "// Password -> PBKDF2 (SHA-256) -> AES-GCM key. Encrypts the settings JSON into a string.",
        "export async function encryptVault(json: string, passphrase: string): Promise<string> {",
        "  const enc = new TextEncoder();",
        "  const salt = crypto.getRandomValues(new Uint8Array(16));",
        "  const iv = crypto.getRandomValues(new Uint8Array(12));",
        '  const material = await crypto.subtle.importKey("raw", enc.encode(passphrase), "PBKDF2", false, ["deriveKey"]);',
        "  const key = await crypto.subtle.deriveKey(",
        '    { name: "PBKDF2", salt, iterations: 310_000, hash: "SHA-256" },',
        '    material, { name: "AES-GCM", length: 256 }, false, ["encrypt"]);',
        "  const data = await crypto.subtle.encrypt(",
        '    { name: "AES-GCM", iv, additionalData: enc.encode("app-vault-v1") }, key, enc.encode(json));',
        "  return JSON.stringify({ salt: b64(salt), iv: b64(iv), data: b64(new Uint8Array(data)) });",
        "}",
      ].join("\n"),
      explain: t(
        "encryptUserAiVault를 줄인 예제입니다. 비밀번호에서 키를 늘려 만들고(PBKDF2), 변조까지 잡아 주는 AES-GCM으로 설정 JSON을 암호화합니다. 소금(salt)과 IV는 매번 무작위이고, 비밀번호 자체는 어디에도 남기지 않습니다. 실제 코드는 길이 검사와 복호화 함수도 가집니다.",
        "A trimmed encryptUserAiVault. It stretches the password into a key (PBKDF2) and encrypts the settings JSON with AES-GCM, which also detects tampering. The salt and IV are random each time, and the password itself is kept nowhere. The real code also has length checks and a decrypt function.",
      ),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("내 키로 보내는 fetch 옵션", "Fetch options for sending with your key"),
      language: "ts",
      code: [
        "// 내 키로 공급자에게 직접 보낼 때의 옵션(단순화). 쿠키·리다이렉트·리퍼러를 모두 끈다.",
        "export async function sendWithMyKey(url: string, key: string, body: unknown, signal: AbortSignal): Promise<Response> {",
        '  const headers = new Headers({ "Content-Type": "application/json" });',
        '  headers.delete("Cookie"); // 사이트 쿠키는 공급자로 가지 않는다',
        '  headers.delete("X-User-Id");',
        '  headers.set("Authorization", `Bearer ${key}`);',
        "  return fetch(url, {",
        '    method: "POST",',
        "    headers,",
        "    body: JSON.stringify(body),",
        "    signal,",
        '    credentials: "omit", // 쿠키 전송 금지',
        '    redirect: "error", // 다른 주소로 새어 나가는 리다이렉트 금지',
        '    referrerPolicy: "no-referrer",',
        '    cache: "no-store",',
        "  });",
        "}",
      ].join("\n"),
      codeEn: [
        "// Options for sending straight to the provider with your key (simplified). Cookies, redirects and referrers are all off.",
        "export async function sendWithMyKey(url: string, key: string, body: unknown, signal: AbortSignal): Promise<Response> {",
        '  const headers = new Headers({ "Content-Type": "application/json" });',
        '  headers.delete("Cookie"); // site cookies never reach the provider',
        '  headers.delete("X-User-Id");',
        '  headers.set("Authorization", `Bearer ${key}`);',
        "  return fetch(url, {",
        '    method: "POST",',
        "    headers,",
        "    body: JSON.stringify(body),",
        "    signal,",
        '    credentials: "omit", // never send cookies',
        '    redirect: "error", // never follow a redirect to another address',
        '    referrerPolicy: "no-referrer",',
        '    cache: "no-store",',
        "  });",
        "}",
      ].join("\n"),
      explain: t(
        "userAiFetch의 전송 옵션만 남긴 예제입니다. 사이트 쿠키와 사용자 식별 헤더를 지우고, 리다이렉트를 오류로 만들어 키가 엉뚱한 주소로 새지 않게 합니다. 실제 코드는 여기에 연결 검증, 예산 예약, 80MiB 응답 상한, 키 마스킹을 더합니다.",
        "Only the transport options of userAiFetch remain. Site cookies and the user-id header are removed, and redirects become errors so the key cannot leak to a stray address. The real code adds connection checks, budget reservation, an 80 MiB response cap and key masking.",
      ),
      source: "apps/web/src/shared/ai/user-ai-transport.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · SubtleCrypto.deriveKey()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/deriveKey",
      kind: "docs",
      note: t("PBKDF2로 비밀번호에서 키를 만드는 표준 API", "The standard API for deriving a key from a password with PBKDF2"),
    },
    {
      title: "MDN · SubtleCrypto.encrypt() (AES-GCM)",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/encrypt",
      kind: "docs",
    },
    {
      title: "OWASP · Password Storage Cheat Sheet",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html",
      kind: "guide",
      note: t("PBKDF2 반복 횟수 권고를 확인하는 곳", "Where to check the PBKDF2 iteration recommendation"),
    },
    {
      title: "MDN · Request.credentials",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Request/credentials",
      kind: "docs",
    },
    {
      title: "MDN · CSP connect-src",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src",
      kind: "docs",
      note: t("브라우저가 어느 주소로 연결할 수 있는지 정하는 규칙", "The rule that decides which addresses the browser may connect to"),
    },
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "cost-engineering"],
  talk: {
    pitch: t(
      "BYOK는 '내 열쇠를 가져온다'는 뜻입니다. 키는 기본적으로 이 탭의 메모리에만 있고, 저장하려면 비밀번호로 암호화해서 이 기기에만 둡니다. 요청은 쿠키 없이 내 브라우저에서 AI 공급자로 곧바로 가며 ToonStudio 서버를 지나지 않습니다. 돈이 드는 키는 설정에서 내가 허락해야 자동 순서에 들어오므로, 모르는 사이에 요금이 나가는 일을 막습니다.",
      "BYOK means bringing your own key. By default the key lives only in this tab's memory, and saving it means encrypting it with a password on this device only. Requests go without cookies from your browser straight to the AI provider and do not pass through ToonStudio's server. A key that costs money enters the automatic order only when you allow it in settings, which prevents charges you did not expect.",
    ),
    analogy: t(
      "호텔 금고에 맡기지 않고 내 주머니에 열쇠를 두는 것입니다. 서비스가 열쇠를 가진 적이 없으니 서비스가 잃어버릴 열쇠도 없습니다.",
      "It is keeping the key in your pocket instead of the hotel safe. The service never held the key, so there is no key for it to lose.",
    ),
    questions: [
      {
        question: t("키가 서버에 저장되나요?", "Is the key stored on a server?"),
        answer: t(
          "텍스트·이미지용 개인 키는 서버로 보내지 않고 브라우저에서 공급자로 직접 갑니다. 예외로 3D(Hyper3D) 키는 요청 헤더로 API를 거쳐 공급자에게 전달되고, LoRA 학습의 fal 키는 현재 탭 sessionStorage에 따로 둡니다.",
          "Personal keys for text and images are not sent to our server; they go from the browser straight to the provider. As exceptions, the 3D (Hyper3D) key travels through the API in a request header, and the fal key for LoRA training is kept in the current tab's sessionStorage.",
        ),
      },
      {
        question: t("암호화는 충분히 안전한가요?", "Is the encryption strong enough?"),
        answer: t(
          "PBKDF2(SHA-256) 310,000회와 AES-GCM-256이고 비밀번호는 저장하지 않습니다. 다만 반복 횟수는 OWASP의 현행 권고(600,000회)보다 낮아 올릴 여지가 있고, 같은 출처에 XSS가 있으면 메모리의 키도 위험하므로 엄격한 CSP가 전제입니다.",
          "It uses PBKDF2 (SHA-256) with 310,000 rounds and AES-GCM-256, and the password is never stored. The round count is below OWASP's current recommendation (600,000), so it could be raised, and an XSS in the same origin would endanger even in-memory keys, so a strict CSP is assumed.",
        ),
      },
      {
        question: t("유료 키가 있으면 한도가 끝날 때 자동으로 쓰이나요?", "If I have a paid key, is it used automatically when the free limit ends?"),
        answer: t(
          "아니요. allowPaidFallback의 기본값은 꺼짐입니다. 설정에서 켜거나 수동 모드로 그 경로를 직접 고를 때만 후보가 됩니다.",
          "No. allowPaidFallback is off by default. A paid key becomes a candidate only when you turn it on in settings or pick that route in manual mode.",
        ),
      },
    ],
    pitfall: t(
      "'모든 키가 서버를 거치지 않는다'고 말하면 3D 키 때문에 틀립니다. 또 운영 CSP connect-src에 허용된 AI 호스트는 api.openai.com·openrouter.ai·api.z.ai·api.deepseek.com뿐이라, Gemini·Groq 등 다른 무료 프리셋의 브라우저 직통 호출이 운영에서 막히는지는 실브라우저로 확인하지 못했습니다(미확인, 정적 대조만).",
      "Saying 'no key ever touches our server' is wrong because of the 3D key. Also, the only AI hosts allowed in the production CSP connect-src are api.openai.com, openrouter.ai, api.z.ai and api.deepseek.com, so whether direct browser calls to other free presets such as Gemini or Groq are blocked in production was not checked in a real browser (unverified; static comparison only).",
    ),
  },
  technologies: ["Web Crypto API", "PBKDF2", "AES-GCM", "BYOK"],
  facts: [
    {
      value: "310,000",
      label: t("보관함 PBKDF2 반복 횟수", "Vault PBKDF2 iterations"),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
    },
    {
      value: "12~1,024",
      label: t("보관함 비밀번호 길이(글자 수)", "Vault password length (characters)"),
      source: "apps/web/src/shared/ai/user-ai-crypto.ts",
    },
    {
      value: "false",
      label: t("allowPaidFallback 기본값", "allowPaidFallback default"),
      source: "apps/web/src/shared/ai/user-ai-types.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const FREE_AI_PROVIDER_ALLOWLIST: EngineeringAtlasEntry = {
  id: "free-ai-provider-allowlist",
  category: "ai",
  name: "Provider allowlist",
  title: t("무료로 인정하는 공급자 목록", "The list of providers counted as free"),
  status: "configured",
  tagline: t(
    "주소·경로·모델이 목록과 정확히 같아야 '무료'로 인정하고, 운영자가 확인해야 공유 풀에 들어옵니다.",
    "Address, path and model must match the list exactly to count as free, and an operator must confirm before a provider joins the pool.",
  ),
  background: [
    t(
      "쿠폰이 통하는 메뉴가 정해진 무료 음료 쿠폰을 떠올려 보세요. 'OpenAI 호환'이라는 공통 요청 규격 덕분에 AI 공급자는 주소·키·모델 이름 세 가지로 갈아 끼울 수 있습니다. 하지만 그중 무엇이 '무료'인지는 공급자 약관에 달려 있어서 코드가 이름만 보고 믿을 수 없습니다. 그래서 검토한 공급자의 정확한 주소와 무료 모델만 목록에 올리고, 목록에 없는 조합은 '무료'로 인정하지 않습니다.",
      "Picture a free-drink coupon that works only for listed menu items. Thanks to a shared request format called 'OpenAI-compatible', an AI provider can be swapped using three things: an address, a key and a model name. But which of them is actually free depends on the provider's terms, so code cannot trust a name alone. Only the exact addresses and free models of providers that were reviewed go on the list, and any combination not on it is not counted as free.",
    ),
    t(
      "목록은 두 곳에 있습니다. 브라우저(내 키)는 호스트 8곳의 정확한 OpenAI 호환 경로(2026-09-16 검토)를 갖고, 포트가 붙거나 경로가 다르면 거부합니다. Qwen(베이징 워크스페이스)·Z.AI·SiliconFlow는 무료 모델 이름까지 목록으로 확인하고 OpenRouter는 openrouter/free 또는 :free 모델만 허용합니다. 서버 공유 풀은 공급자 9곳이 기본 순서로 놓이며, 한 곳이 '준비됨'이려면 풀 스위치·서버 키·운영자 확인(CONFIRMED)이 모두 있어야 하고 Qwen·Z.AI·SiliconFlow·Cloudflare·OpenRouter는 모델까지 무료 목록 안이어야 합니다.",
      "The list lives in two places. In the browser (your own key) it holds the exact OpenAI-compatible paths of eight hosts (reviewed 2026-09-16) and rejects a port or a different path. For Qwen (Beijing workspace), Z.AI and SiliconFlow it also checks the free model names, and OpenRouter allows only openrouter/free or :free models. The shared server pool lines up nine providers in a default order; a provider is 'ready' only when the pool switch, a server key and operator confirmation (CONFIRMED) are all present, and for Qwen, Z.AI, SiliconFlow, Cloudflare and OpenRouter the model must also be on the free list.",
    ),
    t(
      "대안은 공급자 약관을 사람이 알아서 지키게 두는 것인데, 약관은 바뀌고 실수는 곧 요금입니다. 모든 호출을 게이트웨이 하나에 맡기는 길은 그 서비스에 묶입니다. 그래서 목록을 코드에 두고 검토일을 적는 방식을 골랐습니다. 순서는 요청의 사용자 순서, 배포 설정 순서, 기본 순서를 차례로 합쳐 중복을 없앱니다. 무료 티어는 입력을 제품 개선에 쓸 수 있는 곳도 있어, 공급자마다 데이터 약관 표식(training·no-training·varies·unconfirmed, 2026-10-06 검토)을 상태 응답에 담습니다.",
      "One alternative is to trust people to follow provider terms, but terms change and a slip becomes a bill. Another is to hand every call to one gateway, which ties you to that service. So the list lives in code with a review date. The order merges the request's user order, the deployment order and the default order, dropping duplicates. Some free tiers may use inputs to improve their products, so each provider carries a data-terms badge (training, no-training, varies, unconfirmed; reviewed 2026-10-06) in the status response.",
    ),
    t(
      "한계와 공백도 있습니다. 데이터 약관 표식은 API 응답과 웹 타입까지만 있고 화면에서 그리는 컴포넌트는 저장소에서 찾지 못했습니다. 풀에 등록된 전사·비전·이미지·임베딩 능력은 상태에만 나타나고 실제로 호출하는 컨트롤러는 없습니다. 모델 이름은 공급자 사정으로 바뀔 수 있어 사람이 주기적으로 다시 검토해야 합니다.",
      "There are limits and gaps. The data-terms badge exists only in the API response and the web types; no component that renders it was found in the repository. The transcription, vision, image and embedding capabilities registered for the pool appear only in the status response, with no controller that actually calls them. Model names can change with provider decisions, so a person must review them periodically.",
    ),
  ],
  keyPoints: [
    t("주소·경로·모델이 목록과 정확히 같아야 '무료'로 인정", "Address, path and model must match the list exactly to count as free"),
    t("서버 풀은 스위치·키·운영자 확인이 모두 있어야 준비됨", "A server provider is ready only with switch, key and operator confirmation"),
    t("공급자별 데이터 약관 표식을 상태 응답에 담음(2026-10-06)", "Each provider carries a data-terms badge in the status response (2026-10-06)"),
    t("자동 무료 길은 텍스트 전용, 이미지·3D는 명시적 BYOK", "The automatic free route is text-only; images and 3D need explicit BYOK"),
  ],
  diagram: {
    id: "free-ai-provider-allowlist-diagram",
    kind: "layers",
    title: t("요청이 만나는 허용 목록 층", "The allowlist layers a request meets"),
    caption: t(
      "두 문턱을 모두 통과한 조합만 '무료'로 인정됩니다. 하나라도 비어 있으면 그 공급자는 후보가 되지 않습니다.",
      "Only combinations that clear both gates count as free. If anything is missing, that provider is not a candidate.",
    ),
    alt: t(
      "위에서 아래로 설정 화면, 브라우저 문턱, 서버 공유 풀 문턱, 공급자 9곳이 쌓여 있습니다. 브라우저 문턱은 비용 정책 4종과 호스트·경로·모델 목록을, 서버 문턱은 풀 스위치와 서버 키와 운영자 확인과 무료 모델 확인을 봅니다.",
      "From top to bottom: the settings screen, the browser gate, the shared server-pool gate and nine providers. The browser gate checks four cost policies plus host, path and model lists; the server gate checks the pool switch, a server key, operator confirmation and the free-model check.",
    ),
    layers: [
      {
        id: "settings",
        label: t("설정 화면", "Settings screen"),
        sub: t("프리셋 11종 중 고르고 키를 넣음", "Pick one of 11 presets and add a key"),
        tone: "local",
        chips: ["11 presets", "API key"],
      },
      {
        id: "browser-gate",
        label: t("브라우저 문턱 (내 키)", "Browser gate (your key)"),
        sub: t("비용 정책 4종 · 호스트·경로·모델 허용 목록", "Four cost policies · host, path and model allowlists"),
        tone: "local",
        chips: ["unverified", "provider-free-tier", "openrouter-free", "user-funded-byok"],
      },
      {
        id: "server-gate",
        label: t("서버 공유 풀 문턱", "Shared server-pool gate"),
        sub: t("풀 스위치 · 서버 키 · 운영자 확인 · 무료 모델", "Pool switch · server key · operator sign-off · free model"),
        tone: "server",
        chips: ["POOL_ENABLED", "API key", "CONFIRMED", "model check"],
      },
      {
        id: "providers",
        label: t("공급자 9곳 (기본 순서)", "Nine providers (default order)"),
        sub: t("나머지: Cloudflare·OpenRouter·SiliconFlow", "The rest: Cloudflare·OpenRouter·SiliconFlow"),
        tone: "external",
        chips: ["Gemini", "Qwen", "Groq", "SambaNova", "Z.AI", "Mistral"],
      },
    ],
    brackets: [
      {
        label: t("여기서 걸러져야 '무료'", "Must clear these to count as free"),
        layerIds: ["browser-gate", "server-gate"],
      },
    ],
  },
  usage: [
    {
      feature: t("AI 설정 · 공급자 프리셋 11종", "AI settings · 11 provider presets"),
      role: t(
        "프리셋마다 정확한 주소와 비용 정책이 정해져 있고, 키를 넣으면 호스트·경로·모델이 허용 목록과 같은지 먼저 확인합니다.",
        "Each preset fixes an exact address and cost policy, and once a key is added the host, path and model are first checked against the allowlist.",
      ),
      paths: ["apps/web/src/shared/ai/free-ai-policy.ts#FREE_AI_PRESETS"],
      route: "/settings/ai",
    },
    {
      feature: t("서버 공유 무료 풀", "Shared server free pool"),
      role: t(
        "공급자 9곳의 설정·무료 모델 확인·순서 합치기를 맡습니다. 준비된 공급자만 후보가 되고, 모두 비면 개인 무료 키를 안내합니다.",
        "Handles the settings, free-model checks and ordering of nine providers. Only ready providers become candidates, and an empty pool points users to a personal free key.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-provider.ts#resolveStudioAiProviders",
        "apps/api/src/modules/studio-ai/studio-ai-provider.test.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("공급자 상태 응답 (/studio-ai/status)", "Provider status response (/studio-ai/status)"),
      role: t(
        "준비 여부, 모델, 사용 순서, 하루 한도(UTC·실패 시 닫힘)와 공급자별 데이터 약관 표식을 내려 줍니다. 화면용 타입은 웹에 있습니다.",
        "Returns readiness, models, the order, the daily limits (UTC, fail-closed) and each provider's data-terms badge. The typed client for it lives in the web app.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai.controller.ts",
        "apps/web/src/shared/ai/free-ai-pool-status.ts",
      ],
    },
    {
      feature: t("AI 기능별 사용 가능 상태 보드", "AI capability status board"),
      role: t(
        "글·이미지·음악·음성·3D 등 8가지 능력이 사용 가능, 연결 필요, 현재 비활성 중 어느 상태인지 한 화면에 보여 줍니다.",
        "Shows on one screen whether each of eight capabilities, such as text, image, music, voice and 3D, is available, needs a connection or is currently off.",
      ),
      paths: [
        "apps/web/src/shared/ai/ai-capability-registry.ts#buildAiCapabilityRegistry",
        "apps/web/src/shared/ai/AiCapabilityStatusBoard.tsx",
      ],
      route: "/settings/ai",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("공유 풀의 순서와 '준비됨' 조건", "Pool order and the 'ready' condition"),
      language: "ts",
      code: [
        "// 서버 공유 풀: 사용자 순서 → 배포 순서 → 기본 순서 (중복 제거, 앞선 값 우선).",
        'const DEFAULTS = ["gemini", "qwen", "groq"] as const;',
        "type Id = (typeof DEFAULTS)[number];",
        "type Env = Record<string, string | undefined>;",
        "",
        "export const resolveOrder = (user: Id[], deploy: Id[]): Id[] =>",
        "  [...new Set<Id>([...user, ...deploy, ...DEFAULTS])];",
        "",
        "// 한 공급자가 '준비됨'이려면 풀 스위치 + 서버 키 + 운영자 확인(CONFIRMED)이 모두 필요하다.",
        "export function ready(id: Id, env: Env): boolean {",
        "  const name = id.toUpperCase();",
        '  return env.POOL_ENABLED === "true"',
        "    && Boolean(env[`${name}_API_KEY`]?.trim())",
        '    && env[`${name}_CONFIRMED`] === "true";',
        "}",
      ].join("\n"),
      codeEn: [
        "// Shared server pool: user order -> deployment order -> default order (deduplicated, earlier wins).",
        'const DEFAULTS = ["gemini", "qwen", "groq"] as const;',
        "type Id = (typeof DEFAULTS)[number];",
        "type Env = Record<string, string | undefined>;",
        "",
        "export const resolveOrder = (user: Id[], deploy: Id[]): Id[] =>",
        "  [...new Set<Id>([...user, ...deploy, ...DEFAULTS])];",
        "",
        "// A provider is 'ready' only with the pool switch + a server key + operator confirmation (CONFIRMED).",
        "export function ready(id: Id, env: Env): boolean {",
        "  const name = id.toUpperCase();",
        '  return env.POOL_ENABLED === "true"',
        "    && Boolean(env[`${name}_API_KEY`]?.trim())",
        '    && env[`${name}_CONFIRMED`] === "true";',
        "}",
      ].join("\n"),
      explain: t(
        "resolveStudioAiProviderOrder와 freeProviderConfig의 핵심을 합쳐 줄인 예제입니다. 순서는 Set으로 중복을 없애며 앞선 값이 이기고, 준비됨 판정은 세 조건의 AND입니다. 실제 이름은 STUDIO_AI_FREE_*_API_KEY, STUDIO_AI_FREE_*_CONFIRMED처럼 공급자별로 다릅니다.",
        "A combined, trimmed version of resolveStudioAiProviderOrder and freeProviderConfig. A Set removes duplicates with earlier entries winning, and readiness is the AND of three conditions. The real variable names differ per provider, such as STUDIO_AI_FREE_*_API_KEY and STUDIO_AI_FREE_*_CONFIRMED.",
      ),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("호스트별 무료 모델 허용 목록", "Per-host free-model allowlist"),
      language: "ts",
      code: [
        "// 호스트별 '무료 모델' 허용 목록: 목록 밖 모델은 무료 경로에서 거부한다(단순화).",
        "const FREE_MODELS: Record<string, ReadonlySet<string>> = {",
        '  "api.z.ai": new Set(["glm-4.7-flash", "glm-4.5-flash"]),',
        '  "api.siliconflow.cn": new Set(["thudm/glm-z1-9b-0414"]),',
        "};",
        "",
        "export function modelIssue(hostname: string, model: string): string | null {",
        "  const allowed = FREE_MODELS[hostname];",
        "  if (!allowed) return null; // 이 예제는 목록이 없는 호스트를 검사하지 않는다",
        '  return allowed.has(model.trim().toLowerCase()) ? null : "무료 허용 목록에 없는 모델";',
        "}",
      ].join("\n"),
      codeEn: [
        "// Per-host free-model allowlist: a model outside the list is rejected on a free route (simplified).",
        "const FREE_MODELS: Record<string, ReadonlySet<string>> = {",
        '  "api.z.ai": new Set(["glm-4.7-flash", "glm-4.5-flash"]),',
        '  "api.siliconflow.cn": new Set(["thudm/glm-z1-9b-0414"]),',
        "};",
        "",
        "export function modelIssue(hostname: string, model: string): string | null {",
        "  const allowed = FREE_MODELS[hostname];",
        "  if (!allowed) return null; // this sketch does not check hosts that have no list",
        '  return allowed.has(model.trim().toLowerCase()) ? null : "model not on the free allowlist";',
        "}",
      ].join("\n"),
      explain: t(
        "reviewedProviderModelIssue의 구조를 보여 줍니다. 모델 이름은 공백을 걷고 소문자로 맞춰 비교하며, 목록 밖이면 호출 전에 막힙니다. 모델 이름은 공급자가 바꿀 수 있어 코드의 목록은 검토일과 함께 갱신해야 합니다.",
        "Shows the structure of reviewedProviderModelIssue. Model names are trimmed and lowercased before comparison, and anything off the list is blocked before the call. Providers can rename models, so the list in code must be refreshed along with its review date.",
      ),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "OpenRouter · Free models router",
      url: "https://openrouter.ai/docs/cookbook/get-started/free-models-router-playground",
      kind: "docs",
    },
    {
      title: "Cloudflare · Workers AI pricing",
      url: "https://developers.cloudflare.com/workers-ai/platform/pricing/",
      kind: "docs",
      note: t("무료 할당과 과금 방식은 이 문서에서 확인", "Check free allowance and billing here"),
    },
    {
      title: "Hugging Face · Inference Providers",
      url: "https://huggingface.co/docs/inference-providers/index",
      kind: "docs",
    },
    {
      title: "Groq · Rate limits",
      url: "https://console.groq.com/docs/rate-limits",
      kind: "docs",
    },
    {
      title: "Google AI · Gemini API pricing",
      url: "https://ai.google.dev/gemini-api/docs/pricing",
      kind: "docs",
      note: t("무료 티어의 조건은 공급자가 바꿀 수 있어 날짜와 함께 읽습니다", "Free-tier terms can change, so read them with their date"),
    },
  ],
  chapterIds: ["free-ai-routing", "ai-routing", "cost-engineering"],
  talk: {
    pitch: t(
      "무료라고 적혀 있다고 다 믿지 않습니다. 검토한 공급자의 정확한 주소와 무료 모델 이름만 목록에 올려 두고, 목록에 없으면 '무료'로 인정하지 않습니다. 서버 공유 풀에서는 공급자 9곳이 기본 순서로 놓이지만, 풀 스위치와 서버 키와 운영자 확인이 모두 있어야 준비됨이 됩니다. 저장소 기준으로 이 확인이 비어 있어 지금은 '설정 필요' 상태라고 말씀드립니다.",
      "We do not trust something just because it says free. Only the exact addresses and free model names of providers we reviewed go on the list, and anything else is not counted as free. In the shared pool nine providers are lined up in a default order, but a provider is ready only with the pool switch, a server key and operator confirmation. By the repository's own settings those confirmations are still missing, so today it is in a 'setup required' state.",
    ),
    analogy: t(
      "쿠폰이 통하는 메뉴가 정해진 무료 음료 쿠폰과 같습니다. 쿠폰에 적힌 메뉴가 아니면 계산대에서 거절됩니다.",
      "It is like a free-drink coupon valid only for listed menu items: anything else is refused at the register.",
    ),
    questions: [
      {
        question: t("공급자 9곳이 지금 다 켜져 있나요?", "Are all nine providers on right now?"),
        answer: t(
          "아니요. 저장소 기준(render.yaml)으로 풀 스위치만 켜져 있고 운영 확인과 키는 설정 대기입니다. 운영 대시보드의 실제 값은 이 저장소에서 확인할 수 없습니다.",
          "No. Per the repository (render.yaml) only the pool switch is on, and operator confirmation and keys wait to be set. The actual values in the production dashboard cannot be checked from this repository.",
        ),
      },
      {
        question: t("내 데이터가 학습에 쓰이나요?", "Is my data used for training?"),
        answer: t(
          "공급자마다 다릅니다. 코드는 Gemini·Mistral을 학습 사용 가능(training), Groq를 비사용(no-training), OpenRouter를 가변(varies), 나머지는 미확인(unconfirmed)으로 표시합니다(2026-10-06 검토). 다만 이 표식을 화면에서 보여 주는 컴포넌트는 아직 없습니다.",
          "It differs by provider. The code marks Gemini and Mistral as training, Groq as no-training, OpenRouter as varies and the rest as unconfirmed (reviewed 2026-10-06). But there is no component yet that shows this badge on screen.",
        ),
      },
      {
        question: t("허용 목록은 누가 관리하나요?", "Who maintains the allowlist?"),
        answer: t(
          "사람이 공식 문서를 확인해 코드에 올리고 검토일을 남깁니다. 공급자 정책이 바뀌면 다시 검토해야 하는 유지 비용이 있습니다.",
          "A person checks the official documents, puts the result in code and records the review date. It carries a maintenance cost because it must be reviewed again whenever a provider changes its policy.",
        ),
      },
    ],
    pitfall: t(
      "슬라이드에서 '9개 공급자가 운영 중'이라고 말하면 안 됩니다. 정확히는 '9곳을 지원하는 코드와 게이트가 있고, 운영 확인·키는 설정 대기'입니다. 데이터 약관 표식이 화면에 표시된다고 말하는 것도 오류입니다.",
      "Do not say 'nine providers are running' on a slide. The accurate version is that code and gates for nine providers exist while operator confirmation and keys wait to be set. Claiming the data-terms badge is shown on screen would also be wrong.",
    ),
  },
  technologies: ["OpenAI-compatible API", "OpenRouter", "Cloudflare Workers", "Allowlist"],
  facts: [
    {
      value: "8",
      label: t("정확한 경로를 검토한 공급자 호스트 수(2026-09-16)", "Provider hosts with reviewed exact paths (2026-09-16)"),
      source: "apps/web/src/shared/ai/free-ai-policy.ts",
    },
    {
      value: "9",
      label: t("서버 공유 풀의 공급자 수", "Providers in the shared server pool"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
    {
      value: "2026-10-06",
      label: t("데이터 약관 표식 검토일(코드 주석)", "Data-terms badge review date (code comment)"),
      source: "apps/api/src/modules/studio-ai/studio-ai-provider.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_GATES: readonly EngineeringAtlasEntry[] = [
  BYOK_PAID_APPROVAL_GATE,
  FREE_AI_PROVIDER_ALLOWLIST,
];
