import { ProfileForm } from "@/components/ProfileForm";
import { CloudUnavailable } from "@/components/CloudUnavailable";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { cloudGetProfile, isCloudSetupError } from "@/lib/supabase/repository";
import { requireServerUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  if (!hasSupabaseConfig()) return <CloudUnavailable />;
  try {
    const user = await requireServerUser();
    return <ProfileForm email={user.email ?? ""} profile={await cloudGetProfile()} />;
  } catch (error) {
    if (isCloudSetupError(error)) return <CloudUnavailable />;
    throw error;
  }
}
