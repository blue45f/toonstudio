import type { OpenAiAssistStructuredResult } from "./studio-openai-assist-result";

type MacroData = Extract<OpenAiAssistStructuredResult, { mode: "mcp-workflow-macro" }>["data"];

function excerpt(value: string, limit: number): string {
  const text = value.trim().replace(/\s+/gu, " ");
  if (text.length <= limit) return text;
  return text.slice(0, limit - 1).replace(/[\uD800-\uDBFF]$/u, "") + "…";
}

const PIXEL_SIZE = /(?<![\d.-])(\d{1,6})\s*(?:px|픽셀)?\s*[×xX*]\s*(\d{1,6})(?![\d.])(?:[ \t]*(px|픽셀|[a-z]+|밀리미터|센티미터|인치|포인트|미터|%))?/giu;

function readCanvasSize(clauses: readonly string[]) {
  const sizes = new Map<string, { width: number; height: number }>();
  for (const part of clauses) {
    const pairs = [...part.matchAll(PIXEL_SIZE)];
    for (const pair of pairs) {
      const prefix = part.slice(0, pair.index);
      const suffix = part.slice(pair.index + pair[0].length);
      const labeled = /캔버스(?:의|는|를|가)?\s*(?:(?:규격|크기|해상도)(?:은|는|를|가)?)?\s*[:：=]?\s*$/u.test(prefix)
        || /^\s*(?:\d+화\s*)?(?:새\s*)?캔버스/u.test(suffix);
      if (!labeled) continue;
      if (pairs.length > 1 || (pair[3] && !/^(px|픽셀)$/iu.test(pair[3]))) return undefined;
      sizes.set(`${pair[1]}×${pair[2]}`, { width: Number(pair[1]), height: Number(pair[2]) });
    }
  }
  if (sizes.size === 1) return [...sizes.values()][0];
}

