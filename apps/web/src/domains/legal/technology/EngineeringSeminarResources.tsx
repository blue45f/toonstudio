import { ExternalLink } from "lucide-react";

import { ENGINEERING_GLOSSARY_TERM_COUNT } from "./engineering-glossary-count";

import Link from "@/shared/navigation/router-link";
import { formatI18nTemplate, translateBilingualValueForActiveLocale, useBilingualI18nRevision } from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo => translateBilingualValueForActiveLocale("EngineeringSeminarResources", ko, en);

/**
 * 공식 문서와 외부 참고 링크이다. 링크가 있다는 이유로 제품 연동 완료를 주장하지 않는다.
 * 링크는 2026-10-08에 접속을 점검했다(GitHub 저장소는 이 점검 환경에서 403으로 막혀 같은 날 앞선 점검 기록으로 대신했다).
 * 항목: [분류, 이름, 주소, 한국어 설명, 영어 설명] — 이름은 목록 안에서 겹치지 않아야 한다(React key).
 */
const SEMINAR_RESOURCES = [
  ["3D", "Three.js", "https://threejs.org/docs/", "장면·카메라·재질·렌더링 API", "Scene, camera, material and rendering APIs"],
  ["3D", "React Three Fiber · Drei", "https://r3f.docs.pmnd.rs/getting-started/introduction", "React에서 3D 장면을 구성하는 방법", "Constructing 3D scenes in React"],
  ["3D", "Babylon.js", "https://doc.babylonjs.com/", "3D 런타임과 기능별 공식 가이드", "Official guides to the 3D runtime and capabilities"],
  ["3D", "Rapier", "https://rapier.rs/docs/", "물리 세계·충돌·강체의 기초", "Physics worlds, collision and rigid bodies"],
  ["3D", "VRM · three-vrm", "https://github.com/pixiv/three-vrm", "캐릭터 모델 구조와 런타임 호환성", "Character structure and runtime compatibility"],
  ["3D", "glTF Transform", "https://gltf-transform.dev/", "glTF 자산의 변환·검사·최적화", "Transforming, inspecting and optimizing glTF assets"],
  ["3D", "Meshoptimizer", "https://github.com/zeux/meshoptimizer", "메시 최적화의 목적과 제약", "Mesh optimization and its constraints"],
  ["3D", "Blender Manual", "https://docs.blender.org/manual/en/latest/", "모델링·리깅·재질·장면 제작의 배경 지식", "Background knowledge on modeling, rigging, materials and scenes"],
  ["3D", "WebXR Device API · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/WebXR_Device_API", "VR·AR 세션을 여는 표준 · 실제 헤드셋 동작은 별도 확인", "The standard for opening VR and AR sessions; verify headset behavior separately"],
  ["DRAWING", "perfect-freehand", "https://github.com/steveruizok/perfect-freehand", "압력 입력을 선의 외곽으로 만드는 과정", "Creating stroke outlines from pressure samples"],
  ["DRAWING", "Google Ink", "https://github.com/google/ink", "잉크 입력과 스트로크 표현 · 확정 획에는 연결되지 않고 예측 꼬리 미리보기에만 연결", "Ink input and stroke representation; wired only into the predicted-tail preview, not committed strokes"],
  ["DRAWING", "Paper.js", "https://paperjs.org/tutorials/", "벡터 경로·곡선·기하 연산", "Vector paths, curves and geometry operations"],
  ["DRAWING", "p5.brush", "https://github.com/acamposuribe/p5.brush", "브러시와 자연매체 표현의 구현 예시", "Brush and natural-media implementation examples"],
  ["DRAWING", "CanvasKit / Skia", "https://skia.org/docs/user/modules/canvaskit/", "Skia의 웹·WASM 렌더링 경로", "Skia rendering on the web through WASM"],
  ["DRAWING", "Konva", "https://konvajs.org/docs/", "캔버스 객체·레이어·이벤트 조작", "Canvas objects, layers and event handling"],
  ["INPUT", "Pointer Events · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events", "마우스·펜·터치를 한 이벤트 모델로 다루는 방법", "Handling mouse, pen and touch with one event model"],
  ["INPUT", "HTML Drag and Drop · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/HTML_Drag_and_Drop_API", "브라우저 표준 끌어 놓기의 이벤트 흐름과 한계", "The event flow and limits of the browser's standard drag and drop"],
  ["INPUT", "WCAG 2.2 Dragging Movements", "https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements.html", "끌기 동작에 끌지 않는 대안을 두라는 접근성 기준", "The accessibility criterion asking for a non-dragging alternative to drag gestures"],
  ["LOCAL", "OPFS · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system", "사이트 전용 파일 공간과 보존 한계", "Origin-private file storage and persistence limits"],
  ["LOCAL", "OPFS · web.dev", "https://web.dev/articles/origin-private-file-system", "OPFS의 사용 패턴과 동기 접근 핸들", "OPFS usage patterns and synchronous access handles"],
  ["LOCAL", "Persistent storage · web.dev", "https://web.dev/articles/persistent-storage", "저장소 보존 요청과 쿼터가 뜻하는 것", "Requesting persistence and what storage quota means"],
  ["LOCAL", "SQLite WASM", "https://sqlite.org/wasm/doc/trunk/index.md", "브라우저 SQLite와 저장 방식", "Browser SQLite and storage backends"],
  ["LOCAL", "Web Workers · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers", "메인 스레드에서 작업을 분리하는 방법", "Moving work off the main thread"],
  ["LOCAL", "Service Worker · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", "캐시와 업데이트 수명주기", "Caching and update lifecycle"],
  ["LOCAL", "Web Locks · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API", "탭 사이에서 한 번에 한 곳만 쓰게 하는 잠금", "Locks that let only one tab write at a time"],
  ["LOCAL", "Cross-origin isolation · web.dev", "https://web.dev/articles/cross-origin-isolation-guide", "SharedArrayBuffer를 쓰기 위한 격리 조건", "The isolation conditions needed to use SharedArrayBuffer"],
  ["REALTIME", "WebRTC API · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API", "피어 연결·데이터 통로·미디어의 큰 그림", "Overview of peer connections, data channels and media"],
  ["REALTIME", "Perfect negotiation · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation", "양쪽이 동시에 협상을 걸 때 부딪힘을 푸는 표준 패턴", "The standard pattern for resolving collisions when both sides negotiate at once"],
  ["REALTIME", "WebRTC connectivity · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Connectivity", "ICE·STUN·TURN으로 연결 경로를 찾는 과정", "How ICE, STUN and TURN find a connection path"],
  ["REALTIME", "Cloudflare Realtime TURN", "https://developers.cloudflare.com/realtime/turn/", "중계(TURN) 서비스의 공식 문서 · 요금과 한도는 공급자 문서로 확인", "Official docs of a relay (TURN) service; check pricing and limits with the provider"],
  ["SPACE", "Phaser Scenes", "https://docs.phaser.io/phaser/concepts/scenes", "2D 게임 장면의 구성 단위", "The building unit of 2D game scenes"],
  ["SPACE", "Tiled JSON map format", "https://doc.mapeditor.org/en/stable/reference/json-map-format/", "타일 지도 데이터의 JSON 형식", "The JSON format of tile-map data"],
  ["AI", "ONNX Runtime Web", "https://onnxruntime.ai/docs/tutorials/web/", "로컬 추론의 실행 환경과 제약", "Local inference environments and constraints"],
  ["AI", "MediaPipe", "https://developers.google.com/edge/mediapipe/solutions/guide", "비전 모델과 작업별 파이프라인", "Vision models and task-specific pipelines"],
  ["AI", "Transformers.js", "https://huggingface.co/docs/transformers.js/index", "브라우저에서 모델을 실행하는 라이브러리 · 모델 파일 배치는 별도", "A library that runs models in the browser; model files must be placed separately"],
  ["WEB", "Speculation Rules · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Speculation_Rules_API", "다음 페이지를 미리 불러오거나 렌더하는 규칙 · 지원은 브라우저별 확인", "Rules that prefetch or prerender the next page; check support per browser"],
  ["WEB", "Baseline · web.dev", "https://web.dev/baseline", "새 웹 기능을 써도 되는 시점을 가늠하는 지원 기준", "A support signal for judging when a new web feature is safe to use"],
  ["WEB", "WebTransport · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API", "HTTP/3 기반 양방향 전송 · 서버 쪽 지원이 필요", "Bidirectional transport over HTTP/3; needs server-side support"],
  ["WORKFLOW", "Remotion Player", "https://www.remotion.dev/docs/player/player", "프레임·재생 제어·오디오의 동기화", "Frames, playback controls and audio synchronization"],
  ["WORKFLOW", "Model Context Protocol", "https://modelcontextprotocol.io/docs/2026-07-28/getting-started/intro", "AI 도구 연결의 개념과 보안 경계 · 주소에 문서 버전 날짜가 들어 있음", "AI tool connectivity and security boundaries; the address carries a documentation version date"],
  ["WORKFLOW", "AGENTS.md", "https://agents.md/", "AI 코딩 도구를 위한 저장소 지침 파일 형식", "A repository instruction file format for AI coding agents"],
  ["API", "OWASP SSRF Prevention", "https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html", "서버가 대신 요청을 보낼 때 지킬 방어 기본기", "Defense basics when a server makes requests on someone's behalf"],
  ["API", "OWASP API10 · Unsafe Consumption of APIs", "https://api-security.owasp.org/editions/2023/en/0xaa-unsafe-consumption-of-apis/", "외부 API 응답을 그대로 믿고 쓸 때의 위험", "The risk of trusting external API responses as they are"],
  ["API", "CSP connect-src · MDN", "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/connect-src", "브라우저가 접속할 수 있는 주소를 제한하는 정책", "A policy that limits which addresses the browser may connect to"],
  ["AUTH", "PKCE · RFC 7636", "https://datatracker.ietf.org/doc/html/rfc7636", "OAuth 인가 코드 가로채기를 막는 확인 값(PKCE)의 표준", "The standard for the proof value (PKCE) that blocks OAuth authorization-code interception"],
  ["OSS", "pnpm patch","https://pnpm.io/cli/patch", "설치된 패키지를 작은 패치로 고쳐 쓰는 방법", "Fixing an installed package with a small patch"],
  ["OSS", "SPDX License List", "https://spdx.org/licenses/", "라이선스 식별자의 표준 목록", "The standard list of license identifiers"],
  ["OSS", "Remotion License", "https://www.remotion.dev/docs/license", "Remotion 자체 라이선스 조건 · 사용 자격은 배포하는 쪽이 확인", "Remotion's own license terms; the distributor must check eligibility"],
  ["OSS", "CC BY-NC 4.0", "https://creativecommons.org/licenses/by-nc/4.0/", "비상업 조건이 붙는 라이선스의 요약 · 법률 판단은 별도", "Summary of a license with a non-commercial condition; legal judgment is separate"],
  ["SHARE", "Web Share API · MDN", "https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API", "기기의 공유 시트를 여는 API · 사용자 동작이 필요", "An API that opens the device share sheet; it needs a user gesture"],
  ["SHARE", "Open Graph protocol", "https://ogp.me/", "링크 미리보기에 쓰이는 메타 태그 규약", "The meta-tag convention behind link previews"],
  ["PLATFORM", "Cloudflare Workers Static Assets", "https://developers.cloudflare.com/workers/static-assets/", "정적 파일을 Worker 앞단에서 내려주는 방식 · 한도는 공급자 문서로 확인", "Serving static files in front of a Worker; check limits with the provider"],
  ["PLATFORM", "Cloudflare R2", "https://developers.cloudflare.com/r2/", "객체 저장소 공식 문서 · 한도는 공급자 문서로 확인", "Object storage docs; check limits with the provider"],
  ["PLATFORM", "Cloudflare Durable Objects", "https://developers.cloudflare.com/durable-objects/", "방 단위 실시간 상태를 맡는 객체 · 한도는 공급자 문서로 확인", "Objects that hold per-room realtime state; check limits with the provider"],
  ["REFERENCE", "OpenAI Image Generation", "https://developers.openai.com/api/docs/guides/image-generation", "외부 생성 API 참고 · 실제 연결·비용은 별도 확인", "External generation API reference; verify integration and costs separately"],
  ["REFERENCE", "Adobe Firefly", "https://www.adobe.com/products/firefly.html", "외부 이미지 생성 도구 참고 · 내장 연동을 의미하지 않음", "External image-generation reference; not a claim of embedded integration"],
  ["REFERENCE", "Poly Haven", "https://polyhaven.com/", "3D·재질·HDRI 자료 탐색 · 파일과 이용 조건 확인", "Discover 3D, material and HDRI assets; check files and usage terms"],
  ["REFERENCE", "ambientCG", "https://ambientcg.com/", "표면 재질 참고 · 사용 조건·크기·색 공간 확인", "Surface-material references; check terms, resolution and color space"],
] as const;

