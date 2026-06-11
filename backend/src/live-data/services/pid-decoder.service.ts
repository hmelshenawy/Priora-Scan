import { Injectable, Logger } from '@nestjs/common';
import { PidDefinitionRepository } from '../repositories/pid-definition.repository';

/**
 * PidDecoderService — Feature 006 Phase B.1.
 *
 * Restricted-grammar formula evaluator. The parser implements a small
 * recursive-descent grammar and **never** uses `eval`, `new Function`,
 * `vm`, or any other dynamic-eval primitive (Correction 5).
 *
 * Grammar (the only valid tokens):
 *
 *   expr   := term (('+' | '-') term)*
 *   term   := factor (('*' | '/') factor)*
 *   factor := 'A' | 'B' | integer | '(' expr ')'
 *
 * Integer literals are decimal. Division uses JavaScript's default
 * floating-point semantics, which is what OBD-II PIDs such as Control
 * Module Voltage (`(A*256+B)/1000`) and MAF (`(A*256+B)/100`) need to
 * display the correct engineering value. Whitespace is ignored.
 *
 * Error codes:
 *   - `PID_FORMULA_INVALID` — the stored formula did not match the
 *     grammar (e.g., it was edited outside the parser, or it contains
 *     `Math.PI`, `process.exit()`, function-call syntax, property
 *     access, or any identifier other than `A` / `B`).
 *   - `B_UNDEFINED` — the formula references `B` but the response had
 *     fewer than 2 bytes.
 *   - `PID_NOT_DEFINED` — no PIDDefinition row for the
 *     (namespace, mode, pid).
 *   - `NO_DATA` — the raw hex payload was empty or whitespace only.
 */

export type DecodedStatus = 'OK' | 'NO_DATA' | 'NOT_SUPPORTED' | 'ERROR';

export interface DecodedReading {
  pid: string;
  name: string | null;
  value: number | null;
  unit: string | null;
  rawValue: string;
  status: DecodedStatus;
  errorCode: string | null;
}

@Injectable()
export class PidDecoderService {
  private readonly logger = new Logger(PidDecoderService.name);

  constructor(private readonly repo: PidDefinitionRepository) {}

  /**
   * Decode a raw OBD-II response for a given (namespace, mode, pid). The
   * response is expected to be the data bytes only — any leading `41`
   * (Mode 01 response header) is stripped automatically.
   */
  async decode(
    namespace: string,
    mode: string,
    pid: string,
    rawHex: string,
  ): Promise<DecodedReading> {
    const def = await this.repo.findByNamespaceModeAndPid(namespace, mode, pid);
    if (!def) {
      return {
        pid,
        name: null,
        value: null,
        unit: null,
        rawValue: rawHex,
        status: 'NOT_SUPPORTED',
        errorCode: 'PID_NOT_DEFINED',
      };
    }

    const cleaned = (rawHex ?? '').trim();
    if (!cleaned) {
      return {
        pid,
        name: def.name,
        value: null,
        unit: def.unit,
        rawValue: rawHex,
        status: 'NO_DATA',
        errorCode: null,
      };
    }

    const bytes = parseHexBytes(cleaned);
    if (bytes === null) {
      return {
        pid,
        name: def.name,
        value: null,
        unit: def.unit,
        rawValue: rawHex,
        status: 'ERROR',
        errorCode: 'INVALID_HEX',
      };
    }

    // Strip a leading `41` (Mode 01 response header) if present.
    let dataBytes = bytes;
    if (mode === '01' && dataBytes.length > 0 && dataBytes[0] === 0x41) {
      dataBytes = dataBytes.slice(1);
    }

    const usesB = /\bB\b/.test(def.formula) || /[^A-Za-z0-9_]B[^A-Za-z0-9_]?/.test(def.formula);
    if (usesB && dataBytes.length < 2) {
      return {
        pid,
        name: def.name,
        value: null,
        unit: def.unit,
        rawValue: rawHex,
        status: 'ERROR',
        errorCode: 'B_UNDEFINED',
      };
    }

    const a = dataBytes[0] ?? 0;
    const b = dataBytes[1] ?? 0;

    let value: number;
    try {
      value = evaluateFormula(def.formula, a, b);
    } catch (err) {
      const code = (err as { code?: string }).code ?? 'PID_FORMULA_INVALID';
      return {
        pid,
        name: def.name,
        value: null,
        unit: def.unit,
        rawValue: rawHex,
        status: 'ERROR',
        errorCode: code,
      };
    }

    return {
      pid,
      name: def.name,
      value,
      unit: def.unit,
      rawValue: rawHex,
      status: 'OK',
      errorCode: null,
    };
  }

  /**
   * Re-validate a formula's grammar without evaluating it. Returns null
   * on success and an error code string on failure. Used by the asset
   * import path to skip rows with malformed equations.
   */
  validateFormula(formula: string): string | null {
    try {
      // We pass A=0 B=0; the values are irrelevant — only the parse is
      // exercised.
      evaluateFormula(formula, 0, 0);
      return null;
    } catch (err) {
      return (err as { code?: string }).code ?? 'PID_FORMULA_INVALID';
    }
  }
}

