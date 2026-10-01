export type NexoraMode = "local" | "demo";

export function getNexoraMode(): NexoraMode {
  if (process.env.NEXORA_MODE === "demo") return "demo";
  if (process.env.NEXORA_MODE === "local") return "local";
  return process.env.VERCEL === "1" ? "demo" : "local";
}

export function isDemoMode() {
  return getNexoraMode() === "demo";
}

export function isDemoModeClient() {
  return process.env.NEXT_PUBLIC_NEXORA_MODE === "demo";
}
