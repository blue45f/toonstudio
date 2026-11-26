/**
 * #34 무서버 분기형 인터랙티브 웹툰 조건식 AST 파서·평가기 및 정적 HTML/JS 엣지 런타임 생성기 (₩0 서버 상태).
 *
 * - `eval` / `new Function`을 일절 사용하지 않는 CSP-안전 재귀 하강 파서로
 *   `trust >= 2 && !betrayed`, `route == "dawn"` 같은 조건식을 AST로 컴파일·평가한다.
 * - 생성된 단일 HTML 번들은 브라우저 `localStorage`(₩0 서버 비용)만으로 상태 플래그와
 *   해금 엔딩 도감을 관리한다.
 */

export type BranchStateValue = number | boolean | string;
export type BranchStateMap = Record<string, BranchStateValue>;

export type BranchMutationOp = "set" | "add" | "sub" | "toggle";

export interface BranchStateMutation {
  readonly flag: string;
  readonly op: BranchMutationOp;
  readonly value?: BranchStateValue;
}

export type ComparisonOperator = ">=" | "<=" | ">" | "<" | "==" | "!=";

export type ConditionAstNode =
  | { readonly type: "literal"; readonly value: BranchStateValue }
  | { readonly type: "ident"; readonly name: string }
  | { readonly type: "not"; readonly operand: ConditionAstNode }
  | { readonly type: "compare"; readonly op: ComparisonOperator; readonly left: ConditionAstNode; readonly right: ConditionAstNode }
  | { readonly type: "logical"; readonly op: "&&" | "||"; readonly left: ConditionAstNode; readonly right: ConditionAstNode };

export interface ConditionParseResult {
  readonly ok: boolean;
  readonly ast: ConditionAstNode | null;
  readonly error?: string;
}

export interface CompiledBranchChoice {
  readonly choiceId: string;
  readonly label: string;
  readonly targetNodeId: string;
  readonly condition?: string;
  readonly conditionAst?: ConditionAstNode;
  readonly effects: readonly BranchStateMutation[];
  readonly hiddenUntilUnlocked: boolean;
  readonly lockHint?: string;
}

export interface CompiledBranchNode {
  readonly id: string;
  readonly title: string;
  readonly kind: "cut" | "choice" | "secret" | "ending";
  readonly imageAssetPath: string;
  readonly caption?: string;
  readonly endingCode?: string;
  readonly endingTier?: "true" | "good" | "normal" | "bad" | "secret";
  readonly unlockCondition?: string;
  readonly unlockConditionAst?: ConditionAstNode;
  readonly onEnterEffects: readonly BranchStateMutation[];
  readonly nextNodeId?: string;
  readonly choices: readonly CompiledBranchChoice[];
}

export interface StaticBranchingManifest {
  readonly schemaVersion: "toonstudio.branching.v1";
  readonly episodeId: string;
  readonly title: string;
  readonly author: string;
  readonly version: string;
  readonly locale: "ko" | "en" | "ja" | "zh";
  readonly startNodeId: string;
  readonly initialFlags: Readonly<BranchStateMap>;
  readonly nodes: readonly CompiledBranchNode[];
  readonly endingIds: readonly string[];
  readonly secretCutIds: readonly string[];
  readonly referencedFlags: readonly string[];
  readonly serverStateRequired: false;
  readonly estimatedServerCostKrw: 0;
}

interface Token {
  readonly kind: "ident" | "number" | "string" | "boolean" | "op" | "lparen" | "rparen" | "eof";
  readonly value: string;
}

