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
  account: { creditAllowed: boolean; creditLimit: number | null },
  balanceBefore: number,
  balanceAfter: number,
): string | null {
  if (balanceAfter <= Math.max(0, balanceBefore)) return null;
  if (!account.creditAllowed) return "Магазину не разрешена работа в долг: нужно получить всю сумму";
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
