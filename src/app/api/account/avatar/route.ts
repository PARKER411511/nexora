import { NextResponse } from "next/server";
import { sameOriginError } from "@/lib/origin";
import { cloudErrorResponse } from "@/lib/supabase/api";
import { createSupabaseServerClient, requireServerUser } from "@/lib/supabase/server";
import { cloudActivateProfileAvatar, cloudClearPendingProfileAvatar, cloudClearProfileAvatar, cloudFinalizeProfileAvatarDelete, cloudGetProfile, cloudRegisterProfileAvatar } from "@/lib/supabase/repository";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireServerUser();
    const profile = await cloudGetProfile();
    if (!profile.avatarObjectKey) return NextResponse.json({ signedUrl: null });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.storage.from("nexora-profile-avatars").createSignedUrl(profile.avatarObjectKey, 600);
    if (error) throw error;
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (error) { return cloudErrorResponse(error, "Could not load profile photo"); }
}
const allowed = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !allowed.has(file.type) || file.size < 1 || file.size > 2 * 1024 * 1024)
      return NextResponse.json({ error: "Choose a JPG, PNG, or WebP profile photo up to 2 MB." }, { status: 400 });
    const registration = await cloudRegisterProfileAvatar(file.type, file.size);
    const supabase = await createSupabaseServerClient();
    const upload = await supabase.storage.from(registration.bucket).upload(registration.objectKey, Buffer.from(await file.arrayBuffer()), {
      contentType: file.type,
      upsert: false,
      metadata: { mimetype: file.type, contentLength: String(file.size) },
    });
    if (upload.error) throw upload.error;
    const info = await supabase.storage.from(registration.bucket).info(registration.objectKey);
    const size = Number((info.data as { size?: unknown } | null)?.size ?? file.size);
    if (size !== file.size) {
      await supabase.storage.from(registration.bucket).remove([registration.objectKey]);
      await cloudClearPendingProfileAvatar(registration.objectKey);
      throw new Error("Uploaded profile photo size did not match its registration.");
    }
    const activated = await cloudActivateProfileAvatar(registration.objectKey);
    if (activated.previousObjectKey) {
      const removed = await supabase.storage.from(registration.bucket).remove([activated.previousObjectKey]);
      if (!removed.error) await cloudFinalizeProfileAvatarDelete(activated.previousObjectKey);
    }
    return NextResponse.json({ avatar: { ...registration, objectKey: activated.objectKey } }, { status: 201 });
  } catch (error) {
    return cloudErrorResponse(error, "Could not upload profile photo");
  }
}

export async function DELETE(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return NextResponse.json({ error: originError }, { status: 403 });
  try {
    await requireServerUser();
    const body = (await request.json()) as { objectKey?: unknown };
    if (typeof body.objectKey !== "string" || !body.objectKey) return NextResponse.json({ error: "Profile photo key is required." }, { status: 400 });
    const supabase = await createSupabaseServerClient();
    const removed = await supabase.storage.from("nexora-profile-avatars").remove([body.objectKey]);
    if (removed.error) return NextResponse.json({ error: "The profile photo could not be removed yet. Retry this action." }, { status: 409 });
    const cleared = await cloudClearProfileAvatar(body.objectKey);
    if (!cleared) await cloudFinalizeProfileAvatarDelete(body.objectKey);
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return cloudErrorResponse(error, "Could not remove profile photo");
  }
}
