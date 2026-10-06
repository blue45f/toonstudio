/**
 * 기술·발표 자료가 이름으로 언급하는 외부 제품·라이브러리·표준의 공식 링크 레지스트리.
 *
 * 플레이북 벤치마크, 제작 스토리 챕터의 기술 칩, 발표 덱·세미나의 기술 스택 칩,
 * 참고 자료 카드가 모두 이 표 하나로 링크를 해결한다. 링크가 없는 이름은 내부 개념
 * (예: "Document authority")이거나 공식 주소를 확정하지 못한 항목이며, 그 경우 칩은
 * 링크 없는 텍스트로 남는다 — 주소를 지어내지 않는 것이 이 표의 원칙이다.
 *
 * 수록 근거 (2026-10-07 확인):
 * - 저장소 안 기록: EngineeringSeminarResources의 공식 문서 표, 필드노트의 ref(),
 *   ENGINEERING_REFERENCE_PRODUCTS의 url, docs/operations의 제품 비교 문서.
 * - 설치본 package.json의 homepage·repository (scripts/collect-engineering-licenses.mjs 수집값).
 * - 그 외에는 공식 도메인이 확실한 제품 홈페이지·MDN·표준 문서만 넣었다.
 * 의도적으로 링크를 걸지 않은 항목: KMAS(공식 주소를 저장소 기록으로 확정하지 못함),
 * CRDT·PWA 같은 일반 개념, 자체 제작물(Hokusai 등).
 */
export interface EngineeringExternalLink {
  readonly name: string;
  readonly url: string;
}

