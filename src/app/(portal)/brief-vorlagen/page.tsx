import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { HR_EDIT_ROLES } from "@/lib/permissions";
import { BriefVorlagenContent } from "./brief-vorlagen-content";

export default async function BriefVorlagenPage() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  if (!HR_EDIT_ROLES.includes(session.role)) {
    redirect("/dashboard");
  }

  return <BriefVorlagenContent user={session} />;
}
