import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/server";
import { encryptBackupJsonStream, hashExportSecret, secretsEqual, assertStrongSecret } from "@/lib/ops/crypto";
import { validateBackupDocument } from "@/lib/ops/format";

export const runtime = "nodejs";

const DEFAULT_ROW_LIMIT = 5000;
const MAX_ROW_LIMIT = 10000;

function bearerToken(request: Request) {
  const value = request.headers.get("authorization") ?? "";
  const match = /^Bearer\s+([^\s]+)$/i.exec(value);
  return match?.[1] ?? null;
}

function requestedLimit(request: Request) {
  const raw = new URL(request.url).searchParams.get("limit");
  if (!raw) return DEFAULT_ROW_LIMIT;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= MAX_ROW_LIMIT ? parsed : null;
}

export async function GET(request: Request) {
  const configuredSecret = process.env.BACKUP_EXPORT_SECRET;
  const encryptionKey = process.env.BACKUP_ENCRYPTION_KEY;
  const token = bearerToken(request);
  const limit = requestedLimit(request);
  if (!configuredSecret || !encryptionKey || !token || limit === null) {
    return NextResponse.json({ error: "Backup export unavailable." }, { status: 503 });
  }
  try {
    assertStrongSecret(configuredSecret, "BACKUP_EXPORT_SECRET");
    assertStrongSecret(encryptionKey, "BACKUP_ENCRYPTION_KEY");
    if (!secretsEqual(token, configuredSecret)) return NextResponse.json({ error: "Backup export unavailable." }, { status: 401 });
    const supabase = getSupabaseAdminClient();
    if (!supabase) return NextResponse.json({ error: "Backup export unavailable." }, { status: 503 });
    const { data, error } = await supabase.rpc("nexora_ops_export", {
      p_secret_hash: hashExportSecret(configuredSecret),
      p_limit: limit,
    });
    if (error) {
      if (/rate limit exceeded/i.test(error.message ?? "")) {
        return NextResponse.json(
          { error: "Backup export is temporarily rate limited. Try again later." },
          { status: 429, headers: { "cache-control": "no-store", "retry-after": "3600" } },
        );
      }
      return NextResponse.json({ error: "Backup export unavailable." }, { status: 503 });
    }
    if (!data) return NextResponse.json({ error: "Backup export unavailable." }, { status: 503 });
    validateBackupDocument(data);
    const body = encryptBackupJsonStream(JSON.stringify(data), encryptionKey);
    const date = new Date().toISOString().replaceAll(/[:.]/g, "-");
    return new NextResponse(body, {
      status: 200,
      headers: {
        "content-type": "application/octet-stream",
        "content-disposition": `attachment; filename="nexora-backup-${date}.nexora-backup"`,
        "cache-control": "no-store, no-cache, must-revalidate",
        pragma: "no-cache",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Backup export unavailable." }, { status: 503 });
  }
}
