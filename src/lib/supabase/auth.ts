export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//"))
    return "/workspace";
  if (/[\\\u0000-\u001f\u007f]/.test(value)) return "/workspace";
  try {
    const normalized = new URL(value, "https://nexora.invalid");
    if (normalized.origin !== "https://nexora.invalid") return "/workspace";
    return `${normalized.pathname}${normalized.search}${normalized.hash}`;
  } catch {
    return "/workspace";
  }
}
