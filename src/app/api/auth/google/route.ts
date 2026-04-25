import { createGoogleAuthRedirect } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request) {
  return createGoogleAuthRedirect(request);
}
