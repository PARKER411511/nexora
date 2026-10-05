const localOrigins = new Set([
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]);

export function sameOriginError(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin)
    return "This API requires a browser Origin header for mutating requests.";
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, "");
  const requestOrigin = (() => { try { return new URL(request.url).origin; } catch { return ""; } })();
  const allowed = configured ? new Set([configured]) : new Set([...localOrigins, requestOrigin]);
  let normalized = ""; try { normalized = new URL(origin).origin; } catch { /* invalid origin */ }
  return allowed.has(normalized)
    ? null
    : "This local API only accepts browser requests from the configured Nexora origin.";
}
