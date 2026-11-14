// Распределение оплаты и правила задолженности без БД (покрыто тестами). ТЗ п. 38–42.

const r2 = (n: number) => Math.round(n * 100) / 100;

export type Distribution = {
  fromPrepay: number; // зачтено из прежней переплаты
  toOrder: number;    // из полученной суммы — в оплату заказа
  orderDebt: number;  // долг по заказу
  toDebt: number;     // погашение прежнего долга
  overpaid: number;   // превышение — переплата магазина
  balanceAfter: number; // > 0 долг, < 0 переплата
};

// balanceBefore: > 0 — долг магазина перед поставщиком, < 0 — переплата.
export function distributePayment(total: number, received: number, balanceBefore: number): Distribution {
  const prepay = Math.max(0, -balanceBefore);
  const debt = Math.max(0, balanceBefore);
  const fromPrepay = Math.min(prepay, total);
  const toOrder = Math.min(received, total - fromPrepay);
  const orderDebt = total - fromPrepay - toOrder;
  const rest = received - toOrder;
  const toDebt = Math.min(rest, debt);
  const overpaid = rest - toDebt;
  return {
    fromPrepay: r2(fromPrepay),
    toOrder: r2(toOrder),
    orderDebt: r2(orderDebt),
    toDebt: r2(toDebt),
    overpaid: r2(overpaid),
    balanceAfter: r2(balanceBefore + total - received),
  };
}

// Можно ли записать такой итоговый баланс (ТЗ п. 39, 90.14–15).
// Без разрешения долг не может вырасти; с лимитом — не выше лимита.
export function creditCheck(
  account: { creditAllowed: boolean; creditLimit: number | null; overdue?: boolean },
  balanceBefore: number,
  balanceAfter: number,
): string | null {
  if (balanceAfter <= Math.max(0, balanceBefore)) return null;
  if (!account.creditAllowed) return "Магазину не разрешена работа в долг: нужно получить всю сумму";
  // Л3: пока долг просрочен, новый долг не открывается
  if (account.overdue) return "У магазина просрочен долг: нужно получить всю сумму заказа";
  if (account.creditLimit !== null && balanceAfter > account.creditLimit) {
    return `Превышен лимит задолженности магазина (${account.creditLimit})`;
  }
  return null;
}

// Минимальная сумма, которую нужно получить, чтобы долг не вырос.
export function minimalPayment(total: number, balanceBefore: number) {
  return r2(Math.max(0, total + balanceBefore - Math.max(0, balanceBefore)));
}

export function balanceText(balance: number, money: (n: number) => string) {
  if (balance > 0) return `долг ${money(balance)}`;
  if (balance < 0) return `переплата ${money(-balance)}`;
  return "нет долга";
}

export type CreditTerms = { creditAllowed: boolean; creditLimit: number | null; overdue?: boolean };

// Л1: сколько магазину нужно будет оплатить при получении, чтобы приёмка прошла проверку
// creditCheck. Просроченный долг (Л3) закрывает работу в долг, пока его не погасят.
export function requiredPayment(account: CreditTerms, balanceBefore: number, total: number) {
  const ceiling = !account.creditAllowed || account.overdue
    ? Math.max(0, balanceBefore)
    : account.creditLimit === null
      ? Infinity
      : Math.max(account.creditLimit, Math.max(0, balanceBefore));
  return r2(Math.max(0, balanceBefore + total - ceiling));
}

// Сколько ещё можно взять в долг; null — без ограничения.
export function creditLeft(account: CreditTerms, balance: number) {
  if (!account.creditAllowed || account.overdue) return 0;
  if (account.creditLimit === null) return null;
  return r2(Math.max(0, account.creditLimit - Math.max(0, balance)));
}

const DAY = 86_400_000;