function tokenizeCondition(expr: string): { readonly ok: boolean; readonly tokens: Token[]; readonly error?: string } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < expr.length) {
    const ch = expr.charAt(i);
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
      i += 1;
      continue;
    }
    if (ch === "(") {
      tokens.push({ kind: "lparen", value: "(" });
      i += 1;
      continue;
    }
    if (ch === ")") {
      tokens.push({ kind: "rparen", value: ")" });
      i += 1;
      continue;
    }
    const two = expr.slice(i, i + 2);
    if (two === ">=" || two === "<=" || two === "==" || two === "!=" || two === "&&" || two === "||") {
      tokens.push({ kind: "op", value: two });
      i += 2;
      continue;
    }
    if (ch === ">" || ch === "<" || ch === "!") {
      tokens.push({ kind: "op", value: ch });
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let literal = "";
      while (j < expr.length && expr.charAt(j) !== quote) {
        if (expr.charAt(j) === "\\" && j + 1 < expr.length) {
          literal += expr.charAt(j + 1);
          j += 2;
        } else {
          literal += expr.charAt(j);
          j += 1;
        }
      }
      if (j >= expr.length) {
        return { ok: false, tokens: [], error: "닫히지 않은 문자열 리터럴입니다." };
      }
      tokens.push({ kind: "string", value: literal });
      i = j + 1;
      continue;
    }
    const isNegativeNum =
      ch === "-" &&
      i + 1 < expr.length &&
      expr.charAt(i + 1) >= "0" &&
      expr.charAt(i + 1) <= "9";
    if ((ch >= "0" && ch <= "9") || isNegativeNum) {
      let j = ch === "-" ? i + 1 : i;
      let dotSeen = false;
      while (j < expr.length) {
        const c = expr.charAt(j);
        if (c >= "0" && c <= "9") {
          j += 1;
        } else if (c === "." && !dotSeen) {
          dotSeen = true;
          j += 1;
        } else {
          break;
        }
      }
      tokens.push({ kind: "number", value: expr.slice(i, j) });
      i = j;
      continue;
    }
    if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "_") {
      let j = i + 1;
      while (j < expr.length) {
        const c = expr.charAt(j);
        const isIdentChar =
          (c >= "a" && c <= "z") ||
          (c >= "A" && c <= "Z") ||
          (c >= "0" && c <= "9") ||
          c === "_" ||
          c === ".";
        if (!isIdentChar) {
          break;
        }
        j += 1;
      }
      const word = expr.slice(i, j);
      if (word === "true" || word === "false") {
        tokens.push({ kind: "boolean", value: word });
      } else {
        tokens.push({ kind: "ident", value: word });
      }
      i = j;
      continue;
    }
    return { ok: false, tokens: [], error: `허용되지 않은 토큰 문자 '${ch}'가 포함되었습니다.` };
  }
  tokens.push({ kind: "eof", value: "" });
  return { ok: true, tokens };
}

/**
 * 조건식 문자열을 CSP-안전 AST로 파싱한다(`eval` 미사용).
 */
