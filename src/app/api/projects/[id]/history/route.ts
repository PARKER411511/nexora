import { NextResponse } from "next/server";
import { isDemoMode } from "@/lib/mode";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (isDemoMode())
    return NextResponse.json(
      { error: "The browser demo reads history from this browser." },
      { status: 409 },
    );
  try {
    const { id } = await params;
    const { getProjectHistory } = await import("@/lib/db");
    return NextResponse.json({ history: getProjectHistory(id) });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load project history",
      },
      { status: 404 },
    );
  }
}