export const ENGINEERING_EXTERNAL_LINKS: readonly EngineeringExternalLink[] = [
  // 벤치마크·참고 제품 (플레이북 #benchmarks와 참고 자료 카드)
  { name: "Clip Studio Paint", url: "https://www.clipstudio.net/en/" },
  { name: "Krita", url: "https://krita.org/" },
  { name: "Photoshop", url: "https://www.adobe.com/products/photoshop.html" },
  { name: "Adobe Photoshop", url: "https://www.adobe.com/products/photoshop.html" },
  { name: "Procreate", url: "https://procreate.com/" },
  { name: "MediBang Paint", url: "https://medibangpaint.com/" },
  { name: "MediBang", url: "https://medibangpaint.com/" },
  { name: "Figma", url: "https://www.figma.com/" },
  { name: "Figma Slides", url: "https://www.figma.com/slides/" },
  { name: "tldraw", url: "https://tldraw.com/" },
  { name: "Magma", url: "https://magma.com/" },
  { name: "Excalidraw", url: "https://excalidraw.com/" },
  { name: "Spline", url: "https://spline.design/" },
  { name: "Blender", url: "https://www.blender.org/" },
  { name: "SketchUp", url: "https://www.sketchup.com/" },
  { name: "ACON3D", url: "https://www.acon3d.com/" },
  { name: "VRoid Studio", url: "https://vroid.com/en/studio" },
  { name: "MetaHuman", url: "https://www.metahuman.com/en-US" },
  { name: "Gather", url: "https://www.gather.town/" },
  { name: "Gather 2.0", url: "https://www.gather.town/" },
  { name: "WorkAdventure", url: "https://workadventu.re/" },
  { name: "Kumospace", url: "https://www.kumospace.com/" },
  { name: "Canva", url: "https://www.canva.com/" },
  { name: "Adobe Express", url: "https://www.adobe.com/express/" },
  { name: "Dia", url: "https://www.diabrowser.com/" },
  { name: "Browser Use Cloud", url: "https://docs.browser-use.com/cloud/quickstart" },
  { name: "Vercel AI Gateway", url: "https://vercel.com/docs/ai-gateway" },
  { name: "OpenRouter", url: "https://openrouter.ai/" },

  // 사용 라이브러리·엔진 (설치본 package.json homepage·repository와 저장소 기록 기준)
  { name: "Three.js", url: "https://threejs.org/" },
  { name: "React Three Fiber", url: "https://r3f.docs.pmnd.rs/" },
  { name: "React Three Fiber · Drei", url: "https://r3f.docs.pmnd.rs/" },
  { name: "Drei", url: "https://github.com/pmndrs/drei" },
  { name: "Babylon.js", url: "https://www.babylonjs.com/" },
  { name: "VRM", url: "https://vrm.dev/" },
  { name: "@pixiv/three-vrm", url: "https://github.com/pixiv/three-vrm" },
  { name: "OpenCascade.js", url: "https://github.com/donalffons/opencascade.js" },
  { name: "OpenCascade WASM", url: "https://github.com/donalffons/opencascade.js" },
  { name: "Manifold", url: "https://github.com/elalish/manifold" },
  { name: "Rhino3dm", url: "https://github.com/mcneel/rhino3dm" },
  { name: "xatlas", url: "https://github.com/jpcy/xatlas" },
  { name: "Blender MCP", url: "https://github.com/ahujasid/blender-mcp" },
  { name: "Blender bpy", url: "https://docs.blender.org/api/current/" },
  { name: "Helia", url: "https://github.com/ipfs/helia" },
  { name: "@helia/verified-fetch", url: "https://github.com/ipfs/helia-verified-fetch" },
  { name: "IPFS", url: "https://ipfs.tech/" },
  { name: "IPFS CID", url: "https://docs.ipfs.tech/concepts/content-addressing/" },
  { name: "multiformats", url: "https://github.com/multiformats/js-multiformats" },
  { name: "Phaser", url: "https://phaser.io/" },
  { name: "Phaser 3", url: "https://phaser.io/" },
  { name: "Yjs", url: "https://docs.yjs.dev/" },
  { name: "Socket.IO", url: "https://socket.io/" },
  { name: "NestJS", url: "https://nestjs.com/" },
  { name: "NestJS 11", url: "https://nestjs.com/" },
  { name: "React", url: "https://react.dev/" },
  { name: "TypeScript", url: "https://www.typescriptlang.org/" },
  { name: "Transformers.js", url: "https://github.com/huggingface/transformers.js" },
  { name: "@huggingface/transformers", url: "https://github.com/huggingface/transformers.js" },
  { name: "OPUS-MT ko→en", url: "https://huggingface.co/Xenova/opus-mt-ko-en" },
  { name: "OPUS-MT", url: "https://huggingface.co/Xenova/opus-mt-ko-en" },
  { name: "MediaPipe", url: "https://ai.google.dev/edge/mediapipe/solutions/guide" },
  { name: "MediaPipe Tasks Vision", url: "https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/web_js" },
  { name: "ONNX Runtime Web", url: "https://onnxruntime.ai/docs/tutorials/web/" },
  { name: "onnxruntime-web", url: "https://onnxruntime.ai/docs/tutorials/web/" },
  { name: "Remotion", url: "https://www.remotion.dev/" },
  { name: "Remotion Player", url: "https://www.remotion.dev/docs/player" },
  { name: "Rapier", url: "https://rapier.rs/" },
  { name: "CanvasKit", url: "https://skia.org/docs/user/modules/canvaskit/" },
  { name: "CanvasKit / Skia", url: "https://skia.org/docs/user/modules/canvaskit/" },
  { name: "CanvasKit (Skia)", url: "https://skia.org/docs/user/modules/canvaskit/" },
  { name: "Konva", url: "https://konvajs.org/docs/" },
  { name: "Konva / React Konva", url: "https://konvajs.org/docs/" },
  { name: "Paper.js", url: "https://paperjs.org/" },
  { name: "p5.brush", url: "https://github.com/acamposuribe/p5.brush" },
  { name: "perfect-freehand", url: "https://github.com/steveruizok/perfect-freehand" },
  { name: "Google Ink", url: "https://github.com/google/ink" },
  { name: "three-mesh-bvh", url: "https://github.com/gkjohnson/three-mesh-bvh" },
  { name: "three-bvh-csg", url: "https://github.com/gkjohnson/three-bvh-csg" },
  { name: "Mixbox", url: "https://scrtwpns.com/mixbox" },
  { name: "spectral.js", url: "https://github.com/rvanwijnen/spectral.js" },
  { name: "ThorVG", url: "https://www.thorvg.org/" },
  { name: "Vello", url: "https://github.com/linebender/vello" },
  { name: "OpenCV.js", url: "https://github.com/TechStark/opencv-js" },
  { name: "Zustand", url: "https://github.com/pmndrs/zustand" },
  { name: "glTF Transform", url: "https://gltf-transform.dev/" },
  { name: "Meshoptimizer", url: "https://github.com/zeux/meshoptimizer" },
  { name: "Playwright", url: "https://playwright.dev/" },
  { name: "@axe-core/playwright", url: "https://github.com/dequelabs/axe-core-npm" },
  { name: "Vitest", url: "https://vitest.dev/" },
  { name: "Testing Library", url: "https://testing-library.com/" },
  { name: "GitHub Actions", url: "https://docs.github.com/actions" },
  { name: "ESLint", url: "https://eslint.org/" },

  // 플랫폼·공급자·표준 문서
  { name: "Cloudflare", url: "https://www.cloudflare.com/" },
  { name: "Cloudflare Workers", url: "https://workers.cloudflare.com/" },
  { name: "Cloudflare Static Assets", url: "https://developers.cloudflare.com/workers/static-assets/" },
  { name: "Durable Objects", url: "https://developers.cloudflare.com/durable-objects/" },
  { name: "Cloudflare Durable Objects", url: "https://developers.cloudflare.com/durable-objects/" },
  { name: "Cloudflare Realtime TURN", url: "https://developers.cloudflare.com/realtime/" },
  { name: "Render", url: "https://render.com/" },
  { name: "Neon", url: "https://neon.tech/" },
  { name: "Neon PostgreSQL", url: "https://neon.tech/" },
  { name: "PostgreSQL", url: "https://www.postgresql.org/" },
  { name: "PostgreSQL / Neon", url: "https://www.postgresql.org/" },
  { name: "SQLite WASM", url: "https://sqlite.org/wasm/doc/trunk/index.md" },
  { name: "Poly Haven", url: "https://polyhaven.com/" },
  { name: "Poly Haven API", url: "https://polyhaven.com/" },
  { name: "Google Books", url: "https://books.google.com/" },
  { name: "Google Books API", url: "https://developers.google.com/books" },
  { name: "Wikimedia Commons", url: "https://commons.wikimedia.org/" },
  { name: "Google Drive", url: "https://developers.google.com/drive/api/guides/about-sdk" },
  { name: "Dropbox", url: "https://www.dropbox.com/developers" },
  { name: "OneDrive", url: "https://learn.microsoft.com/graph/onedrive-concept-overview" },
  { name: "Kakao SDK", url: "https://developers.kakao.com/" },
  { name: "MCP", url: "https://modelcontextprotocol.io/" },
  { name: "OAuth 2.0", url: "https://oauth.net/2/" },
  { name: "OAuth / OIDC", url: "https://oauth.net/2/" },
  { name: "OpenID Connect", url: "https://openid.net/connect/" },
  { name: "SPDX", url: "https://spdx.org/licenses/" },
  { name: "GLB", url: "https://www.khronos.org/gltf/" },
  { name: "GLB / glTF", url: "https://www.khronos.org/gltf/" },
  { name: "GLB/glTF", url: "https://www.khronos.org/gltf/" },
  { name: "KTX2", url: "https://github.com/KhronosGroup/KTX-Software" },
  { name: "WebAssembly", url: "https://webassembly.org/" },
  { name: "WASM", url: "https://webassembly.org/" },
  { name: "Rust / WASM", url: "https://www.rust-lang.org/" },
  { name: "Rust/WASM", url: "https://www.rust-lang.org/" },
  { name: "C++ / Emscripten", url: "https://emscripten.org/" },
  { name: "Open Graph", url: "https://ogp.me/" },
  { name: "openskp", url: "https://openskp.com/" },

  // 웹 플랫폼 API (MDN·W3C — 저장소에 이미 인용된 문서와 같은 출처)
  { name: "WebRTC", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API" },
  { name: "RTCDataChannel", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel" },
  { name: "RTCPeerConnection", url: "https://developer.mozilla.org/en-US/docs/Web/API/RTCPeerConnection" },
  { name: "WebGPU", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API" },
  { name: "Web Workers", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers" },
  { name: "Dedicated Worker", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Using_web_workers" },
  { name: "Service Worker", url: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API" },
  { name: "OPFS", url: "https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system" },
  { name: "IndexedDB", url: "https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API" },
  { name: "Web Locks", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API" },
  { name: "Pointer Events", url: "https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events" },
  { name: "OffscreenCanvas", url: "https://developer.mozilla.org/en-US/docs/Web/API/OffscreenCanvas" },
  { name: "Web Share API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Share_API" },
  { name: "Web App Manifest", url: "https://www.w3.org/TR/appmanifest/" },
  { name: "View Transitions", url: "https://developer.mozilla.org/en-US/docs/Web/API/View_Transition_API" },
  { name: "WebTransport", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebTransport_API" },
  { name: "Clipboard API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API" },
  { name: "Screen Wake Lock", url: "https://developer.mozilla.org/en-US/docs/Web/API/Screen_Wake_Lock_API" },
  { name: "getUserMedia", url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia" },
  { name: "getDisplayMedia", url: "https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia" },
  { name: "WebGL2", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API" },
  { name: "Canvas2D", url: "https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API" },
  { name: "SharedArrayBuffer", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer" },
  { name: "Transferable", url: "https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Transferable_objects" },
  { name: "Cache Storage", url: "https://developer.mozilla.org/en-US/docs/Web/API/CacheStorage" },
  { name: "HTMLMediaElement", url: "https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement" },
  { name: "AbortController", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController" },
  { name: "WebVTT", url: "https://developer.mozilla.org/en-US/docs/Web/API/WebVTT_API" },
  { name: "SRI", url: "https://developer.mozilla.org/en-US/docs/Web/Security/Subresource_Integrity" },
];

const BY_EXACT_NAME = new Map(ENGINEERING_EXTERNAL_LINKS.map((link) => [link.name, link.url]));
const BY_LOWER_NAME = new Map(ENGINEERING_EXTERNAL_LINKS.map((link) => [link.name.toLowerCase(), link.url]));

/**
 * 칩 이름으로 공식 링크를 찾는다. 정확히 일치 → 대소문자 무시 → 뒤에 붙은 버전
 * 표기(" 13.6.31" 등)를 떼고 재시도 순으로 해결하고, 없으면 undefined를 돌려준다.
 */
export function externalLinkForName(name: string): string | undefined {
  const trimmed = name.trim();
  const exact = BY_EXACT_NAME.get(trimmed) ?? BY_LOWER_NAME.get(trimmed.toLowerCase());
  if (exact) return exact;
  const withoutVersion = trimmed.replace(/\s+\d+(?:\.\d+)*[-\w.]*$/u, "");
  if (withoutVersion !== trimmed) {
    return BY_EXACT_NAME.get(withoutVersion) ?? BY_LOWER_NAME.get(withoutVersion.toLowerCase());
  }
  return undefined;
}
