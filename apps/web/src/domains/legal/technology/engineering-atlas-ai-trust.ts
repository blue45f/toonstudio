import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · ai 카테고리 — 신뢰 카드(제안은 AI 가 확정은 사람이·AI 결과의 출처와 권리 기록).
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다. 사실은 2026-10-07 기준 코드·테스트로 확인했다.
 * 한 파일이 1,000줄을 넘지 않도록 engineering-atlas-ai-generative.ts 에서 나눴고, 그쪽에서 이 배열을 이어 붙인다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const AI_PROPOSAL_NOT_COMMIT: EngineeringAtlasEntry = {
  id: "ai-proposal-not-commit",
  category: "ai",
  name: "Proposal, not commit",
  title: t("제안은 AI가, 확정은 사람이", "AI proposes, people decide"),
  status: "live",
  tagline: t(
    "대사·팔레트·구도 제안과 이미지 후보는 작가가 고른 뒤에만 반영되고, 채색·생성은 예외입니다.",
    "Dialogue, palette and composition suggestions and image candidates apply only after the artist picks; colorize and generation are exceptions.",
  ),
  background: [
    t(
      "편집자가 원고에 교정 의견을 적을 때, 빨간 펜으로 원고를 직접 고쳐 버리면 작가는 무엇이 바뀌었는지 알 수 없습니다. 그래서 '제안 모드'로 따로 적어 주고 작가가 받아들이거나 버리게 하죠. ToonStudio의 대사·팔레트·구도 제안, 시나리오 이미지 후보, 코믹 디렉터가 이 방식입니다. 결과를 문서에 직접 넣지 않고 제안·후보로 돌려주며, 작가가 마음에 드는 부분만 골라 반영합니다. 되돌리기는 편집기의 일반 Undo에 맡깁니다.",
      "When an editor marks up a manuscript, correcting it directly in red pen leaves the author unable to see what changed. So editors use suggestion mode, and the author accepts or discards each change. ToonStudio's dialogue, palette and composition suggestions, scenario image candidates and comic director work this way: they return proposals or candidates instead of writing into the document, and the artist applies only the parts they like. Undoing is left to the editor's ordinary Undo.",
    ),
    t(
      "획 제안 모듈은 제안을 데이터로 정의합니다. 제안에는 변형(variant)이 최대 4개 있고, 각 변형은 내용 해시(contentId)와 출처(공급자·모델·시드·전송 방식·프롬프트 해시)를 가진 획 묶음입니다. 제안은 만들어질 때의 문서 세대 번호(documentGeneration)를 기억합니다. 작가가 적용하면 ① 아직 검토 중인 제안인지 ② 그리는 중이 아닌지 ③ 같은 문서인지 ④ 세대 번호가 그대로인지 확인하고, 하나라도 어긋나면 낡은 제안으로 거절합니다. 통과하면 선택한 획만 적용 묶음(트랜잭션)에 담기고 새 요소에 출처(aiProvenance)가 붙습니다.",
      "The stroke-proposal module defines a proposal as data. It holds up to four variants, and each variant is a bundle of strokes with a content hash (contentId) and a provenance (provider, model, seed, transport, prompt hash). A proposal remembers the document generation number (documentGeneration) from when it was made. When the artist applies it, the app checks (1) it is still under review, (2) no stroke is being drawn, (3) it is the same document and (4) the generation number is unchanged; any mismatch rejects it as stale. If it passes, only the chosen strokes go into an apply bundle (a transaction) and the new elements receive their provenance (aiProvenance).",
    ),
    t(
      "같은 원칙이 여러 곳에 반복됩니다. 대사·팔레트·구도 제안은 캔버스를 자동 변경하지 않고 적용 전에 검토할 제안만 줍니다. 시나리오 이미지는 후보로 쌓이고 선택과 승인이 따로이며, 서버의 AI 코믹 디렉터는 승인을 세션 수정 번호와 후보 해시에 묶고 세션이 바뀌었으면 '검수 기준이 바뀌었다'며 거절합니다. 반대로 AI 자동 채색은 선택한 레이어 이미지를 결과로 바로 교체하고, 배경·캐릭터 생성은 새 이미지 요소를 바로 추가하며, 기기 안 ONNX 도구(채색·업스케일·애니풍)도 결과를 바로 교체하고 출처 기록 대상이 아닙니다. 이런 '바로 반영'은 빠르지만 비교·책임 소재가 흐려집니다.",
      "The same principle repeats in several places. Dialogue, palette and composition suggestions never change the canvas automatically and only offer proposals to review before applying. Scenario images pile up as candidates with selecting and approving kept apart, and the server's AI comic director binds an approval to the session revision and the candidate hash, rejecting it with 'the review basis changed' if the session moved on. By contrast, AI colorize replaces the selected layer's image with the result at once, background and character generation add a new image element at once, and the on-device ONNX tools (colorize, upscale, anime style) also replace the image at once and are not recorded as provenance. Applying immediately is faster but blurs comparison and accountability.",
    ),
    t(
      "정직한 한계: 획 제안 생성기는 AI 모델이 아니라 최근 획을 1-2-1 가중 이동평균으로 다듬는 로컬 알고리즘 한 가지(moving-average-v1)입니다. 이 생성기와 검토 패널은 코드와 단위 테스트가 있지만, 패널을 편집기와 이어 주는 훅(useStudioAiCanvasBridge)을 부르는 제품 코드가 없어 화면에는 '연결 대기' 안내만 보입니다(코드 검색 기준이며 브라우저에서 실행해 확인하지는 못했습니다). 그래서 'AI가 획을 제안한다'가 아니라 '제안-검토-적용 구조를 먼저 만들어 두었고 아직 화면에 이어지지 않았다'고 말해야 정확합니다. '스마트 제작 도구'는 AI 모델을 부르지 않는 도구로 상태 보드에서도 따로 분류됩니다.",
      "Honest limit: the stroke generator is not an AI model but a single local algorithm (moving-average-v1) that smooths recent strokes with a 1-2-1 weighted moving average. The generator and its review panel have code and unit tests, but no product code calls the hook that connects the panel to the editor (useStudioAiCanvasBridge), so the screen shows only a 'waiting to connect' notice (based on a code search; it was not confirmed by running it in a browser). So the accurate statement is not 'AI proposes strokes' but 'the propose, review, apply structure was built first and is not yet connected to the screen'. 'Smart tools' are classed separately on the status board as tools that call no AI model.",
    ),
  ],
  keyPoints: [
    t("대사·팔레트·구도 제안과 이미지 후보는 작가가 고른 뒤에 반영됩니다", "Dialogue, palette and composition suggestions and image candidates apply only after the artist picks"),
    t("AI 자동 채색과 배경·캐릭터 생성은 결과를 바로 반영하는 예외입니다", "AI colorize and background or character generation are exceptions that apply results at once"),
    t("획 제안 모듈은 낡은 제안을 세대 번호로 거절하도록 설계됐습니다", "The stroke-proposal module is designed to reject a stale proposal by its generation number"),
    t("획 제안 생성기는 AI 모델이 아닌 이동평균이며 화면 연결은 대기 중", "The stroke generator is a moving average, not an AI model, and is not yet connected to the screen"),
  ],
  diagram: {
    id: "ai-proposal-not-commit-diagram",
    kind: "sequence",
    title: t("제안에서 적용까지 (획 제안 모듈의 설계)", "From proposal to apply (stroke-proposal module design)"),
    caption: t(
      "획 제안 모듈의 설계 흐름입니다. 생성기는 제안만 만들고 고른 획만 들어가며 낡은 제안은 거절됩니다. 화면 연결은 대기 중입니다.",
      "The designed flow of the stroke-proposal module: the generator only proposes, only the picked strokes enter, and a stale proposal is rejected. Screen wiring is still pending.",
    ),
    alt: t(
      "작가가 제안을 요청하면 패널이 최근 확정 획과 문서 세대 번호를 생성기에 보냅니다. 생성기는 출처가 붙은 제안을 돌려주고 패널은 문서를 바꾸지 않은 채 고스트 미리보기를 보여 줍니다. 작가가 고른 획을 적용하면 세대 번호가 같을 때만 문서에 들어가고, 낡았으면 거절됩니다. 되돌리기는 편집기의 일반 Undo에 맡기며, 이 흐름은 코드와 단위 테스트로 확인했고 화면 연결은 대기 중입니다.",
      "When the artist asks for a proposal, the panel sends recent committed strokes and the document generation number to the generator. The generator returns proposals with provenance and the panel shows a ghost preview without touching the document. Applying the chosen strokes enters the document only if the generation number matches, and a stale one is rejected. Undo is left to the editor's ordinary Undo; this flow is confirmed by code and unit tests, and the screen wiring is still pending.",
    ),
    actors: [
      { id: "artist", label: t("작가", "Artist"), tone: "neutral" },
      { id: "panel", label: t("제안 패널", "Proposal panel"), sub: t("스마트 획 보정 검토", "Smart stroke review"), tone: "local" },
      { id: "doc", label: t("문서(편집기)", "Document"), sub: t("확정 획의 권위", "Authority for committed strokes"), tone: "local" },
      { id: "gen", label: t("제안 생성기", "Generator"), sub: t("지금은 이동평균 보정", "Today: moving average"), tone: "ai" },
    ],
    messages: [
      { from: "artist", to: "panel", label: t("제안 요청", "Ask for a proposal"), note: t("최근 확정 획만 읽음", "Reads only committed strokes") },
      { from: "panel", to: "gen", label: t("획 + 문서 세대 번호 전달", "Send strokes + generation"), note: t("고정 한도로 잘라서", "Trimmed to fixed limits") },
      { from: "gen", to: "panel", label: t("제안 1~4개 + 출처", "1 to 4 variants + provenance"), style: "dashed", note: t("내용 해시·공급자·모델", "Content hash, provider, model") },
      { from: "panel", to: "artist", label: t("고스트 미리보기", "Ghost preview"), style: "dashed", note: t("문서는 그대로", "Document untouched") },
      { from: "artist", to: "panel", label: t("고른 획만 적용", "Apply the picked strokes"), note: t("선택한 획만 담음", "Only the picked strokes") },
      { from: "panel", to: "doc", label: t("적용 트랜잭션", "Apply transaction"), note: t("세대 번호가 같을 때만", "Only if the generation matches") },
      { from: "doc", to: "panel", label: t("낡은 제안이면 거절", "Stale proposal rejected"), style: "dashed", note: t("그사이 문서가 바뀐 경우", "The document changed meanwhile") },
      { from: "artist", to: "doc", label: t("되돌리기 (일반 Undo)", "Undo (ordinary)"), note: t("롤백 보조 함수는 미사용", "The rollback helper is unused") },
    ],
  },
  usage: [
    {
      feature: t("스마트 획 보정 검토 (고급 AI 도구 · 연결 대기)", "Smart stroke review (advanced AI tools, awaiting wiring)"),
      role: t(
        "획 제안 생성기(moving-average-v1)와 검토 패널은 코드와 단위 테스트가 있습니다. 설계는 최근 확정 획을 읽어 후보를 제안하고 고스트로 미리 보여 준 뒤 고른 획만 추가하는 것이지만, 편집기와 이어 주는 훅(useStudioAiCanvasBridge)을 부르는 제품 코드가 아직 없어 화면에는 '연결 대기' 안내만 보입니다. 되돌리기는 일반 Undo에 맡기며 롤백 보조 함수는 아직 호출되지 않습니다.",
        "The stroke generator (moving-average-v1) and the review panel have code and unit tests. The design reads recently committed strokes, proposes candidates, previews them as a ghost and adds only the chosen strokes, but no product code calls the hook that connects it to the editor (useStudioAiCanvasBridge), so the screen shows only a 'waiting to connect' notice. Undo is left to the ordinary Undo, and the rollback helper is not called yet.",
      ),
      paths: [
        "apps/web/src/domains/creator/ai/StudioConnectedStrokeProposalPanel.tsx",
        "apps/web/src/domains/creator/ai/studio-stroke-proposal.ts",
        "apps/web/src/domains/creator/ai/studio-stroke-proposal-bridge.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("글·대사·팔레트·구도 제안 (Studio AI 어시스트)", "Text, dialogue, palette and composition suggestions (Studio AI assist)"),
      role: t(
        "구도·대사·팔레트 도구는 캔버스나 기존 대사·색을 자동으로 바꾸지 않고, 적용 전에 검토할 제안 한 세트만 줍니다. 배경·캐릭터 도구는 새 이미지 요소를 바로 추가합니다. 실행 전 안내가 이 차이를 도구마다 문구로 고정합니다.",
        "The composition, dialogue and palette tools never change the canvas, existing dialogue or colors automatically; they offer only one set of proposals to review. The background and character tools add a new image element at once. The pre-run notice fixes this difference in wording for each tool.",
      ),
      paths: [
        "apps/web/src/domains/creator/ai/studio-ai-execution-preflight.ts",
        "apps/web/src/domains/creator/ai/studio-ai-assist-ux.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("시나리오 이미지 후보", "Scenario image candidates"),
      role: t(
        "생성 결과를 후보로 쌓고, 선택과 승인을 나누고, 입력이 바뀌면 낡음으로 표시합니다.",
        "Stacks generated results as candidates, separates selecting from approving, and marks them stale when the input changes.",
      ),
      paths: ["apps/web/src/domains/creator/ai/studio-scenario-candidate-workflow.ts"],
      route: "/studio",
    },
    {
      feature: t("AI 코믹 디렉터 (서버 세션)", "AI comic director (server session)"),
      role: t(
        "4단계(brief·direction·production·finish) 세션과 잡 상태를 서버에 두고, 승인을 수정 번호와 후보 해시에 묶어 '검토한 후보가 곧 승인한 후보'가 되게 합니다.",
        "Keeps a four-stage session (brief, direction, production, finish) and job state on the server, and binds an approval to the revision and candidate hash so the reviewed candidate is the approved candidate.",
      ),
      paths: [
        "apps/api/src/modules/studio-ai/studio-ai-comic-director.contract.ts",
        "apps/api/src/modules/studio-ai/studio-ai-comic-director.repository.ts",
        "apps/web/src/domains/creator/ai/StudioAiComicDirectorPanel.tsx",
      ],
      route: "/studio",
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("제안 적용 가드와 롤백 보조 함수", "Apply guard and rollback helper"),
      language: "ts",
      code: [
        "// 제안 적용 가드(단순화): 낡은 제안은 문서에 들어가지 못한다.",
        'interface Review { status: "reviewing" | "applied" | "cancelled"; documentId: string; generation: number }',
        "interface DocState { documentId: string; generation: number; drawing: boolean }",
        "",
        "export function assertApplicable(review: Review, doc: DocState): void {",
        '  if (review.status !== "reviewing") throw new Error("이미 처리된 제안입니다");',
        '  if (doc.drawing) throw new Error("그리는 중에는 적용할 수 없습니다");',
        '  if (doc.documentId !== review.documentId) throw new Error("다른 문서의 제안입니다");',
        '  if (doc.generation !== review.generation) throw new Error("문서가 바뀌어 낡은 제안입니다");',
        "}",
        "",
        "// 롤백 보조 함수(아직 호출되지 않음): 이 트랜잭션이 추가한 획만 지운다.",
        "export const rollback = (strokeIds: string[], added: string[]): string[] =>",
        "  strokeIds.filter((id) => !added.includes(id));",
      ].join("\n"),
      codeEn: [
        "// Apply guard (simplified): a stale proposal cannot enter the document.",
        'interface Review { status: "reviewing" | "applied" | "cancelled"; documentId: string; generation: number }',
        "interface DocState { documentId: string; generation: number; drawing: boolean }",
        "",
        "export function assertApplicable(review: Review, doc: DocState): void {",
        '  if (review.status !== "reviewing") throw new Error("this proposal was already handled");',
        '  if (doc.drawing) throw new Error("cannot apply while a stroke is being drawn");',
        '  if (doc.documentId !== review.documentId) throw new Error("this proposal belongs to another document");',
        '  if (doc.generation !== review.generation) throw new Error("the document changed, so the proposal is stale");',
        "}",
        "",
        "// Rollback helper (not called anywhere yet): remove only the strokes this transaction added.",
        "export const rollback = (strokeIds: string[], added: string[]): string[] =>",
        "  strokeIds.filter((id) => !added.includes(id));",
      ].join("\n"),
      explain: t(
        "applyStudioStrokeProposalReview와 rollbackStudioStrokeProposalTransaction의 핵심 검사만 남긴 예제입니다. 네 검사 중 하나라도 어긋나면 적용 전에 예외가 나고, 문서는 바뀌지 않습니다. 실제 코드는 여기에 선택한 획 확인, 중복 획 제외, 내용 해시가 붙은 트랜잭션 생성을 더합니다. 롤백 함수는 정의만 있고 제품 코드와 테스트 어디에서도 아직 호출되지 않습니다.",
        "Only the core checks of applyStudioStrokeProposalReview and rollbackStudioStrokeProposalTransaction. If any of the four checks fails an exception is thrown before applying, and the document is untouched. The real code adds checking the selected strokes, excluding duplicate strokes, and building a transaction with a content hash. The rollback function is only defined; no product code or test calls it yet.",
      ),
      source: "apps/web/src/domains/creator/ai/studio-stroke-proposal.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("승인은 수정 번호와 후보 해시에 묶인다", "An approval is bound to a revision and a candidate hash"),
      language: "ts",
      code: [
        "// 승인은 '수정 번호 + 후보 해시'에 묶인다. 세션이 바뀌면 그 승인은 현재 승인이 아니다.",
        'interface Approval { sessionId: string; sessionRevision: number; candidateDigest: string; status: "active" | "superseded" }',
        "interface Session { id: string; revision: number }",
        "",
        "export function approve(session: Session, expectedRevision: number, digest: string, previous: Approval[]): Approval[] {",
        '  if (session.revision !== expectedRevision) throw new Error("검수 기준이 바뀌었습니다. 최신 후보를 다시 확인하세요");',
        '  const older = previous.map((a) => (a.status === "active" ? { ...a, status: "superseded" as const } : a));',
        '  return [...older, { sessionId: session.id, sessionRevision: expectedRevision, candidateDigest: digest, status: "active" }];',
        "}",
        "",
        "export const currentApproval = (session: Session, all: Approval[]): Approval | undefined =>",
        '  all.find((a) => a.sessionId === session.id && a.status === "active" && a.sessionRevision === session.revision);',
      ].join("\n"),
      codeEn: [
        "// An approval is bound to a revision + a candidate hash. Once the session moves on it is no longer current.",
        'interface Approval { sessionId: string; sessionRevision: number; candidateDigest: string; status: "active" | "superseded" }',
        "interface Session { id: string; revision: number }",
        "",
        "export function approve(session: Session, expectedRevision: number, digest: string, previous: Approval[]): Approval[] {",
        '  if (session.revision !== expectedRevision) throw new Error("the review basis changed; check the latest candidate again");',
        '  const older = previous.map((a) => (a.status === "active" ? { ...a, status: "superseded" as const } : a));',
        '  return [...older, { sessionId: session.id, sessionRevision: expectedRevision, candidateDigest: digest, status: "active" }];',
        "}",
        "",
        "export const currentApproval = (session: Session, all: Approval[]): Approval | undefined =>",
        '  all.find((a) => a.sessionId === session.id && a.status === "active" && a.sessionRevision === session.revision);',
      ].join("\n"),
      explain: t(
        "AI 코믹 디렉터 저장소의 createApproval·currentApproval을 메모리 코드로 줄인 예제입니다. 실제로는 PostgreSQL 한 트랜잭션에서 이전 승인을 대체(superseded)하고, 세션의 현재 수정 번호가 기대값과 같을 때만 새 승인을 넣으며, 어긋나면 409 충돌을 돌려줍니다.",
        "A memory-only reduction of createApproval and currentApproval in the comic director repository. In reality one PostgreSQL transaction supersedes the previous approval and inserts the new one only when the session's current revision equals the expected value, otherwise returning a 409 conflict.",
      ),
      source: "apps/api/src/modules/studio-ai/studio-ai-comic-director.repository.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Google PAIR · People + AI Guidebook",
      url: "https://pair.withgoogle.com/guidebook/",
      kind: "guide",
      note: t("AI 결과를 사람이 통제하게 하는 설계 지침", "Design guidance for keeping people in control of AI output"),
    },
    {
      title: "Microsoft Research · Guidelines for Human-AI Interaction",
      url: "https://www.microsoft.com/en-us/research/project/guidelines-for-human-ai-interaction/",
      kind: "guide",
    },
    {
      title: "MDN · If-Match",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/If-Match",
      kind: "docs",
      note: t("'내가 본 버전일 때만 고친다'는 낙관적 동시성의 표준 헤더", "The standard header for optimistic concurrency: change only if it is the version I saw"),
    },
  ],
  chapterIds: ["ai-routing", "image-generation", "product-intent"],
  talk: {
    pitch: t(
      "ToonStudio의 대사·팔레트·구도 제안은 문서를 직접 고치지 않고 제안만 돌려주고, 작가가 고른 것만 반영됩니다. 이미지는 후보로 쌓여 선택과 승인이 따로이고, 서버의 코믹 디렉터는 승인을 후보 해시에 묶습니다. 획 제안은 문서가 바뀌면 세대 번호가 달라 적용을 거절하도록 설계했지만, 규칙 기반 보정 1종이고 아직 화면에 이어지지 않았습니다. 그리고 AI 채색과 배경·캐릭터 생성은 예외로 결과를 바로 넣습니다.",
      "ToonStudio's dialogue, palette and composition suggestions never edit the document; they return proposals, and only what the artist picks is applied. Images pile up as candidates with selecting and approving kept apart, and the server's comic director binds an approval to the candidate hash. Stroke proposals are designed to be rejected by a different generation number if the document changed, but they are one rule-based smoother and are not yet connected to the screen. And AI colorize and background or character generation are exceptions that put the result in at once.",
    ),
    analogy: t(
      "원고에 교정 의견을 직접 덮어쓰지 않고 '제안 모드'로 적어 주는 편집자와 같습니다. 받아들일지는 작가가 정합니다.",
      "It is like an editor who writes corrections in suggestion mode instead of overwriting the manuscript. Whether to accept is the author's call.",
    ),
    questions: [
      {
        question: t("AI가 만든 결과를 믿어도 되나요?", "Can I trust what the AI produces?"),
        answer: t(
          "믿는 구조가 아니라 확인하는 구조입니다. 대사·팔레트·구도 제안과 이미지 후보는 제안·후보로 와서 사람이 고른 뒤에만 반영되고, 게시 전 점검에서 AI 사용 고지를 확인합니다. 다만 AI 채색은 선택한 레이어 이미지를 바로 교체하고, 기기 안 ONNX 결과는 출처 기록 대상이 아닙니다.",
          "It is a structure for checking, not for trusting. Dialogue, palette and composition suggestions and image candidates arrive as proposals or candidates and are applied only after a person picks, and AI-use disclosure is checked before publishing. However, AI colorize replaces the selected layer's image at once, and on-device ONNX results are not recorded as provenance.",
        ),
      },
      {
        question: t("되돌릴 수 있나요?", "Can it be undone?"),
        answer: t(
          "되돌리기는 편집기의 일반 Undo에 맡깁니다. 획 제안 모듈에 롤백 보조 함수가 있지만 아직 어디에서도 호출되지 않고, 제안 적용이 Undo 한 번으로 묶이는지도 확인하지 못했습니다.",
          "Undo is left to the editor's ordinary Undo. The stroke-proposal module has a rollback helper, but nothing calls it yet, and whether an applied proposal collapses into a single Undo was not verified.",
        ),
      },
      {
        question: t("획 제안은 정말 AI인가요?", "Are stroke proposals really AI?"),
        answer: t(
          "아닙니다. 생성기는 최근 획을 이동평균으로 다듬는 로컬 알고리즘 하나이고, 그마저도 편집기와 이어 주는 훅을 부르는 곳이 없어 화면에는 '연결 대기'만 보입니다. 모델이 붙을 수 있는 제안 프로토콜(출처·세대 번호·적용 묶음)이 먼저 준비된 상태입니다.",
          "No. The generator is one local algorithm that smooths recent strokes with a moving average, and nothing calls the hook that connects it to the editor, so the screen shows only 'waiting to connect'. The proposal protocol (provenance, generation number, apply bundle) that a model could plug into was built first.",
        ),
      },
    ],
    pitfall: t(
      "'AI가 획을 제안한다'고 말하면 과장입니다. 획 제안은 규칙 기반 보정 1종이고 화면 연결도 대기 중입니다(코드 검색 기준, 브라우저 실행은 못 함). 'AI는 늘 제안만 한다'도 과장입니다. 채색·배경·캐릭터 생성은 결과를 바로 넣습니다. 실행 전 안내(외부 전송·비용 범주)는 코드로 확인했지만, 모든 호출에 확인 창이 따로 뜬다는 것은 확인하지 못했습니다.",
      "Saying 'the AI proposes strokes' overstates it: stroke proposals are one rule-based smoother and the screen wiring is pending (based on a code search, not a browser run). 'The AI only ever proposes' is also an overstatement, because colorize and background or character generation put the result in at once. The pre-run notice (external transfer and cost category) is confirmed in code, but a separate confirm dialog on every call was not verified.",
    ),
  },
  technologies: ["Proposal protocol", "Content hash", "Optimistic concurrency", "Undo transaction"],
  facts: [
    {
      value: "4 / 64 / 2,048",
      label: t("제안 변형 수 / 변형당 획 / 획당 점 최대", "Proposal limits: variants / strokes per variant / points per stroke"),
      source: "apps/web/src/domains/creator/ai/studio-stroke-proposal.ts",
    },
    {
      value: "moving-average-v1",
      label: t("획 제안 생성기(로컬 알고리즘, AI 모델 아님 · 화면 연결 대기)", "The stroke proposal generator (a local algorithm, not an AI model; screen wiring pending)"),
      source: "apps/web/src/domains/creator/ai/studio-stroke-proposal-bridge.ts",
    },
    {
      value: "4 stages / 9 statuses",
      label: t("AI 코믹 디렉터 세션의 단계 수 / 상태 수", "AI comic director session: stages / statuses"),
      source: "apps/api/src/modules/studio-ai/studio-ai-comic-director.contract.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

const AI_PROVENANCE_RIGHTS: EngineeringAtlasEntry = {
  id: "ai-provenance-rights",
  category: "ai",
  name: "AI provenance and rights",
  title: t("AI 결과의 출처와 권리 기록", "Recording where AI results come from and who may use them"),
  status: "live",
  tagline: t(
    "프롬프트는 해시만 남기고 공개 요약은 비식별로 만들며, '서명이 아니다'를 화면에 분명히 밝힙니다.",
    "Prompts are kept only as hashes, the public summary is de-identified, and the screen states plainly that this is not a signature.",
  ),
  background: [
    t(
      "AI로 만든 그림이나 글이 섞인 작품을 게시할 때는 '무엇을 AI가 만들었는지', '어느 모델로 했는지'를 정직하게 밝혀야 합니다. 영수증에 비유하면, 장을 볼 때마다 날짜·가게·품목을 적어 두었다가 필요하면 요약본만 내미는 것입니다. 하지만 영수증에 개인 메모(프롬프트 원문)까지 그대로 적어 두면 곤란하니, 원문 대신 지문(해시)만 남깁니다. ToonStudio는 요청 전에 기록을 시작하고, 응답이 오면 결과를 정산합니다.",
      "When publishing a work that mixes in AI-made art or text, you should honestly say what the AI made and with which model. Think of a receipt: each shopping trip notes the date, store and items, and you hand over only a summary when needed. But writing your private notes (the raw prompt) onto the receipt would be awkward, so only a fingerprint (hash) is kept in their place. ToonStudio starts the record before the request and settles it when the response arrives.",
    ),
    t(
      "기록은 세 겹입니다. ① 로컬 작업 이력: 요청 전에 pending으로 만들고 응답 뒤 succeeded·failed·cancelled로 정산합니다. 프롬프트는 SHA-256 해시와 내용 없는 요약만 남기고, 원문 보관은 명시적 동의가 있어야 합니다. 브라우저가 닫혀 pending으로 남은 작업은 다음에 열 때 SESSION_INTERRUPTED로 취소 처리합니다. ② 공개용 요약: 해시·요청 ID·시드·내부 ID·공급자 오류 상세를 뺀 비식별 투영만 게시 패키지로 갑니다. ③ 게시 전 점검: 사용 유형·고지·이력이 서로 맞는지 검사합니다.",
      "The record has three layers. (1) The local work log: created as pending before the request and settled as succeeded, failed or cancelled afterward. Prompts keep only a SHA-256 hash and a content-free summary, and storing the raw text needs explicit consent. A job left pending because the browser closed is cancelled as SESSION_INTERRUPTED the next time it opens. (2) The public summary: only a de-identified projection without hashes, request IDs, seeds, internal IDs or provider error detail goes into the publish package. (3) The pre-publish check verifies that usage type, disclosure and log agree.",
    ),
    t(
      "권리 쪽 규칙도 같은 곳에서 만납니다. 게시 점검은 AI 생성 이미지가 있는데 사용 유형이 generated가 아니거나, 이력이 있는데 사용 유형이 none이면 오류로, 고지가 비었거나 이력이 없으면 경고로 알립니다. tapas 프로필은 AI 생성 콘텐츠를 게시 오류로 처리합니다. 음악은 권리 확인이 없으면 생성 자체를 막고, 이미지 참조는 글자·로고·서명·워터마크를 따라 그리지 않도록 지시합니다. 번들한 ONNX 모델 5종(가중치 파일은 6개, AnimeGAN2만 2개)은 모두 상용 사용이 가능한 허용형 라이선스(MIT·BSD-3-Clause·Apache-2.0)입니다.",
      "Rights rules meet in the same place. The publish check raises an error when an AI-generated image exists but the usage type is not generated, or when a log exists but the usage type is none, and warnings when the disclosure is empty or the log is missing. The tapas profile treats AI-generated content as a publish error. Music generation is blocked outright without a rights confirmation, and image references are told not to copy text, logos, signatures or watermarks. The five bundled ONNX models (six weight files, two of them for AnimeGAN2 alone) all carry permissive licenses that allow commercial use (MIT, BSD-3-Clause, Apache-2.0).",
    ),
    t(
      "가장 중요한 한계는 이 기록이 서명이 아니라는 점입니다. 화면도 이 기록이 편집 가능한 로컬 작업 이력이며 제공자 서명·C2PA 콘텐츠 자격 증명·서버 검증 증명이 아니라고 밝힙니다. 제작 허브의 '해시·C2PA 초안' 내려받기도 위변조 확인용 해시일 뿐 신뢰 인증서가 붙은 공개 서명이 아닙니다. 코드에 'C2PA 호환'이라 적힌 모듈 둘은 어디에서도 불러 쓰지 않습니다. 음악 요청은 공급자에게 C2PA 서명을 요청하지만 검증하지 않고, 기기 안 ONNX 작업은 이 이력에 기록되지 않습니다.",
      "The key limit is that this record is not a signature. The screen itself says it is an editable local work log and not a provider signature, C2PA content credential or server-verified proof. The Production Hub's 'hash and C2PA draft' download is likewise only a tamper-evidence hash, not a public signature backed by a trusted certificate. Two modules in the code labeled 'C2PA-compatible' are not used anywhere. Music requests ask the provider for a C2PA signature but ToonStudio does not verify it, and on-device ONNX work is not recorded in this log.",
    ),
  ],
  keyPoints: [
    t("프롬프트 원문 대신 SHA-256 해시와 내용 없는 요약만 기록", "Records a SHA-256 hash and a content-free summary instead of the raw prompt"),
    t("공개용 요약에서는 해시·요청 ID·시드·내부 ID를 모두 뺍니다", "The public summary drops hashes, request IDs, seeds and internal IDs"),
    t("이 기록은 로컬 이력이며 서명·C2PA 증명이 아닙니다", "This is a local log, not a signature or C2PA proof"),
    t("게시 전 점검이 AI 사용 유형·고지·이력의 불일치를 알립니다", "The pre-publish check flags mismatches among AI usage type, disclosure and log"),
  ],
  diagram: {
    id: "ai-provenance-rights-diagram",
    kind: "layers",
    title: t("만들 때부터 게시 전까지의 증빙", "Evidence from creation to publishing"),
    caption: t(
      "단계마다 증빙의 강도가 다릅니다. 서명은 공급자가 줄 때만 존재하고, ToonStudio의 기록은 서명 없이 규칙으로 점검합니다.",
      "Evidence differs in strength at each stage. A signature exists only if the provider provides one; ToonStudio's own records are checked by rules, unsigned.",
    ),
    alt: t(
      "위에서 아래로 다섯 층입니다. 먼저 음악 요청에서 공급자에게 서명을 요청하지만 검증하지 않습니다. 다음은 프롬프트를 해시로만 남기는 로컬 작업 이력, 해시와 내부 ID를 뺀 공개용 요약, 사용 유형과 고지를 맞춰 보는 게시 전 점검입니다. 마지막은 tapas 같은 플랫폼 정책입니다.",
      "Five layers from top to bottom. First, music requests ask the provider for a signature but do not verify it. Next come the local work log that keeps prompts only as hashes, the public summary without hashes and internal IDs, and the pre-publish check that matches usage type with disclosure. Last is platform policy such as tapas.",
    ),
    layers: [
      {
        id: "signature",
        label: t("공급자 서명 (C2PA)", "Provider signature (C2PA)"),
        sub: t("음악 요청에서 서명을 요청만 함 · 검증 안 함", "Requested on music calls only; ToonStudio does not verify it"),
        tone: "external",
        chips: ["sign_with_c2pa", "c2paRequested"],
      },
      {
        id: "local-log",
        label: t("로컬 작업 이력 (서명 아님)", "Local work log (unsigned)"),
        sub: t("요청 전 pending 기록 · 프롬프트는 해시와 요약만", "Pending before the call, settled after; prompts only as hash and summary"),
        tone: "local",
        chips: ["500 ops", "SHA-256 digest", "1.5 MB cap"],
      },
      {
        id: "public",
        label: t("공개용 요약", "Public summary"),
        sub: t("해시·요청 ID·시드·내부 ID를 뺀 비식별 투영", "A projection without hashes, request IDs, seeds or internal IDs"),
        tone: "local",
        chips: ["action", "provider", "model", "transport", "createdAt"],
      },
      {
        id: "preflight",
        label: t("게시 전 점검", "Pre-publish check"),
        sub: t("사용 유형·고지·이력이 서로 맞는지 검사", "Checks that usage type, disclosure and log agree"),
        tone: "local",
        chips: ["AI_METADATA_INCONSISTENT", "AI_DISCLOSURE_MISSING", "AI_PROVENANCE_MISSING"],
      },
      {
        id: "platform",
        label: t("플랫폼 정책", "Platform policy"),
        sub: t("예: tapas 프로필은 AI 생성물을 게시 오류로 처리", "For example, the tapas profile treats AI-generated work as a publish error"),
        tone: "warn",
        chips: ["TAPAS_AI_GENERATED_CONTENT_PROHIBITED"],
      },
    ],
    brackets: [
      {
        label: t("서명 없는 규칙 점검", "Rule-based, unsigned"),
        layerIds: ["local-log", "public", "preflight"],
      },
    ],
  },
  usage: [
    {
      feature: t("AI 기록(provenance) 패널", "AI provenance panel"),
      role: t(
        "로컬 작업 이력을 보여 주고 필터·내보내기·삭제를 제공합니다. 화면에 '제공자 서명·C2PA·서버 검증 증명이 아님'을 늘 표시합니다.",
        "Shows the local work log with filtering, export and deletion, and always states on screen that it is not a provider signature, C2PA or server-verified proof.",
      ),
      paths: [
        "apps/web/src/domains/creator/ai/StudioAiProvenancePanel.tsx",
        "apps/web/src/domains/creator/ai/studio-ai-provenance-recorder.ts",
      ],
      route: "/studio",
    },
    {
      feature: t("출처 계약 (해시·한도·공개 투영)", "Provenance contract (hashes, limits, public projection)"),
      role: t(
        "작업 500개·직렬화 1,500,000바이트·프롬프트 65,536 코드 단위 한도, 해시 전용 보관, 비식별 공개 투영을 순수 함수로 정의합니다.",
        "Defines, as pure functions, the limits (500 operations, 1,500,000 serialized bytes, 65,536 prompt code units), hash-only storage and the de-identified public projection.",
      ),
      paths: ["packages/contracts/src/studio-ai-provenance.ts#projectStudioAiProvenanceForPublish"],
    },
    {
      feature: t("게시 패키지 · 게시 전 점검", "Publish pack · pre-publish check"),
      role: t(
        "AI 사용 유형과 고지, 이력의 일치 여부를 검사해 오류·경고로 알립니다. tapas 프로필은 AI 생성 콘텐츠를 오류로 처리합니다.",
        "Checks that AI usage type, disclosure and log agree and reports errors and warnings. The tapas profile treats AI-generated content as an error.",
      ),
      paths: ["apps/web/src/domains/creator/studio-publish-preflight.ts"],
      route: "/studio",
    },
    {
      feature: t("AI 생성물에 붙는 출처", "Provenance attached to AI-generated items"),
      role: t(
        "요청을 보내기 전에 공급자·모델·전송 방식을 붙잡아 두어, 도중에 설정이 바뀌어도 생성물이 자신을 만든 요청을 설명하게 합니다. 응답이 별칭 뒤의 실제 모델을 알려 주면 모델명만 갱신합니다.",
        "Captures provider, model and transport before sending, so even if settings change mid-flight the generated item describes the request that made it. If the response reveals the real model behind an alias, only the model name is updated.",
      ),
      paths: ["apps/web/src/domains/creator/ai/studio-ai-generated-asset-model.ts#captureStudioAiGeneratedAssetProvenance"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("프롬프트는 해시만, 공개용에는 공급자·모델만", "Hash only for prompts; provider and model only for the public view"),
      language: "ts",
      code: [
        "interface Op { id: string; provider: string; model: string; promptDigest: string; requestId?: string; seed?: number }",
        "",
        "async function sha256Hex(text: string): Promise<string> {",
        '  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));',
        '  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");',
        "}",
        "",
        "// 프롬프트 원문 대신 해시만 기록한다(개인정보 최소화).",
        "export async function record(id: string, provider: string, model: string, prompt: string): Promise<Op> {",
        "  return { id, provider, model, promptDigest: await sha256Hex(prompt) };",
        "}",
        "",
        "// 공개용 요약에는 공급자·모델만 남기고 해시·요청 ID·시드는 뺀다.",
        "export const toPublic = (ops: Op[]): Array<{ provider: string; model: string }> =>",
        "  ops.map(({ provider, model }) => ({ provider, model }));",
      ].join("\n"),
      codeEn: [
        "interface Op { id: string; provider: string; model: string; promptDigest: string; requestId?: string; seed?: number }",
        "",
        "async function sha256Hex(text: string): Promise<string> {",
        '  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));',
        '  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");',
        "}",
        "",
        "// Record only a hash instead of the raw prompt (data minimization).",
        "export async function record(id: string, provider: string, model: string, prompt: string): Promise<Op> {",
        "  return { id, provider, model, promptDigest: await sha256Hex(prompt) };",
        "}",
        "",
        "// The public summary keeps only provider and model; hash, request ID and seed are dropped.",
        "export const toPublic = (ops: Op[]): Array<{ provider: string; model: string }> =>",
        "  ops.map(({ provider, model }) => ({ provider, model }));",
      ].join("\n"),
      explain: t(
        "출처 계약의 핵심 발상을 줄인 예제입니다. 실제 코드는 순수 함수에서 쓰려고 동기식 SHA-256 구현(sha256StudioAiProvenanceText)을 직접 갖고 있고, 여기서는 브라우저 표준 crypto.subtle로 바꿔 썼습니다. 실제 공개 투영은 공급자·모델 외에 action·transport·사용량·시각·참조 개수·오류 분류도 담지만, 프롬프트 해시·원문·내부 ID·요청 ID·시드는 담지 않습니다.",
        "A trimmed version of the contract's core idea. The real code carries its own synchronous SHA-256 (sha256StudioAiProvenanceText) so it can stay a pure function; here it is swapped for the browser-standard crypto.subtle. The real public projection also carries action, transport, usage, time, reference count and error category besides provider and model, but never the prompt hash, raw text, internal IDs, request ID or seed.",
      ),
      source: "packages/contracts/src/studio-ai-provenance.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("게시 전 점검: 사용 유형과 고지", "Pre-publish check: usage type and disclosure"),
      language: "ts",
      code: [
        '// 게시 점검(단순화): AI 사용 유형·고지·이력이 서로 맞아야 한다. error 가 있으면 게시할 수 없다.',
        'type Usage = "none" | "assisted" | "generated";',
        'interface Issue { code: string; severity: "error" | "warning" }',
        "",
        "export function checkAi(usage: Usage, hasAiImage: boolean, disclosure: string, historyCount: number, profile: string): Issue[] {",
        "  const issues: Issue[] = [];",
        '  if (hasAiImage && usage !== "generated") issues.push({ code: "AI_METADATA_INCONSISTENT", severity: "error" });',
        '  if (!hasAiImage && historyCount > 0 && usage === "none") issues.push({ code: "AI_METADATA_INCONSISTENT", severity: "error" });',
        "  const anyAi = usage !== \"none\" || hasAiImage || historyCount > 0;",
        '  if (anyAi && !disclosure.trim()) issues.push({ code: "AI_DISCLOSURE_MISSING", severity: "warning" });',
        '  if (anyAi && historyCount === 0) issues.push({ code: "AI_PROVENANCE_MISSING", severity: "warning" });',
        '  if (profile === "tapas" && (usage === "generated" || hasAiImage)) {',
        '    issues.push({ code: "TAPAS_AI_GENERATED_CONTENT_PROHIBITED", severity: "error" });',
        "  }",
        "  return issues;",
        "}",
      ].join("\n"),
      codeEn: [
        "// Publish check (simplified): AI usage type, disclosure and history must agree. Any error blocks publishing.",
        'type Usage = "none" | "assisted" | "generated";',
        'interface Issue { code: string; severity: "error" | "warning" }',
        "",
        "export function checkAi(usage: Usage, hasAiImage: boolean, disclosure: string, historyCount: number, profile: string): Issue[] {",
        "  const issues: Issue[] = [];",
        '  if (hasAiImage && usage !== "generated") issues.push({ code: "AI_METADATA_INCONSISTENT", severity: "error" });',
        '  if (!hasAiImage && historyCount > 0 && usage === "none") issues.push({ code: "AI_METADATA_INCONSISTENT", severity: "error" });',
        "  const anyAi = usage !== \"none\" || hasAiImage || historyCount > 0;",
        '  if (anyAi && !disclosure.trim()) issues.push({ code: "AI_DISCLOSURE_MISSING", severity: "warning" });',
        '  if (anyAi && historyCount === 0) issues.push({ code: "AI_PROVENANCE_MISSING", severity: "warning" });',
        '  if (profile === "tapas" && (usage === "generated" || hasAiImage)) {',
        '    issues.push({ code: "TAPAS_AI_GENERATED_CONTENT_PROHIBITED", severity: "error" });',
        "  }",
        "  return issues;",
        "}",
      ].join("\n"),
      explain: t(
        "studio-publish-preflight.ts의 AI 관련 규칙만 모은 예제입니다. 오류(error)가 하나라도 있으면 canPublish가 false가 되고, 경고(warning)는 알리기만 합니다. 실제 코드는 이 밖에 제목·페이지·이미지 규격 등 많은 규칙을 함께 검사합니다.",
        "Only the AI-related rules of studio-publish-preflight.ts. Any error makes canPublish false, while warnings only notify. The real code also checks many other rules such as title, pages and image specifications.",
      ),
      source: "apps/web/src/domains/creator/studio-publish-preflight.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "C2PA · Specifications",
      url: "https://spec.c2pa.org/specifications/",
      kind: "spec",
      note: t("콘텐츠에 서명된 출처 정보를 붙이는 개방 표준", "The open standard for attaching signed provenance to content"),
    },
    {
      title: "Content Credentials",
      url: "https://contentcredentials.org/",
      kind: "guide",
    },
    {
      title: "W3C · PROV Overview",
      url: "https://www.w3.org/TR/prov-overview/",
      kind: "spec",
      note: t("'누가 무엇으로 무엇을 만들었나'를 기록하는 W3C 모델", "The W3C model for recording who made what with what"),
    },
    {
      title: "MDN · SubtleCrypto.digest()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest",
      kind: "docs",
    },
  ],
  chapterIds: ["image-generation", "licenses", "sound-generation"],
  talk: {
    pitch: t(
      "AI를 쓴 작품은 어디까지 AI가 했는지 밝혀야 합니다. ToonStudio는 AI를 부르기 전에 기록을 시작하고, 프롬프트 원문 대신 해시만 남깁니다. 게시용으로는 해시와 내부 ID를 뺀 요약만 내보내고, 게시 전 점검이 사용 유형과 고지가 맞는지 확인합니다. 다만 이 기록은 서명이 아니라 로컬 이력이라는 점을 화면에 그대로 적어 둡니다.",
      "A work that used AI should say how far the AI went. ToonStudio starts a record before calling the AI and keeps only a hash instead of the raw prompt. For publishing it exports just a summary without hashes and internal IDs, and the pre-publish check verifies that usage type and disclosure agree. The screen also says plainly that this record is a local log, not a signature.",
    ),
    analogy: t(
      "장보기 영수증과 같습니다. 날짜·가게·품목은 적어 두지만 개인 메모는 적지 않고, 필요할 때는 요약본만 내밉니다. 영수증은 도장이 찍힌 증명서가 아니라는 점도 같습니다.",
      "It is like a shopping receipt: it notes date, store and items but not your private notes, and you hand over only a summary when needed. And like a receipt, it is not a stamped certificate.",
    ),
    questions: [
      {
        question: t("AI 사용 이력을 어디까지 증명하나요?", "How far does it prove AI usage?"),
        answer: t(
          "증명이 아니라 기록입니다. 로컬 작업 이력이고 사용자가 지우거나 고칠 수 있으며 제공자 서명·C2PA 검증이 아닙니다. 서명은 음악처럼 공급자가 주는 경우에만 존재하고, 그것도 ToonStudio가 검증하지는 않습니다.",
          "It is a record, not proof. It is a local work log that the user can delete or edit, and it is not a provider signature or C2PA verification. A signature exists only when the provider supplies one, as with music, and even then ToonStudio does not verify it.",
        ),
      },
      {
        question: t("기기 안 AI(ONNX)로 만든 것도 기록되나요?", "Is work done with on-device AI (ONNX) recorded too?"),
        answer: t(
          "현재는 아닙니다. 기록 대상은 텍스트·이미지 호출이고, 계약에 local 전송 방식은 있지만 ONNX 패널이 기록하지는 않습니다. 개선 후보입니다.",
          "Not today. The log covers text and image calls, and although the contract allows a local transport, the ONNX panels do not write to it. It is an improvement candidate.",
        ),
      },
      {
        question: t("저작권 침해 음악이 나오면요?", "What if the music infringes copyright?"),
        answer: t(
          "법률 판단은 하지 않습니다. 권리 확인이 없으면 생성을 막고, 프롬프트에 기존 곡·아티스트 모방 금지를 고정하며, 공급자 거절(400)은 안내합니다. 게시 전 청음과 원본성 확인은 운영 절차입니다.",
          "No legal judgment is made. Generation is blocked without a rights confirmation, a ban on imitating existing songs or artists is fixed in the prompt, and a provider refusal (400) is explained. Listening and originality checks before publishing are an operating procedure.",
        ),
      },
    ],
    pitfall: t(
      "'C2PA를 지원한다'고 말하면 오류입니다. 요청에 서명을 요청할 뿐 검증하지 않고, 코드의 'C2PA 호환' 모듈 둘은 서명이 아니며 화면에서 호출하지 않습니다. 또 이 기록으로 법적 권리나 AI 비사용을 증명한다고 말하지 마세요.",
      "Saying 'we support C2PA' is wrong. A signature is only requested, never verified, and the two 'C2PA-compatible' modules in the code are not signatures and are not called by the UI. Also do not claim this log proves legal rights or the absence of AI.",
    ),
  },
  technologies: ["SHA-256", "Web Crypto API", "C2PA", "Zod"],
  facts: [
    {
      value: "500 / 1,500,000 B / 65,536",
      label: t("작업 수 / 직렬화 크기 / 프롬프트 코드 단위 상한", "Operations / serialized bytes / prompt code units cap"),
      source: "packages/contracts/src/studio-ai-provenance.ts",
    },
    {
      value: "24",
      label: t("작업 하나에 연결할 수 있는 참조 수 상한", "Maximum references attached to one operation"),
      source: "packages/contracts/src/studio-ai-provenance.ts",
    },
    {
      value: "2 errors / 2 warnings",
      label: t("AI 관련 게시 점검 코드(오류: 메타데이터 불일치·tapas 정책 / 경고: 고지·이력 누락)", "AI-related publish checks (errors: metadata mismatch, tapas policy / warnings: missing disclosure or log)"),
      source: "apps/web/src/domains/creator/studio-publish-preflight.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_AI_TRUST: readonly EngineeringAtlasEntry[] = [
  AI_PROPOSAL_NOT_COMMIT,
  AI_PROVENANCE_RIGHTS,
];
