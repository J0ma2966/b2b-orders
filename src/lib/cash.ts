import "server-only";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/stock";
import { notifyUsers } from "@/lib/notify";
import { formatMoney } from "@/lib/format";
import { tashkentDay } from "./order-core";

export class CashError extends Error {}

const num = (v: { toString(): string } | null | undefined) => (v == null ? 0 : Number(v.toString()));
const r2 = (n: number) => Math.round(n * 100) / 100;

// Д1: наличные доставщика — получено наличными при приёмке минус сданное поставщику.
export async function courierCash(supplierId: string, courierId: string, now = new Date()) {
  const dayStart = new Date(tashkentDay(now).getTime() - 5 * 3_600_000);
  const cashOrders = { supplierId, courierId, receivedMethod: "CASH" as const, receivedAmount: { not: null } };
  const [all, today, handed, lastHandover] = await Promise.all([
    db.order.aggregate({ where: cashOrders, _sum: { receivedAmount: true } }),
    db.order.aggregate({ where: { ...cashOrders, completedAt: { gte: dayStart } }, _sum: { receivedAmount: true }, _count: true }),
    db.cashHandover.aggregate({ where: { supplierId, courierId }, _sum: { amount: true } }),
    db.cashHandover.findFirst({ where: { supplierId, courierId }, orderBy: { createdAt: "desc" } }),
  ]);
  return {
    onHand: r2(num(all._sum.receivedAmount) - num(handed._sum.amount)),
    today: num(today._sum.receivedAmount),
    todayOrders: today._count,
    lastHandover,
  };
}

// Наличные заказы доставщика после последней сдачи кассы — что именно у него на руках
export async function cashOrdersSince(supplierId: string, courierId: string, since: Date | null) {
  return db.order.findMany({
    where: { supplierId, courierId, receivedMethod: "CASH", receivedAmount: { gt: 0 }, ...(since && { completedAt: { gt: since } }) },
    include: { shop: true },
    orderBy: { completedAt: "desc" },
    take: 100,
  });
}

// Поставщик отмечает «принял X сум»; расхождение с суммой на руках сохраняется в записи.
export async function acceptHandover(supplierId: string, courierId: string, amount: number, comment: string | null) {
  const actor = await currentActor();
  if (!(amount > 0)) throw new CashError("Укажите принятую сумму");
  return db.$transaction(async (tx) => {
    // Блокировка доставщика: две сдачи подряд не посчитают один и тот же остаток
    const member = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "SupplierMember" WHERE "supplierId" = ${supplierId} AND "userId" = ${courierId} AND role = 'COURIER' FOR UPDATE`;
    if (member.length === 0) throw new CashError("Доставщик не найден");
    const [got, handed] = await Promise.all([
      tx.order.aggregate({ where: { supplierId, courierId, receivedMethod: "CASH" }, _sum: { receivedAmount: true } }),
      tx.cashHandover.aggregate({ where: { supplierId, courierId }, _sum: { amount: true } }),
    ]);
    const onHand = r2(num(got._sum.receivedAmount) - num(handed._sum.amount));
    const h = await tx.cashHandover.create({ data: { supplierId, courierId, amount, onHand, comment, acceptedByUserId: actor.userId } });
    const diff = r2(onHand - amount);
    await notifyUsers(
      [courierId],
      {
        type: "cash.handover",
        title: `Поставщик принял наличные: ${formatMoney(amount)}`,
        body: diff === 0 ? "Без расхождений" : diff > 0 ? `Не хватает ${formatMoney(diff)}` : `Сдано больше на ${formatMoney(-diff)}`,
        link: "/courier/cash",
        entity: "CashHandover",
        entityId: h.id,
      },
      tx,
    );
    return { handover: h, onHand, diff };
  });
}
