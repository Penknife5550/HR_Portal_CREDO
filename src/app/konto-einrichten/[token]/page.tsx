import { SetupContent } from "./setup-content";

export const metadata = {
  title: "Konto einrichten · CREDO HR-Portal",
};

export default async function KontoEinrichtenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <SetupContent token={token} />;
}
