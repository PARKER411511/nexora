import { NewProjectForm } from "@/components/NewProjectForm";
import { hasSupabaseConfig } from "@/lib/supabase/config";
import { CloudUnavailable } from "@/components/CloudUnavailable";

export default function NewProjectPage() {
  return hasSupabaseConfig() ? <NewProjectForm /> : <CloudUnavailable />;
}
