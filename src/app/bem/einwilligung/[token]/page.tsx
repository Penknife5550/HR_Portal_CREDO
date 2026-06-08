import { BemEinwilligungContent } from "./einwilligung-content";

// Oeffentliche Route (kein Login). Liegt bewusst AUSSERHALB der (portal)-Gruppe.
export default async function BemEinwilligungPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <BemEinwilligungContent token={token} />;
}