export function EngineeringSeminarResources({ query = "" }: { readonly query?: string }) {
  useBilingualI18nRevision();
  const normalized = query.normalize("NFKC").trim().toLocaleLowerCase();
  const resources = SEMINAR_RESOURCES.filter((item) => item.join(" ").toLocaleLowerCase().includes(normalized));
  return <section className="mt-8 rounded-3xl border border-line/70 bg-panel/60 p-5 sm:p-7" aria-labelledby="seminar-resource-title" id="seminar-resources">
    <p className="text-xs font-bold tracking-widest text-accent">{bi("발표 후 더 알아보기", "GO DEEPER AFTER THE TALK")}</p>
    <h2 id="seminar-resource-title" className="mt-3 text-2xl font-black text-fg">{bi("기술 공구함과 참고 자료", "Technology toolbox and references")}</h2>
    <p className="mt-3 text-sm leading-7 text-fg-2">{bi("공식 문서는 역할과 한계를 이해하는 자료입니다. 외부 참고 사이트는 내장 연동·사용 권리·오프라인 동작을 보장하지 않습니다. 현재 적용 상태는 각 슬라이드의 코드 근거와 기술 스토리에서 확인하세요.", "Official documentation explains roles and limitations. External references do not guarantee embedded integration, usage rights or offline availability. Inspect each slide's source evidence and engineering story for implementation status.")}</p>
    <details className="mt-5 rounded-2xl border border-line bg-card p-4" open={normalized ? true : undefined}>
      <summary className="cursor-pointer py-2 text-base font-bold text-fg">{bi("공식 문서·생성 도구·자산 사이트", "Documentation, generation tools and asset resources")} · {resources.length}</summary>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{resources.map(([category, name, href, ko, en]) => <li key={name} className="min-w-0 rounded-xl border border-line p-4" data-seminar-resource={category}>
        <span className="text-[0.65rem] font-bold tracking-wider text-fg-3">{category}</span>
        <a href={href} target="_blank" rel="noopener noreferrer" className="mt-2 flex min-h-11 items-center justify-between gap-2 break-words text-sm font-black text-accent">{name}<ExternalLink size={14} className="shrink-0" aria-hidden="true" /></a>
        <p className="mt-2 text-xs leading-6 text-fg-2">{bi(ko, en)}</p>
      </li>)}</ul>
      {resources.length === 0 ? <p className="mt-3 text-sm text-fg-3">{bi("검색어와 일치하는 추가 참고 자료가 없습니다.", "No additional resources match this query.")}</p> : null}
    </details>
    <p className="mt-4 text-sm leading-7 text-fg-2">
      {bi("발표 용어는 ", "Talk terms are explained with analogies in the ")}
      <Link href="/about/technology/glossary" className="font-bold text-accent hover:underline">
        {formatI18nTemplate(String(bi("용어집({value0}개)", "glossary ({value0} terms)")), { value0: ENGINEERING_GLOSSARY_TERM_COUNT })}
      </Link>
      {bi("에서 쉬운 비유와 실제 적용 위치로 설명합니다.", ", together with where each is used.")}
    </p>
  </section>;
}
