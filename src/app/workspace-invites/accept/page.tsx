import { InviteAcceptance } from "@/components/InviteAcceptance";

export const dynamic = "force-dynamic";

export default async function WorkspaceInviteCompatibilityPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return <InviteAcceptance token={token} />;
}
