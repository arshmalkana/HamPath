/**
 * Tiny, safe expression language for lab goals, e.g.
 *   "closed && approx(I, 0.2)"     "swr <= 1.2"     "E > 5 && abs(I - 0.1) < 0.001"
 * Supports numbers, booleans, identifiers, + - * / %, comparisons, && || !, parentheses
 * and a fixed set of functions. No property access, no assignment, no eval().
 */

type Token =
  | { t: "num"; v: number }
  | { t: "id"; v: string }
  | { t: "op"; v: string }
  | { t: "eof" };

const OPS = ["&&", "||", "<=", ">=", "==", "!=", "<", ">", "+", "-", "*", "/", "%", "!", "(", ")", ","];

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) { i++; continue; }
    const num = /^(\d+\.?\d*|\.\d+)(e[-+]?\d+)?/i.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0] }); i += id[0].length; continue; }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (op) { out.push({ t: "op", v: op }); i += op.length; continue; }
    throw new Error(`Unexpected character '${c}' at ${i} in goal "${src}"`);
  }
  out.push({ t: "eof" });
  return out;
}

export type Value = number | boolean;
export type Vars = Record<string, Value>;

type Node =
  | { k: "num"; v: number }
  | { k: "var"; name: string }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "call"; fn: string; args: Node[] };

const FUNCS: Record<string, (...a: number[]) => Value> = {
  abs: Math.abs,
  min: Math.min,
  max: Math.max,
  round: Math.round,
  /** approx(a, b, tol = 0.01): relative tolerance, default 1% */
  approx: (a, b, tol = 0.01) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1e-12),
  between: (x, lo, hi) => x >= lo && x <= hi,
};

const PRECEDENCE: [string[], number][] = [
  [["||"], 1],
  [["&&"], 2],
  [["==", "!="], 3],
  [["<", "<=", ">", ">="], 4],
  [["+", "-"], 5],
  [["*", "/", "%"], 6],
];
const precOf = (op: string) => PRECEDENCE.find(([ops]) => ops.includes(op))?.[1] ?? 0;

export function parseGoal(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p]!;
  const expectOp = (v: string) => {
    const t = toks[p++]!;
    if (t.t !== "op" || t.v !== v) throw new Error(`Expected '${v}' in goal "${src}"`);
  };

  function primary(): Node {
    const t = toks[p++]!;
    if (t.t === "num") return { k: "num", v: t.v };
    if (t.t === "id") {
      if (t.v === "true") return { k: "num", v: 1 };
      if (t.v === "false") return { k: "num", v: 0 };
      const n = peek();
      if (n.t === "op" && n.v === "(") {
        p++;
        if (!(t.v in FUNCS)) throw new Error(`Unknown function '${t.v}' in goal "${src}"`);
        const args: Node[] = [];
        const close = peek();
        if (!(close.t === "op" && close.v === ")")) {
          for (;;) {
            args.push(expr(0));
            const sep = peek();
            if (sep.t === "op" && sep.v === ",") { p++; continue; }
            break;
          }
        }
        expectOp(")");
        return { k: "call", fn: t.v, args };
      }
      return { k: "var", name: t.v };
    }
    if (t.t === "op" && t.v === "(") {
      const e = expr(0);
      expectOp(")");
      return e;
    }
    if (t.t === "op" && (t.v === "-" || t.v === "!")) return { k: "un", op: t.v, a: primary() };
    throw new Error(`Unexpected token in goal "${src}"`);
  }

  function expr(minPrec: number): Node {
    let left = primary();
    for (;;) {
      const t = peek();
      if (t.t !== "op") break;
      const prec = precOf(t.v);
      if (prec === 0 || prec <= minPrec) break;
      p++;
      const right = expr(prec);
      left = { k: "bin", op: t.v, a: left, b: right };
    }
    return left;
  }

  const root = expr(0);
  if (peek().t !== "eof") throw new Error(`Trailing input in goal "${src}"`);
  return root;
}

const num = (v: Value) => (typeof v === "boolean" ? (v ? 1 : 0) : v);

function evalNode(n: Node, vars: Vars): Value {
  switch (n.k) {
    case "num": return n.v;
    case "var": {
      if (!(n.name in vars)) throw new Error(`Unknown variable '${n.name}'`);
      return vars[n.name]!;
    }
    case "un": {
      const a = evalNode(n.a, vars);
      return n.op === "!" ? !a : -num(a);
    }
    case "call": return FUNCS[n.fn]!(...n.args.map((a) => num(evalNode(a, vars))));
    case "bin": {
      if (n.op === "&&") return Boolean(evalNode(n.a, vars)) && Boolean(evalNode(n.b, vars));
      if (n.op === "||") return Boolean(evalNode(n.a, vars)) || Boolean(evalNode(n.b, vars));
      const a = num(evalNode(n.a, vars));
      const b = num(evalNode(n.b, vars));
      switch (n.op) {
        case "+": return a + b;
        case "-": return a - b;
        case "*": return a * b;
        case "/": return a / b;
        case "%": return a % b;
        case "<": return a < b;
        case "<=": return a <= b;
        case ">": return a > b;
        case ">=": return a >= b;
        case "==": return a === b;
        case "!=": return a !== b;
      }
    }
  }
  throw new Error("Bad goal expression node");
}

/** Evaluate a goal expression against lab variables. Throws on syntax errors or unknown names. */
export function evaluateGoal(src: string, vars: Vars): boolean {
  return Boolean(evalNode(parseGoal(src), vars));
}

/** Names referenced by a goal (used to validate lab configs). */
export function goalVariables(src: string): string[] {
  const names = new Set<string>();
  const walk = (n: Node): void => {
    if (n.k === "var") names.add(n.name);
    else if (n.k === "un") walk(n.a);
    else if (n.k === "bin") { walk(n.a); walk(n.b); }
    else if (n.k === "call") n.args.forEach(walk);
  };
  walk(parseGoal(src));
  return [...names];
}
