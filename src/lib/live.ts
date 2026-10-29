import "server-only";
import { db } from "@/lib/db";

// Отметка «что-то произошло» для пользователя: последнее его уведомление. Почти каждое событие
// (новый заказ, смена статуса, назначение, оплата) создаёт уведомление адресатам — по смене
// отметки открытая страница понимает, что её данные устарели.
export async function liveStamp(userId: string) {
  const last = await db.notification.findFirst({ where: { userId }, orderBy: { createdAt: "desc" }, select: { id: true } });
  return last?.id ?? "";
}
