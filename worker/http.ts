export const json = (value: unknown, init: ResponseInit = {}): Response => {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("cache-control", "no-store");
  return new Response(JSON.stringify(value), { ...init, headers });
};

export const errorResponse = (
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response => json({ error: { code, message, details } }, { status });

export async function readJson<T>(request: Request, maximumBytes = 64_000): Promise<T> {
  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > maximumBytes) throw new Error("REQUEST_TOO_LARGE");
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) throw new Error("REQUEST_TOO_LARGE");
  return JSON.parse(text) as T;
}
