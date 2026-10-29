import { getAuth } from "@/lib/auth/current";
import { liveStamp } from "@/lib/live";

// Открытые страницы раз в полминуты спрашивают, не появилось ли новых событий (см. LiveRefresh)
export async function GET() {
  const auth = await getAuth();
  if (!auth) return Response.json({ stamp: null }, { status: 401, headers: { "Cache-Control": "no-store" } });
  return Response.json({ stamp: await liveStamp(auth.user.id) }, { headers: { "Cache-Control": "no-store" } });
}
