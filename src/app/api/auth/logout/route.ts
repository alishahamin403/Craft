import { clearSessionCookie } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function POST(request: Request) {
  const response = new Response(null, {
    status: 303,
    headers: { Location: new URL("/", request.url).toString() },
  });
  clearSessionCookie(response);
  return response;
}
