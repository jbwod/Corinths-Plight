export type JsonPrimitive = null | boolean | number | string;

export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;

export interface JsonObject {
  [key: string]: JsonValue;
}

export interface ContractIssue {
  code: string;
  path: string;
  message: string;
}

export class JsonContractError extends TypeError {
  readonly issues: readonly ContractIssue[];

  constructor(issue: ContractIssue | readonly ContractIssue[]) {
    const issues = Array.isArray(issue) ? issue : [issue];
    super(issues.map((item) => `${item.code} at ${item.path}: ${item.message}`).join("\n"));
    this.name = "JsonContractError";
    this.issues = issues;
  }
}

export function compareUnicodeCodePoints(left: string, right: string): number {
  const leftIterator = left[Symbol.iterator]();
  const rightIterator = right[Symbol.iterator]();
  while (true) {
    const leftNext = leftIterator.next();
    const rightNext = rightIterator.next();
    if (leftNext.done || rightNext.done) {
      if (leftNext.done && rightNext.done) return 0;
      return leftNext.done ? -1 : 1;
    }
    const difference = leftNext.value.codePointAt(0)! - rightNext.value.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
}

function issue(code: string, path: string, message: string): never {
  throw new JsonContractError({ code, path, message });
}

function canonicalize(value: unknown, path: string, ancestors: Set<object>): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) issue("JSON_NUMBER_INVALID", path, "JSON numbers must be finite.");
    return Object.is(value, -0) ? 0 : value;
  }
  if (typeof value !== "object") {
    issue("JSON_VALUE_INVALID", path, "Expected a JSON value; undefined, bigint, symbol, and function values are forbidden.");
  }
  if (ancestors.has(value)) issue("JSON_CYCLE", path, "Cyclic values cannot be represented as JSON.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item, index) => canonicalize(item, `${path}[${index}]`, ancestors));
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      issue("JSON_OBJECT_INVALID", path, "Only plain objects can be represented as JSON objects.");
    }
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => compareUnicodeCodePoints(left, right))
        .map(([key, item]) => [key, canonicalize(item, `${path}.${key}`, ancestors)]),
    );
  } finally {
    ancestors.delete(value);
  }
}

export function assertJsonValue(value: unknown, path = "$"): JsonValue {
  return canonicalize(value, path, new Set());
}

export function assertJsonObject(value: unknown, path = "$"): JsonObject {
  const parsed = assertJsonValue(value, path);
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    issue("JSON_OBJECT_REQUIRED", path, "Expected a JSON object.");
  }
  return parsed;
}

/**
 * Produces recursively key-sorted JSON using Unicode code-point ordering.
 * Array order remains significant and every non-JSON value fails closed.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(assertJsonValue(value));
}

export async function sha256Hex(value: string | Uint8Array): Promise<string> {
  const source = typeof value === "string" ? new TextEncoder().encode(value) : value;
  const bytes = new ArrayBuffer(source.byteLength);
  new Uint8Array(bytes).set(source);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256CanonicalJson(value: unknown): Promise<string> {
  return sha256Hex(canonicalJson(value));
}
