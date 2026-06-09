import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ADMIN_ROLES } from "@/lib/permissions";
import { BemVorlagenContent } from "./bem-vorlagen-content";

export default async function BemVorlagenPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!ADMIN_ROLES.includes(session.role)) redirect("/dashboard");
  return <BemVorlagenContent user={session} />;
}
