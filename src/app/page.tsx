import Dashboard from "@/components/dashboard";
import { listGenerationRecords } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Home() {
  const initialGenerations = listGenerationRecords();

  return <Dashboard initialGenerations={initialGenerations} />;
}