export function parseBranchCondition(expression: string): ConditionParseResult {
  const trimmed = expression.trim();
  if (trimmed.length === 0) {
    return { ok: false, ast: null, error: "빈 조건식은 허용되지 않습니다." };
  }
  const lexed = tokenizeCondition(trimmed);
  if (!lexed.ok) {
    return { ok: false, ast: null, error: lexed.error };
  }
  const tokens = lexed.tokens;
  let pos = 0;

  const peek = (): Token => tokens[pos];
  const consume = (): Token => {
    const current = tokens[pos];
    pos += 1;
    return current;
  };

  function parseOr(): ConditionAstNode {
    let left = parseAnd();
    while (peek().kind === "op" && peek().value === "||") {
      consume();
      left = { type: "logical", op: "||", left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): ConditionAstNode {
    let left = parseUnary();
    while (peek().kind === "op" && peek().value === "&&") {
      consume();
      left = { type: "logical", op: "&&", left, right: parseUnary() };
    }
    return left;
  }

  function parseUnary(): ConditionAstNode {
    if (peek().kind === "op" && peek().value === "!") {
      consume();
      return { type: "not", operand: parseUnary() };
    }
    return parseComparison();
  }

  function parseComparison(): ConditionAstNode {
    const left = parsePrimary();
    const next = peek();
    if (
      next.kind === "op" &&
      (next.value === ">=" ||
        next.value === "<=" ||
        next.value === ">" ||
        next.value === "<" ||
        next.value === "==" ||
        next.value === "!=")
    ) {
      const op = consume().value as ComparisonOperator;
      return { type: "compare", op, left, right: parsePrimary() };
    }
    return left;
  }

  function parsePrimary(): ConditionAstNode {
    const tok = peek();
    if (tok.kind === "lparen") {
      consume();
      const inner = parseOr();
      if (peek().kind !== "rparen") {
        throw new Error("닫는 괄호 ')'가 누락되었습니다.");
      }
      consume();
      return inner;
    }
    if (tok.kind === "number") {
      consume();
      return { type: "literal", value: Number(tok.value) };
    }
    if (tok.kind === "string") {
      consume();
      return { type: "literal", value: tok.value };
    }
    if (tok.kind === "boolean") {
      consume();
      return { type: "literal", value: tok.value === "true" };
    }
    if (tok.kind === "ident") {
      consume();
      return { type: "ident", name: tok.value };
    }
    throw new Error(`예상치 못한 토큰 '${tok.value || "EOF"}'입니다.`);
  }

  try {
    const ast = parseOr();
    if (peek().kind !== "eof") {
      return { ok: false, ast: null, error: `해석되지 않은 잔여 토큰 '${peek().value}'가 있습니다.` };
    }
    return { ok: true, ast };
  } catch (err) {
    return { ok: false, ast: null, error: err instanceof Error ? err.message : "조건식 파싱 오류" };
  }
}

function evalNodeValue(node: ConditionAstNode, flags: Readonly<BranchStateMap>): BranchStateValue {
  if (node.type === "literal") {
    return node.value;
  }
  if (node.type === "ident") {
    return Object.prototype.hasOwnProperty.call(flags, node.name) ? flags[node.name] : 0;
  }
  if (node.type === "not") {
    return !evalNodeValue(node.operand, flags);
  }
  if (node.type === "logical") {
    const leftBool = Boolean(evalNodeValue(node.left, flags));
    if (node.op === "&&") {
      return leftBool && Boolean(evalNodeValue(node.right, flags));
    }
    return leftBool || Boolean(evalNodeValue(node.right, flags));
  }
  const leftVal = evalNodeValue(node.left, flags);
  const rightVal = evalNodeValue(node.right, flags);
  if (node.op === "==") {
    return leftVal === rightVal;
  }
  if (node.op === "!=") {
    return leftVal !== rightVal;
  }
  const leftNum = Number(leftVal);
  const rightNum = Number(rightVal);
  if (node.op === ">=") {
    return leftNum >= rightNum;
  }
  if (node.op === "<=") {
    return leftNum <= rightNum;
  }
  if (node.op === ">") {
    return leftNum > rightNum;
  }
  return leftNum < rightNum;
}

/**
 * 컴파일된 조건식 AST를 상태 플래그 맵에 대해 결정적으로 평가한다.
 */
export function evaluateBranchCondition(ast: ConditionAstNode, flags: Readonly<BranchStateMap>): boolean {
  return Boolean(evalNodeValue(ast, flags));
}

/**
 * 조건식 AST에서 참조하는 모든 상태 플래그 이름을 추출한다.
 */
export function extractConditionFlags(ast: ConditionAstNode, out: Set<string>): void {
  if (ast.type === "ident") {
    out.add(ast.name);
    return;
  }
  if (ast.type === "not") {
    extractConditionFlags(ast.operand, out);
    return;
  }
  if (ast.type === "compare" || ast.type === "logical") {
    extractConditionFlags(ast.left, out);
    extractConditionFlags(ast.right, out);
  }
}

/**
 * 상태 플래그 변경 목록을 순수 함수로 적용해 새 상태 맵을 반환한다.
 */
export function applyBranchMutations(
  current: Readonly<BranchStateMap>,
  mutations: readonly BranchStateMutation[],
): BranchStateMap {
  const next: BranchStateMap = { ...current };
  for (let i = 0; i < mutations.length; i += 1) {
    const m = mutations[i];
    const existing = Object.prototype.hasOwnProperty.call(next, m.flag) ? next[m.flag] : undefined;
    if (m.op === "set") {
      next[m.flag] = m.value !== undefined ? m.value : true;
    } else if (m.op === "toggle") {
      next[m.flag] = !existing;
    } else if (m.op === "add") {
      const base = typeof existing === "number" ? existing : 0;
      const delta = typeof m.value === "number" ? m.value : 1;
      next[m.flag] = base + delta;
    } else {
      const base = typeof existing === "number" ? existing : 0;
      const delta = typeof m.value === "number" ? m.value : 1;
      next[m.flag] = base - delta;
    }
  }
  return next;
}

function escapeHtmlText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 서버 상태 ₩0으로 즉시 정적 호스팅 가능한 단독 HTML5+CSS+ES2017 엣지 런타임을 생성한다.
 */
export function renderStandaloneBranchingHtml(manifest: StaticBranchingManifest): string {
  const safeJson = JSON.stringify(manifest).replace(/<\//g, "<\\/");
  const safeTitle = escapeHtmlText(manifest.title);
  const safeAuthor = escapeHtmlText(manifest.author);

  return [
    "<!doctype html>",
    `<html lang="${manifest.locale}">`,
    "<head>",
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width,initial-scale=1">',
    `  <title>${safeTitle} — ToonStudio Static Branching Reader</title>`,
    "  <style>",
    "    :root{color-scheme:light;font-family:-apple-system,BlinkMacSystemFont,'Pretendard',sans-serif;}",
    "    body{margin:0;background:#faf8f3;color:#1b2a22;display:flex;justify-content:center;padding:24px 16px;}",
    "    .shell{width:100%;max-width:760px;background:#fff;border:1px solid rgba(31,68,53,.12);border-radius:16px;overflow:hidden;box-shadow:0 8px 24px rgba(27,42,34,.06);}",
    "    header{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;background:#f3f0e8;border-bottom:1px solid rgba(31,68,53,.1);}",
    "    .stage{padding:20px;display:flex;flex-direction:column;gap:14px;}",
    "    .cut-img{width:100%;border-radius:10px;background:#eae6dc;min-height:220px;object-fit:contain;}",
    "    .choices{display:flex;flex-direction:column;gap:10px;margin-top:8px;}",
    "    button.choice{min-height:44px;padding:12px 16px;border-radius:10px;border:1px solid #1f4435;background:#1f4435;color:#fff;font-size:15px;text-align:left;cursor:pointer;}",
    "    button.choice[disabled]{background:#eceae4;color:#6c7570;border-color:#d4d0c7;cursor:not-allowed;}",
    "    .meta{font-size:13px;color:#4f5f56;display:flex;gap:12px;flex-wrap:wrap;}",
    "  </style>",
    "</head>",
    "<body>",
    '  <main class="shell" data-runtime="toonstudio-zero-server-branching">',
    "    <header>",
    `      <div><strong>${safeTitle}</strong><div class="meta"><span>${safeAuthor}</span><span id="ending-counter"></span></div></div>`,
    '      <button type="button" id="restart-btn">처음부터</button>',
    "    </header>",
    '    <section class="stage">',
    '      <h2 id="cut-title"></h2>',
    '      <img id="cut-img" class="cut-img" alt="">',
    '      <p id="cut-caption"></p>',
    '      <div id="choices" class="choices"></div>',
    '      <div id="flags-bar" class="meta"></div>',
    "    </section>",
    "  </main>",
    `  <script id="toonstudio-branching-manifest" type="application/json">${safeJson}</script>`,
    "  <script>",
    "    (function(){",
    '      var manifest = JSON.parse(document.getElementById("toonstudio-branching-manifest").textContent);',
    '      var storeKey = "toonstudio.branch." + manifest.episodeId + "." + manifest.version;',
    "      var nodeMap = {}; for (var i=0;i<manifest.nodes.length;i++){ nodeMap[manifest.nodes[i].id] = manifest.nodes[i]; }",
    "      function evalVal(n, f){ if(n.type==='literal') return n.value; if(n.type==='ident') return Object.prototype.hasOwnProperty.call(f,n.name)?f[n.name]:0; if(n.type==='not') return !evalVal(n.operand,f); if(n.type==='logical') return n.op==='&&'?(Boolean(evalVal(n.left,f))&&Boolean(evalVal(n.right,f))):(Boolean(evalVal(n.left,f))||Boolean(evalVal(n.right,f))); var l=evalVal(n.left,f), r=evalVal(n.right,f); if(n.op==='==') return l===r; if(n.op==='!=') return l!==r; l=Number(l); r=Number(r); if(n.op==='>=') return l>=r; if(n.op==='<=') return l<=r; if(n.op==='>') return l>r; return l<r; }",
    "      function applyMut(f, ms){ var out=Object.assign({},f); for(var i=0;i<ms.length;i++){ var m=ms[i], cur=out[m.flag]; if(m.op==='set') out[m.flag]=m.value!==undefined?m.value:true; else if(m.op==='toggle') out[m.flag]=!Boolean(cur); else if(m.op==='add') out[m.flag]=(typeof cur==='number'?cur:0)+(typeof m.value==='number'?m.value:1); else out[m.flag]=(typeof cur==='number'?cur:0)-(typeof m.value==='number'?m.value:1); } return out; }",
    "      var restored = false;",
    "      var state = { nodeId: manifest.startNodeId, flags: Object.assign({}, manifest.initialFlags), endings: [] };",
    "      try { var saved = localStorage.getItem(storeKey); if(saved){ state = JSON.parse(saved); restored = true; } } catch(e){}",
    "      function persist(){ try { localStorage.setItem(storeKey, JSON.stringify(state)); } catch(e){} }",
    "      function enterNode(id){ var node = nodeMap[id]; if(!node) return; state.nodeId = id; state.flags = applyMut(state.flags, node.onEnterEffects || []); if(node.kind==='ending' && state.endings.indexOf(id)===-1){ state.endings.push(id); } persist(); render(); }",
    "      function render(){ var node = nodeMap[state.nodeId]; if(!node) return; document.getElementById('cut-title').textContent = node.title; var img = document.getElementById('cut-img'); img.src = node.imageAssetPath; img.alt = node.title; document.getElementById('cut-caption').textContent = node.caption || ''; document.getElementById('ending-counter').textContent = '엔딩 ' + state.endings.length + '/' + manifest.endingIds.length; var box = document.getElementById('choices'); box.textContent = ''; if(node.choices && node.choices.length > 0){ for(var i=0;i<node.choices.length;i++){ (function(c){ var ok = !c.conditionAst || Boolean(evalVal(c.conditionAst, state.flags)); var target = nodeMap[c.targetNodeId]; if(ok && target && target.unlockConditionAst){ ok = Boolean(evalVal(target.unlockConditionAst, state.flags)); } if(!ok && c.hiddenUntilUnlocked) return; var btn = document.createElement('button'); btn.type='button'; btn.className='choice'; btn.disabled = !ok; btn.textContent = ok ? c.label : (c.label + ' (' + (c.lockHint || '조건 미충족') + ')'); btn.addEventListener('click', function(){ if(!ok) return; state.flags = applyMut(state.flags, c.effects || []); enterNode(c.targetNodeId); }); box.appendChild(btn); })(node.choices[i]); } } else if(node.nextNodeId){ var nextBtn = document.createElement('button'); nextBtn.type='button'; nextBtn.className='choice'; nextBtn.textContent='다음 컷으로'; nextBtn.addEventListener('click', function(){ enterNode(node.nextNodeId); }); box.appendChild(nextBtn); } document.getElementById('flags-bar').textContent = '상태: ' + JSON.stringify(state.flags); }",
    "      document.getElementById('restart-btn').addEventListener('click', function(){ state.flags = Object.assign({}, manifest.initialFlags); enterNode(manifest.startNodeId); });",
    "      if(restored){ render(); } else { enterNode(manifest.startNodeId); }",
    "    })();",
    "  </script>",
    "</body>",
    "</html>",
  ].join("\n");
}

export interface BranchingPlaythroughStep {
  readonly nodeId: string;
  readonly nodeKind: "cut" | "choice" | "secret" | "ending";
  readonly selectedChoiceId: string | null;
  readonly flagsAfterStep: Readonly<BranchStateMap>;
}

export interface BranchingPlaythroughResult {
  readonly ok: boolean;
  readonly finalNodeId: string;
  readonly reachedEnding: boolean;
  readonly endingCode?: string;
  readonly finalFlags: Readonly<BranchStateMap>;
  readonly steps: readonly BranchingPlaythroughStep[];
  readonly error?: string;
}

/**
 * Tarjan 강연결 요소(SCC) 알고리즘으로 도달 가능 서브그래프의 모든 순환(크기 >= 2 또는 자기 루프)을 찾는다.
 */
export function findStronglyConnectedCycles(
  nodeIds: readonly string[],
  adjacency: Readonly<Record<string, readonly string[]>>,
): string[][] {
  let currentIndex = 0;
  const indexMap: Record<string, number> = {};
  const lowLink: Record<string, number> = {};
  const onStack: Record<string, boolean> = {};
  const stack: string[] = [];
  const cycles: string[][] = [];

  function strongConnect(v: string): void {
    indexMap[v] = currentIndex;
    lowLink[v] = currentIndex;
    currentIndex += 1;
    stack.push(v);
    onStack[v] = true;

    const neighbors = adjacency[v] ?? [];
    for (let i = 0; i < neighbors.length; i += 1) {
      const w = neighbors[i];
      if (!Object.prototype.hasOwnProperty.call(indexMap, w)) {
        strongConnect(w);
        if (lowLink[w] < lowLink[v]) {
          lowLink[v] = lowLink[w];
        }
      } else if (onStack[w] && indexMap[w] < lowLink[v]) {
        lowLink[v] = indexMap[w];
      }
    }

    if (lowLink[v] === indexMap[v]) {
      const component: string[] = [];
      let w: string;
      do {
        w = stack.pop() as string;
        onStack[w] = false;
        component.push(w);
      } while (w !== v);

      if (component.length > 1) {
        cycles.push(component.reverse());
      } else if (component.length === 1) {
        const only = component[0];
        const selfNeighbors = adjacency[only] ?? [];
        if (selfNeighbors.indexOf(only) !== -1) {
          cycles.push([only]);
        }
      }
    }
  }

  for (let i = 0; i < nodeIds.length; i += 1) {
    const id = nodeIds[i];
    if (!Object.prototype.hasOwnProperty.call(indexMap, id)) {
      strongConnect(id);
    }
  }
  return cycles;
}

/**
 * 역방향 BFS로 엔딩 노드에 구조적으로 도달 가능한 모든 노드 ID 집합을 계산한다.
 */
export function computeNodesReachingAnyEnding(
  nodes: readonly CompiledBranchNode[],
  nodeMap: Readonly<Record<string, CompiledBranchNode>>,
): Set<string> {
  const reverseAdj: Record<string, string[]> = {};
  const queue: string[] = [];
  const canReachEnding = new Set<string>();

  for (let i = 0; i < nodes.length; i += 1) {
    reverseAdj[nodes[i].id] = [];
  }
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.kind === "ending") {
      canReachEnding.add(node.id);
      queue.push(node.id);
    }
    if (node.nextNodeId && nodeMap[node.nextNodeId]) {
      reverseAdj[node.nextNodeId].push(node.id);
    }
    for (let c = 0; c < node.choices.length; c += 1) {
      const target = node.choices[c].targetNodeId;
      if (nodeMap[target]) {
        reverseAdj[target].push(node.id);
      }
    }
  }

  let head = 0;
  while (head < queue.length) {
    const cur = queue[head];
    head += 1;
    const preds = reverseAdj[cur] ?? [];
    for (let i = 0; i < preds.length; i += 1) {
      const prev = preds[i];
      if (!canReachEnding.has(prev)) {
        canReachEnding.add(prev);
        queue.push(prev);
      }
    }
  }
  return canReachEnding;
}

/**
 * 컴파일된 정적 매니페스트를 순수 로컬 시뮬레이션으로 실행해 특정 선택 시퀀스의 결과를 검증한다.
 */
export function simulateBranchingPlaythrough(
  manifest: StaticBranchingManifest,
  choiceSequence: readonly string[],
  maxSteps = 128,
): BranchingPlaythroughResult {
  const nodeMap: Record<string, CompiledBranchNode> = {};
  for (let i = 0; i < manifest.nodes.length; i += 1) {
    nodeMap[manifest.nodes[i].id] = manifest.nodes[i];
  }
  const startNode = nodeMap[manifest.startNodeId];
  if (!startNode) {
    return {
      ok: false,
      finalNodeId: manifest.startNodeId,
      reachedEnding: false,
      finalFlags: { ...manifest.initialFlags },
      steps: [],
      error: `시작 노드 '${manifest.startNodeId}'가 존재하지 않습니다.`,
    };
  }

  let currentNode = startNode;
  let flags = applyBranchMutations(manifest.initialFlags, currentNode.onEnterEffects);
  let choiceCursor = 0;
  const steps: BranchingPlaythroughStep[] = [];

  for (let step = 0; step < maxSteps; step += 1) {
    if (currentNode.kind === "ending") {
      steps.push({ nodeId: currentNode.id, nodeKind: currentNode.kind, selectedChoiceId: null, flagsAfterStep: { ...flags } });
      return { ok: true, finalNodeId: currentNode.id, reachedEnding: true, endingCode: currentNode.endingCode, finalFlags: { ...flags }, steps };
    }
    if (currentNode.choices.length > 0) {
      if (choiceCursor >= choiceSequence.length) {
        steps.push({ nodeId: currentNode.id, nodeKind: currentNode.kind, selectedChoiceId: null, flagsAfterStep: { ...flags } });
        return { ok: true, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps };
      }
      const wantedId = choiceSequence[choiceCursor];
      choiceCursor += 1;
      const choice = currentNode.choices.find((c) => c.choiceId === wantedId);
      if (!choice) {
        return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `노드 '${currentNode.id}'에서 선택지 '${wantedId}'를 찾을 수 없습니다.` };
      }
      const target = nodeMap[choice.targetNodeId];
      if (!target) {
        return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `대상 노드 '${choice.targetNodeId}'가 존재하지 않습니다.` };
      }
      const choiceOk = !choice.conditionAst || evaluateBranchCondition(choice.conditionAst, flags);
      const targetOk = !target.unlockConditionAst || evaluateBranchCondition(target.unlockConditionAst, flags);
      if (!choiceOk || !targetOk) {
        return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `선택지 '${choice.choiceId}' 또는 대상 '${target.id}'의 해금 조건이 충족되지 않았습니다.` };
      }
      steps.push({ nodeId: currentNode.id, nodeKind: currentNode.kind, selectedChoiceId: choice.choiceId, flagsAfterStep: { ...flags } });
      flags = applyBranchMutations(applyBranchMutations(flags, choice.effects), target.onEnterEffects);
      currentNode = target;
      continue;
    }
    if (currentNode.nextNodeId && nodeMap[currentNode.nextNodeId]) {
      const target = nodeMap[currentNode.nextNodeId];
      if (target.unlockConditionAst && !evaluateBranchCondition(target.unlockConditionAst, flags)) {
        return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `다음 노드 '${target.id}'의 해금 조건이 충족되지 않았습니다.` };
      }
      steps.push({ nodeId: currentNode.id, nodeKind: currentNode.kind, selectedChoiceId: null, flagsAfterStep: { ...flags } });
      flags = applyBranchMutations(flags, target.onEnterEffects);
      currentNode = target;
      continue;
    }
    return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `노드 '${currentNode.id}'가 막다른 길입니다.` };
  }
  return { ok: false, finalNodeId: currentNode.id, reachedEnding: false, finalFlags: { ...flags }, steps, error: `최대 스텝(${maxSteps})을 초과했습니다.` };
}
