import "server-only";
import { db } from "@/lib/db";

// Лимит неудачных входов (пароль и одноразовый код считаются вместе).
//
// Раньше попытки сначала считались, а записывались уже после проверки пароля или кода. Сотня
// запросов, отправленных одновременно, успевала пройти подсчёт раньше, чем появлялась первая
// запись, и лимит не срабатывал — так за один залп можно было перебрать сотни вариантов кода.
// Теперь подсчёт и запись попытки идут под блокировкой на номер и на адрес, до проверки пароля:
// из любого числа одновременных запросов дальше проходит не больше лимита.

export const LOGIN_WINDOW_MS = 15 * 60 * 1000;
export const MAX_FAILS_PER_PHONE = 5;
export const MAX_FAILS_PER_IP = 30;

// Занимает место под попытку. null — лимит исчерпан, пароль или код проверять нельзя.
export async function reserveLoginAttempt(
  phone: string,
  ip: string | null,
): Promise<string | null> {
  const since = new Date(Date.now() - LOGIN_WINDOW_MS);
  // Блокировка короткая: медленная проверка пароля (bcrypt) идёт уже после неё
  return db
    .$transaction(async (tx) => {
      if (ip)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(3, hashtext(${ip}))`;
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4, hashtext(${phone}))`;
      const phoneFails = await tx.loginAttempt.count({
        where: { phone, success: false, createdAt: { gte: since } },
      });
      const ipFails = ip
        ? await tx.loginAttempt.count({
            where: { ip, success: false, createdAt: { gte: since } },
          })
        : 0;
      if (phoneFails >= MAX_FAILS_PER_PHONE || ipFails >= MAX_FAILS_PER_IP)
        return null;
      // Пока пароль не проверен, попытка считается неудачной и занимает место в лимите
      return (
        await tx.loginAttempt.create({ data: { phone, ip, success: false } })
      ).id;
    })
    .catch((e) => {
      // Очередь на блокировку не дождалась своей очереди (поток запросов на один номер) — это тоже отказ
      if (isTxTimeout(e)) return null;
      throw e;
    });
}

// Prisma: транзакция не началась или не уложилась в отведённое время
export function isTxTimeout(e: unknown) {
  return (e as { code?: string } | null)?.code === "P2028";
}

// Удачный вход перестаёт считаться неудачей; неудачный остаётся как записан.
export async function finishLoginAttempt(id: string, success: boolean) {
  if (success)
    await db.loginAttempt
      .update({ where: { id }, data: { success: true } })
      .catch(() => null);
}
