import { NextResponse } from "next/server";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
let cached: { expiresAt: number; body: Record<string, unknown>; status: number } | null = null;

export async function GET() {
  const started = Date.now();
  if (cached && cached.expiresAt > Date.now()) return NextResponse.json(cached.body, { status: cached.status, headers: { "cache-control": "public, max-age=15" } });
  if (!hasSupabaseConfig()) {
    const body = { status: "degraded", database: "unconfigured", checkedAt: new Date().toISOString() };
    cached = { expiresAt: Date.now() + 15_000, body, status: 503 };
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "public, max-age=15" } });
  }
  try {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc("nexora_health_probe");
    if (error || data?.schema !== true) throw error ?? new Error("schema unavailable");
    const body = { status: "ok", database: "ok", latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
    cached = { expiresAt: Date.now() + 15_000, body, status: 200 };
    return NextResponse.json(body, { headers: { "cache-control": "public, max-age=15" } });
  } catch (error) {
    const body = { status: "degraded", database: "unavailable", latencyMs: Date.now() - started, checkedAt: new Date().toISOString() };
    cached = { expiresAt: Date.now() + 15_000, body, status: 503 };
    return NextResponse.json(body, { status: 503, headers: { "cache-control": "public, max-age=15" } });
  }
}