function requestedCanvasClauses(brief: string) {
  // 문서를 초기화할 때는 제작자가 직접 쓴 완결된 규격 또는 명령문만 인정한다.
  const unquoted = brief
    .replace(/^[ \t]*(?:\[창작자 입력\]|(?:연출 목표|검수 대상|장면 목표|담당자)[ \t:：]+[^\r\n]*)[ \t]*$/gmu, "")
    .replace(/^\s*>[^\n]*$/gmu, "인용문")
    .replace(/“[^”]*(?:”|$)|‘[^’]*(?:’|$)|「[^」]*(?:」|$)|『[^』]*(?:』|$)|`[^`]*(?:`|$)|"[^"]*(?:"|$)|'[^']*(?:'|$)/gu, "인용문");
  const sentences = unquoted.split(/[.!。](?=\s|$)/u);
  const requests: string[] = [];
  for (const sentence of sentences) {
    const [first, ...rest] = sentence.trim().split(/\s*,\s*/u);
    // 쉼표 뒤에는 지정된 연출 수치만 이어질 수 있다. 조건·선택지가 붙으면 수동 판단한다.
    if (!rest.every((part) => /^(?:(?:카메라\s*)?(?:시작\s*)?(?:렌즈|초점거리)(?:는|를)?\s*\d+(?:\.\d+)?\s*mm|(?:별도\s*)?(?:효과\s*)?레이어(?:의)?\s*불투명도(?:\s*시작값은|는)?\s*\d+(?:\.\d+)?\s*%)(?:입니다)?$/iu.test(part))) continue;
    const normalized = first.replace(PIXEL_SIZE, "규격값").trim();
    const specification = /^(?:새로운|새|신규|가상)\s*캔버스(?:는|의\s*규격은)?\s*규격값(?:입니다)?$/u;
    const directCommand = /^(?:(?:새로운|새|신규|가상)\s*)?(?:캔버스(?:를|는)?\s*규격값(?:으로|로|을|를)?|규격값\s*(?:\d+화\s*)?캔버스(?:를)?)\s*(?:새로\s*)?(?:만들어\s*(?:주세요|줘)|만든다|만듭니다|생성(?:해\s*(?:주세요|줘)|한다|합니다)?|만들고\s*(?:출고|사전)\s*점검)$/u;
    if (specification.test(normalized) || directCommand.test(normalized)) requests.push(first);
  }
  return requests;
}

function readNewLayer(source: string) {
  const names = [...source.matchAll(/(?<![\p{L}\p{N}])(?:새로운|새|신규)\s*(?:레이어\s*[‘“「"']([^’”」"'\n]{1,64})[’”」"']|[‘“「"']([^’”」"'\n]{1,64})[’”」"']\s*레이어)/gu)];
  if (names.length !== 1) return undefined;
  const [match] = names;
  const name = match[1] ?? match[2];
  const afterName = source.slice(match.index + match[0].length);
  const opacityLabel = /^(?:의|는|를)?\s*불투명도(?:는|를|로|\s*시작값은)?\s*[:：]?\s*/u;
  const label = afterName.match(opacityLabel);
  if (!label) return { name };
  const percentage = afterName.slice(label[0].length).match(/^(\d+(?:\.\d+)?)\s*%/u)?.[1];
  if (percentage !== undefined && Number(percentage) <= 100) return { name, percentage };
}

function readLensValues(clauses: readonly string[]) {
  const values = new Set<string>();
  for (const part of clauses) {
    const lengths = [...part.matchAll(/(?<![\d.])(-?\d+(?:\.\d+)?)\s*mm\b/giu)];
    const lensLabel = /(?:렌즈|초점\s*거리|lensMm)(?:의|는|를|가)?\s*(?:시작값(?:은)?|값(?:은)?)?\s*[:：=]?\s*$/iu;
    const isLens = lengths.some((entry) => lensLabel.test(part.slice(0, entry.index)) || /^\s*렌즈/u.test(part.slice(entry.index + entry[0].length)));
    if (isLens) for (const entry of lengths) values.add(entry[1]);
  }
  return values;
}

export function buildLocalWorkflowMacro(input: string, projectTitle: string): MacroData {
  const source = input.split(/^[ \t]*(?:\[원고\](?=\s|$)|\d+\s*컷[.:：](?=\s|$))/mu, 1)[0];
  const title = excerpt(projectTitle, 120) || "현재 원고";
  const clauses = source.replace(/(\d),(?=\d{3}(?:\D|$))/gu, "$1")
    .split(/(?:[.!?。](?=\s|$)|[,;\n])/u).map((part) => part.trim()).filter(Boolean);
  const namedTools = new Set(source.match(/studio\.[a-z0-9_]+\.[a-z0-9_]+/gu) ?? []);
  const canPlan = (tool: string) => namedTools.size === 0 || namedTools.has(tool);
  const steps: MacroData["steps"] = [];
  const notes: string[] = [];
  const addStep = (toolName: string, reasonKo: string, args: Record<string, unknown>) => {
    steps.push({ stepOrder: steps.length + 1, toolName, reasonKo, argumentsJson: JSON.stringify(args) });
  };
  const goal = source.match(/(?:연출 목표|검수 대상|장면 목표)\s*[:：]\s*([^\n.!?。]{1,150})/u)?.[1]
    ?? source.match(/[「“]([^」”\n]{1,150})[」”](?:의\s*매크로|\s*매크로)/u)?.[1];
  const focus = goal ? `‘${excerpt(goal, 65)}’` : "원고에서 지정한 연출";
  const canvas = "studio.canvas.create";
  const scene = "studio.bg3d.compose_scene";
  const addLayer = "studio.canvas.add_layer";
  const fx = "studio.photoshop.apply_layer_fx";
  const preflight = "studio.export.preflight_check";
  const layersRequested = /레이어|림라이트|외곽광선|apply_layer_fx|add_layer/u.test(source);
  const summary = (note: string): MacroData => ({
    macroTitle: `${title} 제작 매크로 초안`,
    summary: note,
    zeroCostSafe: true,
    steps,
  });

  // 금지·제외 범위가 자유 문장으로 주어지면 로컬 해석만으로 호출을 고르지 않는다.
  const restricted = clauses.find((part) => /도구|studio\.|캔버스|생성|레이어|렌즈|카메라|효과|점검/u.test(part)
    && /금지|제외|사용하지|호출하지|만들지|생성하지|생략|쓰지|하지\s*마/u.test(part));
  if (restricted) {
    return summary(`수동 확인 대기. 원고의 제한 ‘${excerpt(restricted, 140)}’을 확인하고, 사용할 도구 이름과 대상·설정값을 명시한 뒤 계획을 다시 작성하세요.`);
  }

  const canvasClauses = clauses.filter((part) => part.includes("캔버스"));
  const createRequests = requestedCanvasClauses(source.replace(/(\d),(?=\d{3}(?:\D|$))/gu, "$1"));
  const unidentifiedSize = canvasClauses.some((part) => /^(?:새로운|새|신규|가상)\s*캔버스/u.test(part)) && !readCanvasSize(canvasClauses);
  if ((createRequests.length || unidentifiedSize) && canPlan(canvas)) {
    if (canvasClauses.some((part) => /(?:기존|현재|열린|작업 중인)\s*캔버스/u.test(part))) {
      return summary("수동 확인 대기. 기존 원고를 보존할 작업본을 먼저 준비하고, 새 캔버스에서 진행할 작업을 지정해 재개하세요.");
    }
    const size = readCanvasSize(createRequests);
    if (size && size.width >= 64 && size.height >= 64) {
      addStep(canvas, `새 캔버스를 ${size.width}×${size.height}px로 만들어 연출을 시작합니다.`, { title, ...size });
    } else {
      const request = canvasClauses.length ? `원고 설정 ‘${excerpt(canvasClauses.join(", "), 120)}’. ` : "";
      return summary(`수동 확인 대기. ${request}새 캔버스의 가로와 세로를 64px 이상의 픽셀 수 한 쌍으로 지정한 뒤 재개하세요.`);
    }
  }

  const lensValues = readLensValues(clauses);
  const [lens] = lensValues;
  if (canPlan(scene) && (namedTools.has(scene) || /카메라|렌즈|초점\s*거리|3D\s*(?:배경|장면)/iu.test(source))) {
    const lensMm = Number(lens);
    if (lensValues.size === 1 && Number.isInteger(lensMm) && lensMm >= 12 && lensMm <= 200) {
      addStep(scene, `${focus}에 맞춰 ${lens}mm 렌즈를 설정합니다. 장면 미리보기에서 피사체의 위치와 거리감을 확인하세요.`,
        { sceneName: goal ? excerpt(goal, 80) : title, lensMm });
    } else {
      const requested = [...lensValues].map((value) => value + "mm").join(", ");
      notes.push(`${requested ? `원고 렌즈 ${excerpt(requested, 55)}. ` : ""}초점거리 한 가지(12~200mm 정수)를 확인한 뒤 장면을 구성하세요.`);
    }
  }

  const layer = readNewLayer(source);
  const createLayer = layer && canPlan(addLayer);
  if (createLayer) {
    const opacity = layer.percentage === undefined ? {} : { opacity: Number(layer.percentage) / 100 };
    const setting = layer.percentage === undefined ? "" : ` (레이어 불투명도 ${layer.percentage}%)`;
    addStep(addLayer, `현재 작업면에 ‘${layer.name}’ 레이어를 추가합니다${setting}. 실제 ID는 반환된 layer.id에서 확인하세요.`,
      { name: layer.name, ...opacity });
  }
  const fxRequested = /림라이트|외곽광선|그림자 효과|레이어 스타일|효과(?:의|\s*자체의)?\s*(?:불투명도|강도)|layer[_ ]fx|outer-glow|drop-shadow|opacityPct|radiusPx/iu.test(source);
  if (layersRequested && (!createLayer || fxRequested)) {
    const settings = clauses.filter((part) => /불투명도|opacityPct|반경|반지름|radiusPx/iu.test(part));
    const values = settings.length ? `원고 설정 ‘${excerpt(settings.join(", "), 100)}’의 대상과 단위를 대조하세요. ` : "";
    const action = fxRequested && canPlan(fx) ? `레이어 불투명도는 편집기에서, 효과 자체는 ${fx}에서 조정하세요.` : "편집기에서 해당 레이어를 선택해 조정하세요.";
    notes.push(`${goal ? focus + "에 사용할 " : ""}실제 대상 레이어 ID를 확인하세요. ${values}${action}`);
  }
  if (canPlan(preflight) && (namedTools.has(preflight) || /(?:내보내기|출고|사전\s*점검|프리플라이트)/u.test(source))) {
    const platform = source.match(/\b(naver-webtoon|kakao-webtoon|webtoon-global|print-cmyk)\b/u)?.[1];
    const platformNote = platform ? platform : "도구 기본값(naver-webtoon)";
    addStep(preflight, `완성된 컷에서 ${focus}의 위치와 거리감을 육안으로 확인한 뒤 ${platformNote} 기준으로 현재 캔버스의 폭과 권리·비용을 점검합니다.`,
      { platform: platform ?? "naver-webtoon", requireCleanRightsBom: true, rightsBomClean: false });
    if (notes.length) notes.push(`수동 작업 후 ${steps.length}단계 점검으로 재개하세요.`);
  }
  if (steps.length === 0) notes.unshift("수동 확인 대기.");
  if (!steps.length && !layersRequested && !lensValues.size) notes.push("작업할 대상과 허용 도구, 적용할 수치·단위를 알려 주세요.");
  if (!notes.length) notes.push(`미리보기에서 ${focus}의 결과를 원고와 대조하세요. 자동 단계는 실행 전 계획입니다.`);
  return summary(notes.join(" "));
}
