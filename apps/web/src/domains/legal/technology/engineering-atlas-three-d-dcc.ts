import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · three-d 카테고리 중 "전문 도구 연결" 계열 카드: Blender · ToonBridge · MCP 경계.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const CREATOR_DIR = "apps/web/src/domains/creator";
const TOONBRIDGE_DIR = "tools/toonbridge";
const BLENDER_KIT_DIR = "tools/blender/toonstudio_blender_kit";

export const BLENDER_MCP_TOONBRIDGE: EngineeringAtlasEntry = {
  id: "blender-mcp-toonbridge",
  category: "three-d",
  name: "Blender · ToonBridge · MCP",
  title: t(
    "브라우저가 직접 못 여는 Blender는 검문소를 거쳐서만 부릅니다",
    "Blender, which a browser cannot open itself, is called only through a checkpoint",
  ),
  status: "configured",
  tagline: t(
    "로컬 검문소와 허용 명령 목록을 거쳐, 파일 지문을 맞춰 보며 Blender를 부립니다.",
    "Blender is driven through a local checkpoint and an allowlist, with file fingerprints matched.",
  ),
  background: [
    t(
      "Blender는 브라우저 밖에 있는 큰 공방입니다. 웹앱이 공방 문을 마음대로 열 수는 없으니 문 앞에 검문소를 둡니다. 검문소는 정해진 출입구(origin)와 신분증(토큰)을 가진 요청만 받고, 정해진 작업 목록에 있는 일만 시키고, 맡긴 재료와 나온 결과물의 지문(SHA-256)을 기록합니다. ToonStudio의 Blender 연결은 이 검문소(ToonBridge)와, 공방 안쪽에서 허용된 명령만 받는 창구(MCP 어댑터)로 이뤄집니다.",
      "Blender is a big workshop outside the browser. A web app cannot simply open the workshop door, so a checkpoint stands in front of it. The checkpoint accepts only requests that arrive through the agreed entrance (origin) with the right ID (token), orders only jobs from a fixed list, and records the fingerprint (SHA-256) of the material handed in and of the product that comes out. ToonStudio's Blender connection is this checkpoint (ToonBridge) plus a window inside the workshop that takes only approved commands (an MCP adapter).",
    ),
    t(
      "ToonBridge는 내 컴퓨터에서 도는 작은 Node 서버입니다. loopback(127.0.0.1)에만 열리고, 요청마다 정확히 일치하는 origin·프로토콜 버전 2·Bearer 토큰을 요구합니다. 작업마다 전용 폴더를 만들어 입력을 받고, 작업 이름(operation)에서 명령줄을 직접 조립해 shell 없이 실행하며, 결과는 일반 파일만 받아 SHA-256을 계산해 영수증에 적습니다. 예를 들어 GLB 내보내기는 blender --background 입력 --python 어댑터 -- 출력 꼴로 부르고, 실행 파일은 내가 직접 설치한 것만 씁니다.",
      "ToonBridge is a small Node server running on my own computer. It opens only on loopback (127.0.0.1) and requires, on every request, an exactly matching origin, protocol version 2 and a Bearer token. It makes a private folder per job to receive inputs, assembles the command line itself from the operation name and runs it without a shell, accepts only regular files as results, and writes their SHA-256 into a receipt. For example, a GLB export calls blender --background input --python adapter -- output, and only the executable I installed myself is used.",
    ),
    t(
      "MCP(Model Context Protocol)는 AI가 외부 도구를 부르는 표준 규약입니다. 공개된 blender-mcp 같은 서버는 AI가 Blender 장면을 직접 만지게 해 주지만, 그러면 같은 입력이 같은 결과를 낸다는 재현성이 사라집니다. 그래서 ToonStudio의 Blender 확장은 사람이 쓴 JSON 레시피를 받는 결정적 파이프라인을 두고, MCP는 그 파이프라인의 허용 명령 8개를 부르는 선택형 통로로만 둡니다. 임의 코드 실행·셸·네트워크·패키지 설치는 없고, 품질 관문을 통과한 캐릭터만 .toonchar.zip으로 묶입니다.",
      "MCP (Model Context Protocol) is a standard way for an AI to call external tools. Public servers such as blender-mcp let an AI touch a Blender scene directly, but then the same input no longer yields the same result. So ToonStudio's Blender extension keeps a deterministic pipeline that takes a human-written JSON recipe, and MCP is only an optional route to call that pipeline's 8 allowed commands. There is no arbitrary code execution, shell, network or package installation, and only characters that pass the quality gate are packed into .toonchar.zip.",
    ),
    t(
      "브라우저는 그 ZIP을 받을 때 한 번 더 점검합니다. 파일 수와 경로가 안전한지, 매니페스트가 가리키는 파일의 크기와 SHA-256이 맞는지, GLB 머리글과 VRM 확장이 맞는지 본 뒤에야 미리보기와 가져오기를 허용합니다. 한계도 분명합니다. ToonBridge는 커널 샌드박스가 아니라 직접 설치한 프로그램만 잇는 경계이고, MCP는 현재 기본 제품 경로가 아닙니다. 실제 Blender를 돌리는 CI가 정의돼 있지만 실행 이력은 이 카드가 확인하지 못했습니다.",
      "The browser checks that ZIP once more on receipt. Only after it sees that the file count and paths are safe, that the sizes and SHA-256 of the files the manifest points to match, and that the GLB header and VRM extension are right does it allow preview and import. The limits are clear too. ToonBridge is not a kernel sandbox but a boundary that connects only programs I installed, and MCP is not the default product path today. A CI that runs real Blender is defined, but this card could not confirm its run history.",
    ),
  ],
  keyPoints: [
    t("loopback 전용 + 정확한 origin + 토큰, 셋이 모두 맞아야 합니다", "Loopback only, an exact origin and a token must all match"),
    t("명령줄은 검문소가 허용 목록에서 직접 조립하고 shell은 쓰지 않습니다", "The checkpoint builds the command line from an allowlist, no shell"),
    t("MCP 창구는 허용 명령 8개뿐, 임의 코드·셸·네트워크는 없습니다", "The MCP window has only 8 allowed commands: no code, shell or network"),
    t("패키지는 크기·SHA-256·GLB 머리글을 확인한 뒤에야 가져옵니다", "A package is imported only after size, SHA-256 and GLB header checks"),
  ],
  diagram: {
    id: "blender-mcp-toonbridge-diagram",
    kind: "sequence",
    title: t("작업 하나가 검문소를 지나가는 길", "How one job passes through the checkpoint"),
    caption: t(
      "Studio는 무엇을 할지(작업 이름)만 말하고, 명령줄은 검문소가 허용 목록에서 직접 조립합니다. 파일은 들어올 때도 나갈 때도 지문을 확인합니다.",
      "Studio names only what to do; the checkpoint builds the command line itself from an allowlist. Files are fingerprint-checked going in and coming out.",
    ),
    alt: t(
      "Studio 화면이 ToonBridge에 blender export-glb 작업을 만들고, ToonBridge는 origin, 버전, 토큰 순서로 확인합니다. 입력 파일을 올리면 크기를 확인하고 SHA-256을 계산해 작업 전용 폴더에 씁니다. 시작하면 ToonBridge가 허용된 명령줄만 shell 없이 Blender에 실행시키고, Blender가 결과 GLB를 폴더에 씁니다. ToonBridge는 결과를 점검해 해시를 계산하고 영수증을 돌려주며, 내려받기 직전에 한 번 더 해시를 확인합니다.",
      "The Studio screen creates a blender export-glb job on ToonBridge, which checks the origin, then the version, then the token. When the input file is uploaded, its size is checked and its SHA-256 computed before it is written into the job's own folder. On start, ToonBridge has Blender run only the allowed command line without a shell, and Blender writes the result GLB into the folder. ToonBridge checks the result, computes its hash and returns a receipt, and hashes again just before download.",
    ),
    actors: [
      { id: "studio", label: t("Studio 화면", "Studio screen"), sub: t("브라우저 · /studio/engines", "Browser, /studio/engines"), tone: "local" },
      { id: "bridge", label: t("ToonBridge", "ToonBridge"), sub: t("내 PC의 로컬 검문소", "Local checkpoint on my PC"), tone: "good" },
      { id: "folder", label: t("작업 폴더", "Job folder"), sub: t("작업마다 전용", "Private per job"), tone: "neutral" },
      { id: "blender", label: t("Blender", "Blender"), sub: t("headless · 직접 설치", "Headless, self-installed"), tone: "external" },
    ],
    messages: [
      { from: "studio", to: "bridge", label: t("작업 만들기: blender / export-glb", "Create job: blender / export-glb"), note: t("origin → 버전 → 토큰 순서로 확인", "Origin, then version, then token") },
      { from: "studio", to: "bridge", label: t("입력 .blend 올리기", "Upload the input .blend"), note: t("크기 확인 · SHA-256 계산", "Size check, SHA-256 computed") },
      { from: "bridge", to: "folder", label: t("작업 전용 폴더에 쓰기", "Write into the job's folder"), note: t("폴더 밖 경로는 거부", "Paths outside it are refused") },
      { from: "studio", to: "bridge", label: t("시작", "Start"), note: t("동시 2개까지, 넘으면 429", "Up to 2 at once, 429 beyond") },
      { from: "bridge", to: "blender", label: t("허용된 명령줄만 실행", "Run only the allowed command line"), note: t("shell 없음 · 전용 HOME · 시간 제한", "No shell, own HOME, time limit") },
      { from: "blender", to: "folder", label: t("scene.glb 쓰기", "Write scene.glb"), style: "dashed" },
      { from: "bridge", to: "folder", label: t("결과 점검 후 SHA-256 계산", "Check result, compute SHA-256"), note: t("일반 파일만 · 심볼릭 링크 거부", "Regular files only, no symlinks") },
      { from: "bridge", to: "studio", label: t("영수증: 입력·출력 해시", "Receipt: input and output hashes"), style: "dashed", note: t("도구 버전·명령 요약 포함", "Includes tool version and command digest") },
      { from: "studio", to: "bridge", label: t("결과 내려받기", "Download the result"), note: t("내려받기 직전에 다시 해시", "Hashed again just before download") },
      { from: "bridge", to: "studio", label: t("scene.glb", "scene.glb"), style: "dashed", note: t("파일로 저장 · 가져오기는 별도 관문", "Saved as a file, import is a separate gate") },
    ],
  },
  usage: [
    {
      feature: t("설치·라이선스 · 로컬 실행기 연결", "Engines and licenses · local runner connection"),
      role: t(
        "주소와 토큰을 넣어 ToonBridge에 연결하고, 설치된 외부 도구를 점검해 사용 가능·수동·연결 필요·없음·차단(별도 라이선스 프로필에서만 활성화)의 다섯 상태로 보여 줍니다. 토큰은 현재 탭의 sessionStorage에만 둡니다.",
        "Connects to ToonBridge with an address and a token and shows each external tool in one of five states: available, manual, needs a connector, missing, or blocked (activated only under a separate license profile). The token is kept only in the current tab's sessionStorage.",
      ),
      paths: [
        `${CREATOR_DIR}/toolchain/StudioToonBridgeConnectionCard.tsx`,
        `${CREATOR_DIR}/toolchain/useStudioToonBridgeConnection.ts`,
        `${CREATOR_DIR}/toolchain/studio-toonbridge-client.ts#StudioToonBridgeClient`,
      ],
      route: "/studio/engines",
    },
    {
      feature: t("제작 도구 작업 · Blender 렌더·GLB 내보내기·라인아트", "Production-tool jobs · Blender render, GLB export, line art"),
      role: t(
        "작업 이름을 목록에서 고르면 ToonBridge가 명령줄을 조립해 Blender를 headless로 실행하고, 결과 파일과 해시 영수증을 돌려줍니다. 라이선스 프로필(open·community-gpl·research-nc)로 작업을 거릅니다.",
        "Picking an operation from the list makes ToonBridge assemble the command line, run Blender headless and return the result file with a hash receipt. License profiles (open, community-gpl, research-nc) filter the jobs.",
      ),
      paths: [
        `${TOONBRIDGE_DIR}/server.mjs`,
        `${TOONBRIDGE_DIR}/command-plans.mjs#blenderPlan`,
        `${TOONBRIDGE_DIR}/adapters/blender-export-glb.py`,
        "config/studio-production-toolchain.json",
        `${CREATOR_DIR}/toolchain/StudioProductionJobWorkspace.tsx`,
      ],
      route: "/studio/engines",
    },
    {
      feature: t("3D 캐릭터 편집기 · Blender 패키지 가져오기", "3D character editor · Blender package import"),
      role: t(
        "Blender 확장이 만든 .toonchar.zip을 고르면 매니페스트·크기·SHA-256·GLB 머리글을 점검한 뒤에야 미리보기와 가져오기를 허용합니다.",
        "Choosing a .toonchar.zip made by the Blender extension allows preview and import only after the manifest, sizes, SHA-256 and GLB header are checked.",
      ),
      paths: [
        `${CREATOR_DIR}/character-shaper/CharacterShaperBlenderPackage.tsx`,
        `${CREATOR_DIR}/vrm/studio-vrm-blender-package-import.ts#prepareBlenderCharacterPackage`,
        `${CREATOR_DIR}/vrm/studio-vrm-blender-character-package.ts`,
      ],
      route: "/studio/character",
    },
    {
      feature: t("Blender 캐릭터 확장 · MCP 창구", "Blender character extension · MCP window"),
      role: t(
        "허용된 8개 명령만 받는 dispatch입니다. 파일 접근만 선언하고 네트워크 권한은 요청하지 않으며, 품질 관문을 통과한 패키지만 ZIP으로 묶습니다.",
        "A dispatch that takes only the 8 allowed commands. It declares file access only, requests no network permission, and packs only packages that pass the quality gate into a ZIP.",
      ),
      paths: [
        `${BLENDER_KIT_DIR}/mcp.py#dispatch`,
        `${BLENDER_KIT_DIR}/contracts.py#MCP_ALLOWED_COMMANDS`,
        `${BLENDER_KIT_DIR}/package_archive.py`,
        `${BLENDER_KIT_DIR}/blender_manifest.toml`,
        ".github/workflows/blender-character-pipeline.yml",
      ],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("검문소의 세 관문: origin, 버전, 토큰", "The checkpoint's three gates: origin, version, token"),
      language: "ts",
      code: `const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

type Verdict = { ok: true } | { ok: false; status: 401 | 403 | 409; code: string };

/** 길이가 같으면 끝까지 모두 훑는다. 첫 불일치에서 멈추면 걸린 시간으로 토큰이 새어 나갈 수 있다. */
function sameToken(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** 세 관문을 차례로 통과해야 요청을 받는다. */
export function admit(origin: string, version: string, authorization: string, token: string): Verdict {
  // 1) 정확히 같은 origin 만 허용한다(와일드카드 없음)
  if (!ALLOWED_ORIGINS.has(origin)) return { ok: false, status: 403, code: "ORIGIN_REJECTED" };
  // 2) 프로토콜 버전이 맞아야 한다
  if (version !== "2") return { ok: false, status: 409, code: "VERSION_MISMATCH" };
  // 3) Bearer 토큰을 대조한다
  const given = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!sameToken(given, token)) return { ok: false, status: 401, code: "AUTH_FAILED" };
  return { ok: true };
}`,
      codeEn: `const ALLOWED_ORIGINS = new Set(["http://localhost:5173", "http://127.0.0.1:5173"]);

type Verdict = { ok: true } | { ok: false; status: 401 | 403 | 409; code: string };

/** When lengths match, scan to the end. Stopping at the first mismatch can leak the token through timing. */
function sameToken(given: string, expected: string): boolean {
  if (given.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < given.length; i++) diff |= given.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}

/** A request is accepted only after passing the three gates in order. */
export function admit(origin: string, version: string, authorization: string, token: string): Verdict {
  // 1) Only an exactly matching origin is allowed (no wildcards)
  if (!ALLOWED_ORIGINS.has(origin)) return { ok: false, status: 403, code: "ORIGIN_REJECTED" };
  // 2) The protocol version must match
  if (version !== "2") return { ok: false, status: 409, code: "VERSION_MISMATCH" };
  // 3) Compare the Bearer token
  const given = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!sameToken(given, token)) return { ok: false, status: 401, code: "AUTH_FAILED" };
  return { ok: true };
}`,
      explain: t(
        "실제 서버(server.mjs)는 같은 순서로 확인하되 토큰 비교에 Node의 timingSafeEqual을 씁니다. 여기서는 Node 없이 읽히도록 원리만 직접 풀어 썼습니다.",
        "The real server (server.mjs) checks in the same order but compares the token with Node's timingSafeEqual. Here the principle is written out by hand so it reads without Node.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("MCP 창구: 이름이 목록에 없으면 실행하지 않는다", "The MCP window: no name on the list, no execution"),
      language: "python",
      code: `MCP_ALLOWED_COMMANDS = frozenset({
    "inspect_character", "build_authored_hair", "create_semantic_face_shapes",
    "render_quality_views", "validate_character", "export_character_package",
    "export_current_character_package", "run_pipeline",
})

def dispatch(command, payload=None):
    # 이름이 허용 목록에 없으면 실행하지 않는다(eval·exec·셸·패키지 설치 없음)
    if command not in MCP_ALLOWED_COMMANDS:
        raise McpCommandError(f"command {command!r} is not allowed")
    source = _payload(payload)
    try:
        if command == "run_pipeline":
            root, config = _load_request_config(source)
            execution = run_pipeline(config, project_root=root, clear_before_import=True)
            return {"ok": True, "command": command, "outputDir": str(execution.output_dir)}
        # 나머지 명령도 같은 방식으로 이름마다 정해진 함수만 부른다
    except (OSError, RuntimeError, ValueError) as error:
        # 실패를 성공처럼 꾸미지 않고 ok: False 와 이유를 돌려준다
        return {"ok": False, "command": command, "error": str(error)}`,
      codeEn: `MCP_ALLOWED_COMMANDS = frozenset({
    "inspect_character", "build_authored_hair", "create_semantic_face_shapes",
    "render_quality_views", "validate_character", "export_character_package",
    "export_current_character_package", "run_pipeline",
})

def dispatch(command, payload=None):
    # A name that is not on the allowlist never runs (no eval, exec, shell or package install)
    if command not in MCP_ALLOWED_COMMANDS:
        raise McpCommandError(f"command {command!r} is not allowed")
    source = _payload(payload)
    try:
        if command == "run_pipeline":
            root, config = _load_request_config(source)
            execution = run_pipeline(config, project_root=root, clear_before_import=True)
            return {"ok": True, "command": command, "outputDir": str(execution.output_dir)}
        # The other commands work the same way: each name calls only its own fixed function
    except (OSError, RuntimeError, ValueError) as error:
        # Never dress a failure up as success: return ok: False with the reason
        return {"ok": False, "command": command, "error": str(error)}`,
      explain: t(
        "실제 dispatch는 명령 8개를 모두 처리하고 오류 종류 이름도 함께 돌려줍니다. AI 쪽이 어떤 문장을 보내든 실행되는 것은 이 목록의 이름과 정해진 함수뿐입니다. Python 예제라 도감이 자동 검증하지 않습니다.",
        "The real dispatch handles all 8 commands and also returns the error type name. Whatever sentence the AI side sends, only a name on this list and its fixed function can run. This is Python, so the atlas does not verify it automatically.",
      ),
      source: `${BLENDER_KIT_DIR}/mcp.py`,
      verify: "none",
    },
  ],
  links: [
    {
      title: "Blender Python API",
      url: "https://docs.blender.org/api/current/",
      kind: "docs",
      note: t("bpy: Blender를 스크립트로 다루는 공식 API", "bpy: the official API for scripting Blender"),
    },
    {
      title: "Blender Manual · Command Line Arguments",
      url: "https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html",
      kind: "docs",
      note: t("--background, --python 같은 실행 옵션", "Run options such as --background and --python"),
    },
    {
      title: "Blender Manual · Extensions",
      url: "https://docs.blender.org/manual/en/latest/advanced/extensions/index.html",
      kind: "docs",
      note: t("blender_manifest.toml 과 확장 권한", "blender_manifest.toml and extension permissions"),
    },
    {
      title: "Model Context Protocol",
      url: "https://modelcontextprotocol.io/",
      kind: "docs",
      note: t("AI가 외부 도구를 부르는 공개 규약", "The open protocol for AI to call external tools"),
    },
    {
      title: "VRM Add-on for Blender",
      url: "https://vrm-addon-for-blender.info/en-us/",
      kind: "docs",
      note: t("Blender에서 VRM을 읽고 쓰는 애드온", "The add-on that reads and writes VRM in Blender"),
    },
    {
      title: "Blender MCP (community server)",
      url: "https://github.com/ahujasid/mcp-for-blender",
      kind: "repo",
      note: t("공개 Blender MCP 서버. 제품 필수 요소는 아닙니다", "A public Blender MCP server, not required by the product"),
    },
  ],
  chapterIds: ["blender-mcp-boundary", "web-3d-engine"],
  talk: {
    pitch: t(
      "브라우저는 보안상 다른 프로그램을 직접 실행할 수 없습니다. 그래서 Blender 같은 전문 도구는 내 컴퓨터의 작은 검문소(ToonBridge)를 거쳐서만 부릅니다. 검문소는 출입구·토큰·작업 이름·파일 지문을 모두 확인하고, AI 쪽 통로(MCP)도 허용된 명령 8개만 열어 둡니다. 편의보다 재현성과 안전을 먼저 둔 설계입니다.",
      "For security a browser cannot run other programs directly. So a professional tool like Blender is called only through a small checkpoint (ToonBridge) on my computer. The checkpoint checks the entrance, the token, the job name and the file fingerprints, and even the AI-facing route (MCP) opens only 8 approved commands. It puts reproducibility and safety ahead of convenience.",
    ),
    analogy: t(
      "공방 문 앞의 접수 창구입니다. 신분증을 보고, 맡길 수 있는 일 목록에서만 주문을 받고, 맡긴 물건과 받아 가는 물건의 지문을 대조합니다.",
      "A reception window at the workshop door: it checks ID, takes orders only from the list of jobs it offers, and matches the fingerprints of what you hand in and what you take out.",
    ),
    questions: [
      {
        question: t("왜 브라우저에서 Blender를 바로 못 쓰나요?", "Why can't the browser just use Blender directly?"),
        answer: t(
          "브라우저는 다른 프로그램을 실행하지 못하게 막혀 있습니다. 그래서 내 컴퓨터에 작은 서버를 따로 두고, 그 서버는 loopback에만 열리며 origin과 토큰을 확인한 요청만 받습니다.",
          "A browser is blocked from running other programs. So a small server sits on my computer, opens only on loopback and accepts only requests whose origin and token check out.",
        ),
      },
      {
        question: t("AI가 Blender를 마음대로 조작하나요?", "Does an AI freely control Blender?"),
        answer: t(
          "아닙니다. 허용된 8개 명령만 받고 임의 코드·셸·네트워크는 없습니다. 입력은 사람이 쓴 JSON 레시피입니다. 브라우저 쪽 blender-mcp 점검은 항상 사용 불가와 이유를 돌려주고 VRM 파일을 꾸며 내지 않습니다.",
          "No. It takes only 8 allowed commands, with no arbitrary code, shell or network, and the input is a human-written JSON recipe. The browser-side blender-mcp probe always returns unavailable with a reason and never fabricates a VRM file.",
        ),
      },
      {
        question: t("Blender는 GPL인데 괜찮은가요?", "Blender is GPL. Is that a problem?"),
        answer: t(
          "ToonBridge는 외부 프로그램을 설치·내려받기·재배포하지 않고, 사용자가 직접 설치한 실행 파일만 부릅니다. 도구 목록에 라이선스 분류가 있고 비영리 전용 도구는 별도 프로필이 있어야 실행됩니다. 법적 판단은 이 카드의 범위 밖입니다.",
          "ToonBridge does not install, download or redistribute external programs; it calls only executables the user installed. The tool list carries a license class, and non-commercial tools run only under a separate profile. A legal judgment is outside this card.",
        ),
      },
    ],
    pitfall: t(
      "ToonBridge를 안전한 샌드박스라고 말하지 마세요. README가 커널 샌드박스가 아니라고 밝힙니다. 'MCP로 AI가 Blender를 다룬다'도 과장입니다. MCP는 선택형이고 기본 제품 경로가 아닙니다. 실제 Blender CI의 실행 이력은 확인하지 못했고, Blender 확장 README는 명령을 7개로 적지만 코드는 8개입니다.",
      "Do not call ToonBridge a safe sandbox; its README says it is not a kernel sandbox. 'An AI drives Blender through MCP' is an exaggeration too: MCP is optional and not the default product path. I could not confirm the run history of the real-Blender CI, and the Blender extension README lists 7 commands while the code has 8.",
    ),
  },
  technologies: ["Blender", "Blender bpy", "MCP", "VRM", "GLB", "SHA-256", "Node.js"],
  facts: [
    { value: "8", label: t("Blender 확장이 받는 허용 명령 수(README는 7개로 적음)", "Allowed commands the Blender extension accepts (the README lists 7)"), source: `${BLENDER_KIT_DIR}/contracts.py` },
    { value: "2", label: t("ToonBridge가 동시에 돌리는 외부 작업의 기본 수(최대 8)", "Default number of external jobs ToonBridge runs at once (8 at most)"), source: `${TOONBRIDGE_DIR}/server.mjs` },
    { value: "2 GiB / 4 GiB", label: t("결과 파일 하나 / 작업 하나의 출력 상한", "Output cap for one file / for one job"), source: `${TOONBRIDGE_DIR}/server.mjs` },
    { value: "256 MB", label: t("브라우저가 받는 패키지 속 모델 파일 상한", "Largest model file the browser accepts from a package"), source: `${CREATOR_DIR}/vrm/studio-vrm-blender-package-import.ts` },
  ],
  reviewedAt: "2026-10-07",
};

/** three-d 카테고리의 "전문 도구 연결" 카드 묶음. */
export const THREE_D_DCC_CARDS: readonly EngineeringAtlasEntry[] = [BLENDER_MCP_TOONBRIDGE];
