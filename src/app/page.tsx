import AuthScreen from "@/components/auth-screen";
import Dashboard from "@/components/dashboard";
import {
  getCurrentUser,
  getMissingGoogleAuthEnv,
  isGoogleAuthConfigured,
} from "@/lib/auth";
import { listGenerationRecords } from "@/lib/generations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ auth?: string | string[] }>;
}) {
  const user = await getCurrentUser();

  if (!user) {
    const params = await searchParams;
    const authParam = Array.isArray(params.auth) ? params.auth[0] : params.auth;
    const authError = authParam === "failed" || authParam === "not-configured"
      ? authParam
      : undefined;

    return (
      <AuthScreen
        authError={authError}
        isConfigured={isGoogleAuthConfigured()}
        missingEnv={getMissingGoogleAuthEnv()}
      />
    );
  }

  const initialGenerations = await listGenerationRecords(user.id);

  return <Dashboard initialGenerations={initialGenerations} user={user} />;
}
