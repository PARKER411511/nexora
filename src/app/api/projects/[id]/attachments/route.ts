import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { createSupabaseServerClient, requireServerUser } from "@/lib/supabase/server";
import {
  cloudFinalizeAttachmentDelete,
  cloudGetAttachment,
  cloudListAttachments,
  cloudRegisterAttachment,
  cloudRequestAttachmentDelete,
} from "@/lib/supabase/repository";

export const runtime = "nodejs";

const allowed = new Set([
  "image/jpeg", "image/png", "image/webp", "application/pdf",
  "text/plain", "text/markdown", "application/zip",
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireServerUser();
    const projectId = (await params).id;
    const attachmentId = new URL(request.url).searchParams.get("attachmentId");
    const supabase = await createSupabaseServerClient();
    if (!attachmentId) return NextResponse.json({ attachments: await cloudListAttachments(projectId) });
    const attachment = await cloudGetAttachment(projectId, attachmentId);
    if (!attachment || attachment.pendingDelete) return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
    const signed = await supabase.storage.from("nexora-private").createSignedUrl(attachment.objectKey, 60, { download: attachment.originalName });
    if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("Could not create a download link.");
    return NextResponse.json({ attachment, downloadUrl: signed.data.signedUrl });
  } catch (error) {
    return cloudErrorResponse(error, "Could not load attachment");
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to attach." }, { status: 400 });
    if (!allowed.has(file.type) || file.size < 1 || file.size > 3 * 1024 * 1024)
      return NextResponse.json({ error: "This file type or size is not supported. Files must be 3 MB or smaller." }, { status: 400 });
    const projectId = (await params).id;
    const snapshotToken = typeof form.get("snapshotToken") === "string" ? String(form.get("snapshotToken")) : null;
    const attachment = await cloudRegisterAttachment({ projectId, originalName: file.name, mimeType: file.type, byteSize: file.size, snapshotToken });
    const supabase = await createSupabaseServerClient();
    const bytes = Buffer.from(await file.arrayBuffer());
    const upload = await supabase.storage.from("nexora-private").upload(attachment.objectKey, bytes, {
      contentType: file.type,
      upsert: false,
      metadata: { mimetype: file.type, contentLength: String(file.size) },
    });
    if (upload.error) throw upload.error;
    const info = await supabase.storage.from("nexora-private").info(attachment.objectKey);
    const reportedSize = Number((info.data as { size?: unknown } | null)?.size ?? file.size);
    if (reportedSize !== file.size) {
      const pending = await cloudRequestAttachmentDelete(attachment.id);
      await supabase.storage.from("nexora-private").remove([pending.objectKey]);
      await cloudFinalizeAttachmentDelete(attachment.id);
      throw new Error("Uploaded attachment size did not match its registration.");
    }
    return NextResponse.json({ attachment }, { status: 201 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not upload attachment");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { attachmentId?: unknown };
    if (typeof body.attachmentId !== "string" || !body.attachmentId) return NextResponse.json({ error: "Attachment id is required." }, { status: 400 });
    const pending = await cloudRequestAttachmentDelete(body.attachmentId);
    const supabase = await createSupabaseServerClient();
    const removed = await supabase.storage.from("nexora-private").remove([pending.objectKey]);
    if (removed.error) return NextResponse.json({ error: "The file could not be removed yet. Retry this action." }, { status: 409 });
    await cloudFinalizeAttachmentDelete(body.attachmentId);
    return NextResponse.json({ deleted: true, projectId: (await params).id });
  } catch (error) {
    return cloudErrorResponse(error, "Could not remove attachment");
  }
}