/**
 * Recursive-descent parser. Throws an Error with `code` on any
 * grammar violation. No eval / Function / scripting primitives.
 */
export function evaluateFormula(formula: string, aValue: number, bValue: number): number {
  const tokens = tokenize(formula);
  const ctx: ParseContext = { tokens, pos: 0, a: aValue, b: bValue };
  const result = parseExpr(ctx);
  // The token stream always ends with an EOF sentinel. Allow it to
  // remain, but reject any other trailing token (e.g., garbage after a
  // valid prefix).
  if (ctx.pos < ctx.tokens.length - 1) {
    throw formulaError('PID_FORMULA_INVALID', `Unexpected token at position ${ctx.pos}`);
  }
  return result;
}

interface Token {
  kind: 'A' | 'B' | 'INT' | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'LPAREN' | 'RPAREN' | 'EOF';
  value?: number;
  pos: number;
}

interface ParseContext {
  tokens: Token[];
  pos: number;
  a: number;
  b: number;
}

function tokenize(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') {
      i++;
      continue;
    }
    if (c === 'A' || c === 'B') {
      // Reject anything that would form a longer identifier (e.g., "A1").
      const next = input[i + 1];
      if (next !== undefined && /[A-Za-z0-9_]/.test(next)) {
        throw formulaError(
          'PID_FORMULA_INVALID',
          `Unexpected identifier near '${c}' at position ${i}`,
        );
      }
      out.push({ kind: c, pos: i });
      i++;
      continue;
    }
    if (c === '+') {
      out.push({ kind: 'PLUS', pos: i });
      i++;
      continue;
    }
    if (c === '-') {
      out.push({ kind: 'MINUS', pos: i });
      i++;
      continue;
    }
    if (c === '*') {
      out.push({ kind: 'STAR', pos: i });
      i++;
      continue;
    }
    if (c === '/') {
      out.push({ kind: 'SLASH', pos: i });
      i++;
      continue;
    }
    if (c === '(') {
      out.push({ kind: 'LPAREN', pos: i });
      i++;
      continue;
    }
    if (c === ')') {
      out.push({ kind: 'RPAREN', pos: i });
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const start = i;
      let n = 0;
      while (i < input.length && /[0-9]/.test(input[i])) {
        n = n * 10 + Number.parseInt(input[i], 10);
        i++;
      }
      out.push({ kind: 'INT', value: n, pos: start });
      continue;
    }
    throw formulaError('PID_FORMULA_INVALID', `Unexpected character '${c}' at position ${i}`);
  }
  out.push({ kind: 'EOF', pos: input.length });
  return out;
}

function parseExpr(ctx: ParseContext): number {
  let left = parseTerm(ctx);
  while (true) {
    const t = ctx.tokens[ctx.pos];
    if (t.kind === 'PLUS') {
      ctx.pos++;
      const right = parseTerm(ctx);
      left = left + right;
    } else if (t.kind === 'MINUS') {
      ctx.pos++;
      const right = parseTerm(ctx);
      left = left - right;
    } else {
      return left;
    }
  }
}

function parseTerm(ctx: ParseContext): number {
  let left = parseFactor(ctx);
  while (true) {
    const t = ctx.tokens[ctx.pos];
    if (t.kind === 'STAR') {
      ctx.pos++;
      const right = parseFactor(ctx);
      left = left * right;
    } else if (t.kind === 'SLASH') {
      ctx.pos++;
      const right = parseFactor(ctx);
      if (right === 0) {
        throw formulaError('DIVISION_BY_ZERO', 'Division by zero');
      }
      // Real (floating-point) division. OBD-II PIDs like
      // `(A*256+B)/1000` (Control Module Voltage) need fractional
      // results to display the correct engineering value.
      left = left / right;
    } else {
      return left;
    }
  }
}

function parseFactor(ctx: ParseContext): number {
  const t = ctx.tokens[ctx.pos];
  if (t.kind === 'A') {
    ctx.pos++;
    return ctx.a;
  }
  if (t.kind === 'B') {
    ctx.pos++;
    return ctx.b;
  }
  if (t.kind === 'INT') {
    ctx.pos++;
    return t.value as number;
  }
  if (t.kind === 'LPAREN') {
    ctx.pos++;
    const inner = parseExpr(ctx);
    const close = ctx.tokens[ctx.pos];
    if (close.kind !== 'RPAREN') {
      throw formulaError('PID_FORMULA_INVALID', `Expected ')' at position ${close.pos}`);
    }
    ctx.pos++;
    return inner;
  }
  throw formulaError('PID_FORMULA_INVALID', `Unexpected token at position ${t.pos}`);
}

function formulaError(code: string, message: string): Error {
  const err = new Error(message);
  (err as { code?: string }).code = code;
  return err;
}

/**
 * Parse a space-separated hex byte string into a Uint8Array. Returns
 * null if any token is not valid hex.
 */
export function parseHexBytes(hex: string): Uint8Array | null {
  const parts = hex.split(/\s+/).filter((p) => p.length > 0);
  const out = new Uint8Array(parts.length);
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (!/^[0-9A-Fa-f]{1,2}$/.test(p)) {
      return null;
    }
    out[i] = Number.parseInt(p, 16);
  }
  return out;
}
