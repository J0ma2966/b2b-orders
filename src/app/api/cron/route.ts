import { timingSafeEqual } from "node:crypto";
import { runJobs } from "@/lib/jobs";

// Ручной или внешний запуск фоновых задач: POST /api/cron с заголовком Authorization: Bearer CRON_SECRET
export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  const got = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!secret || got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) {
    return new Response("Forbidden", { status: 403 });
  }
  return Response.json(await runJobs());
}
