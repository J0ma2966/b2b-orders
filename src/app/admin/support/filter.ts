import type { Prisma } from "@/generated/prisma/client";
import { isSupportTopic } from "@/lib/support-topics";

export type SupportFilter = { q: string; status?: string; topic?: string };

const str = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, 200) : "");

// Фильтр списка писем из параметров адреса или формы. topic: код темы или «none» — без темы.
export function supportFilter(get: (k: string) => unknown): SupportFilter {
  const status = str(get("status"));
  const topic = str(get("topic"));
  return {
    q: str(get("q")),
    status: status === "new" || status === "handled" || status === "spam" ? status : undefined,
    topic: topic === "none" || isSupportTopic(topic) ? topic : undefined,
  };
}

export function supportWhere({ q, status, topic }: SupportFilter): Prisma.SupportEmailWhereInput {
  return {
    // Спам Gmail виден только в своём фильтре
    spam: status === "spam",
    ...(status === "new" && { handledAt: null }),
    ...(status === "handled" && { handledAt: { not: null } }),
    ...(topic && { topic: topic === "none" ? null : topic }),
    ...(q && {
      OR: [
        { subject: { contains: q, mode: "insensitive" } },
        { fromAddress: { contains: q, mode: "insensitive" } },
        { fromName: { contains: q, mode: "insensitive" } },
        { text: { contains: q, mode: "insensitive" } },
      ],
    }),
  };
}
