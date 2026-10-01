const localOrigins = new Set([
  "http://localhost:3002",
  "http://127.0.0.1:3002",
]);

export function sameOriginError(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin)
    return "This local API requires a browser Origin header for mutating requests.";
  const configured = process.env.APP_ORIGIN?.replace(/\/$/, "");
  const allowed = configured ? new Set([configured]) : localOrigins;
  return allowed.has(origin.replace(/\/$/, ""))
    ? null
    : "This local API only accepts browser requests from the configured Nexora origin.";
}
