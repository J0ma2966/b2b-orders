import "server-only";
import { db } from "@/lib/db";
import { getAuth } from "@/lib/auth/current";
import { requestMeta } from "@/lib/auth/session";
import type { Prisma } from "@/generated/prisma/client";

export type AuditChange = { field: string; old: unknown; new: unknown };

type Tx = Prisma.TransactionClient | typeof db;

export type AuditInput = {
  entity: string;
  entityId?: string | null;
  action: string;
  actorRole: string;
  changes?: AuditChange[];
  comment?: string | null;
  supplierId?: string | null;
  shopId?: string | null;
  // Явный автор, когда сессия создаётся в этом же запросе (регистрация)
  actorUserId?: string;
  // Запись о самом входе/выходе из режима «от имени» — от лица супер-админа
  asSelf?: boolean;
};

// Пишет запись аудита от имени текущего пользователя (ТЗ п. 63–64).
// При «действии от имени» сохраняются оба пользователя.
export async function writeAudit(input: AuditInput, tx: Tx = db) {
  const auth = await getAuth();
  const impersonating = !!auth?.isImpersonating && !input.asSelf;
  const meta = await requestMeta();
  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId ?? auth?.realUser.id ?? null,
      onBehalfOfUserId: impersonating ? auth!.user.id : null,
      actorRole: impersonating ? `SUPER_ADMIN→${input.actorRole}` : input.actorRole,
      entity: input.entity,
      entityId: input.entityId ?? null,
      action: input.action,
      changes: (input.changes ?? undefined) as Prisma.InputJsonValue | undefined,
      comment: input.comment ?? null,
      supplierId: input.supplierId ?? null,
      shopId: input.shopId ?? null,
      ip: meta.ip,
    },
  });
}

// Список изменённых полей между старым и новым состоянием.
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): AuditChange[] {
  const changes: AuditChange[] = [];
  for (const field of fields) {
    if (!(field in after)) continue;
    const oldValue = normalize(before[field]);
    const newValue = normalize(after[field]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes.push({ field: String(field), old: oldValue, new: newValue });
    }
  }
  return changes;
}

function normalize(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (value instanceof Date) return value.toISOString();
  if (value !== null && typeof value === "object" && "toFixed" in value) return String(value);
  return value;
}
