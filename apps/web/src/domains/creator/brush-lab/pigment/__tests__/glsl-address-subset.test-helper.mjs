/**
 * 시험 전용의 제한된 GLSL 주소 해석기. 범용 parser/compiler가 아니다.
 * 실제 생성 함수의 산술·대입·if·return만 읽고 texture load 직전 주소를 관측한다.
 * 알 수 없는 토큰/문장은 실패시킨다. eval/new Function/수식별 문자열 대체를 사용하지 않는다.
 */
function tokenize(source) {
  const clean = source.replace(/\/\/[^\n]*/gu, "");
  const re = /\s*([A-Za-z_]\w*|(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?|>=|<=|==|\+=|-=|[().,;{}=+*/<>-])/gy;
  const tokens = []; let offset = 0;
  while (offset < clean.length) {
    if (!clean.slice(offset).trim()) break;
    re.lastIndex = offset;
    const match = re.exec(clean);
    if (!match) throw new Error(`지원하지 않는 GLSL 토큰: ${clean.slice(offset, offset + 32)}`);
    tokens.push(match[1]); offset = re.lastIndex;
  }
  return tokens;
}
class Parser {
  constructor(source) { this.tokens = tokenize(source); this.index = 0; }
  peek() { return this.tokens[this.index]; }
  take(expected) {
    const actual = this.tokens[this.index++];
    if (expected !== undefined && actual !== expected) throw new Error(`GLSL 예상 ${expected}, 실제 ${actual}`);
    return actual;
  }
  identifier() {
    const value = this.take();
    if (!/^[A-Za-z_]\w*$/u.test(value ?? "")) throw new Error("GLSL identifier 필요");
    return value;
  }
  statements(stop) {
    const result = [];
    while (this.peek() !== stop && this.peek() !== undefined) result.push(this.statement());
    if (stop) this.take(stop);
    return result;
  }
  statement() {
    if (this.peek() === "if") {
      this.take(); this.take("("); const condition = this.expression(); this.take(")"); this.take("{");
      return { type: "if", condition, body: this.statements("}") };
    }
    if (this.peek() === "return") {
      this.take(); const value = this.expression(); this.take(";"); return { type: "return", value };
    }
    let declared = false;
    if (this.peek() === "highp") {
      this.take(); const kind = this.take();
      if (!["float", "vec2", "vec4"].includes(kind)) throw new Error(`지원하지 않는 선언 ${kind}`);
      declared = true;
    }
    const name = this.identifier(), operator = this.take();
    if (!["=", "+=", "-="].includes(operator) || (declared && operator !== "=")) throw new Error("지원하지 않는 대입");
    const value = this.expression(); this.take(";");
    return { type: "assign", name, operator, value };
  }
  expression(minimum = 0) {
    let left;
    const first = this.take();
    if (first === "(") { left = this.expression(); this.take(")"); }
    else if (first === "-") left = { type: "negate", value: this.expression(4) };
    else if (/^(?:\d|\.)/u.test(first ?? "")) left = { type: "literal", value: Number(first) };
    else {
      if (!/^[A-Za-z_]\w*$/u.test(first ?? "")) throw new Error("지원하지 않는 식");
      left = { type: "variable", name: first };
      if (this.peek() === "(") {
        this.take(); const args = [];
        if (this.peek() !== ")") for (;;) {
          args.push(this.expression()); if (this.peek() !== ",") break; this.take();
        }
        this.take(")"); left = { type: "call", name: first, args };
      }
    }
    while (this.peek() === ".") { this.take(); left = { type: "field", value: left, field: this.identifier() }; }
    const precedence = { "<": 1, ">": 1, ">=": 1, "<=": 1, "==": 1, "+": 2, "-": 2, "*": 3, "/": 3 };
    while ((precedence[this.peek()] ?? -1) >= minimum) {
      const operator = this.take(), right = this.expression(precedence[operator] + 1);
      left = { type: "binary", operator, left, right };
    }
    return left;
  }
}
function extract(source, name) {
  const re = new RegExp(`highp (?:float|vec2|vec4) ${name}\\(([^)]*)\\)\\s*\\{`, "gu");
  const functions = []; let match;
  while ((match = re.exec(source))) {
    const begin = re.lastIndex; let end = begin, depth = 1;
    while (end < source.length && depth) { if (source[end] === "{") depth++; if (source[end] === "}") depth--; end++; }
    if (depth) throw new Error("생성 함수 괄호가 닫히지 않음");
    let body = source.slice(begin, end - 1);
    const params = match[1].split(",").filter((value) => value.trim()).map((value) => value.trim().split(/\s+/u).at(-1));
    const texture = body.indexOf("highp vec4 bytes =");
    if (name === "latent_pigment_packed_float" && texture >= 0) {
      // 실제 texture 로드 대신 직전 column/row를 관측. 그 앞 산술은 원문 그대로 해석한다.
      body = `${body.slice(0, texture)}return vec2(column, row);`;
    }
    const parser = new Parser(body), ast = parser.statements();
    if (parser.peek() !== undefined) throw new Error("생성 함수에 해석하지 못한 토큰이 남음");
    functions.push({ name, params, ast, observedTextureAddress: texture >= 0 });
    re.lastIndex = end;
  }
  return functions;
}
const scalar = (value) => {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("scalar 산술 필요");
  return value;
};
export function createGeneratedAddressEvaluator(source, q) {
  const functions = new Map();
  for (const name of ["latent_pigment_packed_carry", "latent_pigment_packed_float", "latent_pigment_table_texel"]) {
    for (const fn of extract(source, name)) functions.set(`${name}/${fn.params.length}`, fn);
  }
  if (!functions.has("latent_pigment_table_texel/1") || ![...functions.values()].some((fn) => fn.observedTextureAddress)) throw new Error("실제 주소 함수가 없음");
  function invoke(name, args, depth = 0) {
    if (depth > 32) throw new Error("주소 함수 재귀 상한");
    if (name === "vec2" || name === "vec4") return args;
    if (name === "float") return q.add(scalar(args[0]), 0);
    if (name === "floor") return Math.floor(scalar(args[0]));
    if (name === "mod") {
      const a = scalar(args[0]), b = scalar(args[1]);
      return q.sub(a, q.mul(b, Math.floor(q.div(a, b))));
    }
    const fn = functions.get(`${name}/${args.length}`);
    if (!fn) throw new Error(`지원하지 않는 호출 ${name}/${args.length}`);
    const env = new Map(fn.params.map((param, i) => [param, args[i]]));
    function expression(node) {
      if (node.type === "literal") return q.value(node.value);
      if (node.type === "variable") { if (!env.has(node.name)) throw new Error(`미정의 변수 ${node.name}`); return env.get(node.name); }
      if (node.type === "call") return invoke(node.name, node.args.map(expression), depth + 1);
      if (node.type === "field") {
        const value = expression(node.value), index = { x: 0, y: 1, z: 2, w: 3 }[node.field];
        if (!Array.isArray(value) || index === undefined || value[index] === undefined) throw new Error("지원하지 않는 vector field");
        return value[index];
      }
      if (node.type === "negate") return q.sub(0, scalar(expression(node.value)));
      if (node.type !== "binary") throw new Error("지원하지 않는 AST");
      const a = scalar(expression(node.left)), b = scalar(expression(node.right));
      switch (node.operator) {
        case "+": return q.add(a, b); case "-": return q.sub(a, b); case "*": return q.mul(a, b); case "/": return q.div(a, b);
        case "<": return a < b; case ">": return a > b; case ">=": return a >= b; case "<=": return a <= b; case "==": return a === b;
        default: throw new Error("지원하지 않는 연산자");
      }
    }
    function statements(nodes) {
      for (const node of nodes) {
        if (node.type === "return") return { value: expression(node.value) };
        if (node.type === "if") { if (expression(node.condition)) { const returned = statements(node.body); if (returned) return returned; } continue; }
        const value = expression(node.value);
        env.set(node.name, node.operator === "=" ? value : node.operator === "+="
          ? q.add(scalar(env.get(node.name)), scalar(value)) : q.sub(scalar(env.get(node.name)), scalar(value)));
      }
      return null;
    }
    const returned = statements(fn.ast);
    if (!returned) throw new Error("주소 함수가 값을 반환하지 않음");
    return returned.value;
  }
  return {
    evaluate(point) {
      const value = invoke("latent_pigment_table_texel", [point]);
      if (!Array.isArray(value) || value.length !== 4 || value.some((address) => !Array.isArray(address) || address.length !== 2)) throw new Error("4성분 주소 관측 실패");
      return value;
    },
    functions: [...functions.keys()],
  };
}
