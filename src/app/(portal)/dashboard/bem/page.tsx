import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { BemContent } from "./bem-content";

export default async function BemPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  return <BemContent user={session} />;
}
