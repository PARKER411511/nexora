export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/workspace";
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/workspace";
  try {
    const normalized = new URL(value, "https://nexora.invalid");
    if (normalized.origin !== "https://nexora.invalid") return "/workspace";
    const rawPath = value.split(/[?#]/, 1)[0];
    const candidate = `${normalized.pathname}${normalized.search}${normalized.hash}`;
    const resolved = new URL(candidate, "https://nexora.invalid");
    if (
      normalized.pathname !== rawPath ||
      normalized.pathname.startsWith("//") ||
      resolved.origin !== "https://nexora.invalid" ||
      resolved.pathname.startsWith("//")
    )
      return "/workspace";
    return candidate;
  } catch {
    return "/workspace";
  }
}