// Л3: срок оплаты долга. Оплаты гасят самые старые начисления (FIFO), поэтому долг —
// это последние начисления на сумму баланса; срок отсчитывается от самого старого из них.
export function debtAging(balance: number, charges: { amount: number; at: Date }[], termDays: number | null, now: Date) {
  if (balance <= 0 || termDays === null) return null;
  const newestFirst = [...charges].filter((c) => c.amount > 0).sort((a, b) => b.at.getTime() - a.at.getTime());
  let left = balance;
  let since = now;
  for (const c of newestFirst) {
    since = c.at;
    left -= c.amount;
    if (left <= 0.005) break;
  }
  const dueDate = new Date(since.getTime() + termDays * DAY);
  // Просрочено — начисления старше срока, ещё не покрытые оплатами
  const cutoff = now.getTime() - termDays * DAY;
  const recent = newestFirst.filter((c) => c.at.getTime() > cutoff).reduce((s, c) => s + c.amount, 0);
  const overdueAmount = r2(Math.max(0, balance - recent));
  const overdueDays = overdueAmount > 0 ? Math.max(1, Math.floor((now.getTime() - dueDate.getTime()) / DAY)) : 0;
  return { dueDate, overdueAmount, overdueDays };
}

// А3: магазины, у которых долг просрочен сразу у нескольких поставщиков. Видит только админ:
// поставщику чужие долги магазина не раскрываются.
export type OverdueAccount = { shopId: string; supplierId: string; overdueAmount: number; overdueDays: number };

export function groupMultiOverdue<T extends OverdueAccount>(accounts: T[], minSuppliers = 2) {
  const byShop = new Map<string, T[]>();
  for (const a of accounts) if (a.overdueAmount > 0) byShop.set(a.shopId, [...(byShop.get(a.shopId) ?? []), a]);
  return [...byShop.entries()]
    .filter(([, list]) => new Set(list.map((a) => a.supplierId)).size >= minSuppliers)
    .map(([shopId, list]) => ({
      shopId,
      accounts: [...list].sort((a, b) => b.overdueAmount - a.overdueAmount),
      overdueTotal: r2(list.reduce((s, a) => s + a.overdueAmount, 0)),
      maxDays: Math.max(...list.map((a) => a.overdueDays)),
    }))
    .sort((a, b) => b.overdueTotal - a.overdueTotal || b.maxDays - a.maxDays);
}

// Цвет счёта магазина в приложении поставщика: просрочен — красный, долг в срок — жёлтый,
// переплата (деньги магазина на счёте) — зелёный, расчёт закрыт — нейтральный.
export type DebtTone = "overdue" | "due" | "prepay" | "none";

export function debtTone(balance: number, overdueAmount = 0): DebtTone {
  if (balance < -0.005) return "prepay";
  if (balance <= 0.005) return "none";
  return overdueAmount > 0 ? "overdue" : "due";
}

// Порядок в списке: сначала просроченные, затем долги в срок, переплаты и закрытые счета
export const DEBT_TONE_ORDER: Record<DebtTone, number> = { overdue: 0, due: 1, prepay: 2, none: 3 };

// Итоги по магазинам поставщика для блока «Расчёты с магазинами»: сумма и число магазинов каждого цвета
export function debtSummary(accounts: { balance: number; tone: DebtTone }[]) {
  const sum = { overdue: { amount: 0, shops: 0 }, due: { amount: 0, shops: 0 }, prepay: { amount: 0, shops: 0 }, none: { amount: 0, shops: 0 } };
  for (const a of accounts) {
    sum[a.tone].amount = r2(sum[a.tone].amount + Math.abs(a.balance));
    sum[a.tone].shops += 1;
  }
  return { ...sum, owed: r2(sum.overdue.amount + sum.due.amount) };
}

// Сумма полученного заказа с корректировками — база комиссии платформы. Не меньше нуля: корректировка
// одного заказа не должна уменьшать комиссию по другим заказам поставщика.
export function orderValue(total: number, correctionTotal: number) {
  return Math.max(0, total + correctionTotal);
}
