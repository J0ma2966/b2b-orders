import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Card, EmptyState, cn } from "@/components/ui";
import { CheckoutAllForm } from "@/components/orders/shop-forms";
import { Avatar, Money, Progress } from "@/components/shop/ui";
import { formatPhone } from "@/lib/phone";
import { formatQty } from "@/lib/catalog";
import { db } from "@/lib/db";
import { requireShop } from "@/lib/auth/current";
import { supplierTermsForShop } from "@/lib/supplier-terms";
import { fileUrl } from "@/lib/storage-url";
import { getT } from "@/lib/i18n/server";

// Корзины по поставщикам: у каждого поставщика свой заказ (ТЗ п. 21).
// Макет: карточка на поставщика со строками товаров и путём до минимальной суммы, внизу — салатовая плашка «Итого».
export default async function CartsPage() {
  const [ctx, t] = await Promise.all([requireShop(), getT()]);
  const carts = await db.order.findMany({
    where: { shopId: ctx.shop.id, status: "DRAFT", items: { some: {} } },
    include: { supplier: true, items: { orderBy: { createdAt: "asc" }, select: { id: true, productName: true, unitLabel: true, qty: true, price: true } } },
    orderBy: { updatedAt: "desc" },
  });
  const terms = await Promise.all(carts.map((c) => supplierTermsForShop(db, c.supplierId, ctx.shop.territoryId)));
  const owner = ctx.membership.role === "OWNER";
  const positions = carts.reduce((s, c) => s + c.items.length, 0);
  const sum = carts.reduce((s, c) => s + Number(c.total), 0);
  const checkoutHref = carts.length === 1 || !owner ? `/shop/cart/${carts[0]?.supplierId}` : "#checkout-all";
  return (
    <>
      <div className="mb-5 flex items-center gap-3 pt-1">
        <h1 className="font-display text-[2rem] leading-none font-bold tracking-tight">{t("Корзина")}</h1>
        {positions > 0 && <span className="rounded-full bg-night px-3 py-1 text-sm font-bold text-lime tabular-nums">{positions}</span>}
      </div>
      {carts.length === 0 ? (
        <EmptyState>
          {t("Корзина пуста.")} <Link href="/shop/suppliers" className="font-semibold text-brand-700 underline">{t("Выбрать поставщика")}</Link>
        </EmptyState>
      ) : (
        <div className="space-y-3 pb-24 md:pb-0">
          {carts.map((c, i) => {
            const min = terms[i].minOrderTotal ?? 0;
            const total = Number(c.total);
            const short = Math.max(0, min - total);
            const next = terms[i].restrictsDates ? terms[i].dates()[0] : null;
            return (
              <section key={c.id} className="rounded-[1.75rem] bg-surface p-4">
                <Link href={`/shop/cart/${c.supplierId}`} className="flex items-center gap-3">
                  <Avatar name={c.supplier.displayName} src={fileUrl(c.supplier.logoPath)} className="size-12 text-sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-lg leading-tight font-bold">{c.supplier.displayName}</span>
                    <span className="block truncate text-sm text-gray-500">{next ? t("Доставка {date}", { date: t.date(next) }) : t("{n} позиций", { n: c.items.length })}</span>
                  </span>
                  <span className="shrink-0 font-display text-lg font-bold tabular-nums">{t.money(total)}</span>
                </Link>
                <ul className="mt-3 space-y-1.5 text-[15px]">
                  {c.items.slice(0, 4).map((it) => (
                    <li key={it.id} className="flex justify-between gap-3">
                      <span className="min-w-0 truncate">
                        {it.productName} <span className="text-gray-500">× {formatQty(it.qty)} {t(it.unitLabel)}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">{t.money(Number(it.price) * Number(it.qty))}</span>
                    </li>
                  ))}
                  {c.items.length > 4 && <li className="text-sm text-gray-500">{t("и ещё {n}", { n: c.items.length - 4 })}</li>}
                </ul>
                {min > 0 &&
                  (short > 0 ? (
                    <div className="mt-3 rounded-2xl bg-coral-soft px-4 py-3">
                      <div className="flex items-center justify-between gap-3 text-sm font-bold text-red-900">
                        <span>{t("До минимальной суммы {sum}", { sum: t.money(short) })}</span>
                        <Link href={`/shop/suppliers/${c.supplierId}`} className="flex shrink-0 items-center gap-1">
                          {t("Добавить")} <ArrowRight className="size-4" aria-hidden />
                        </Link>
                      </div>
                      <Progress value={total / min} tone="coral" className="mt-2 bg-white/60" />
                    </div>
                  ) : (
                    <div className="mt-3 flex items-center gap-2 rounded-2xl bg-brand-50 px-4 py-3 text-sm font-bold text-brand-700">
                      <Check className="size-4" strokeWidth={2.6} aria-hidden />
                      {t("Минимальная сумма набрана")}
                    </div>
                  ))}
              </section>
            );
          })}
          {carts.length > 1 && owner && !ctx.shop.isBlocked && (
            <Card className="mt-6 scroll-mt-4 rounded-[1.75rem] ring-0" id="checkout-all">
              <h2 className="mb-1 font-display text-lg font-semibold">{t("Оформить все корзины сразу")}</h2>
              <p className="mb-4 text-sm text-gray-500">{t("У каждого поставщика будет свой заказ. Если какой-то не получится оформить, он останется в корзине.")}</p>
              <CheckoutAllForm
                count={carts.length}
                total={t.money(sum)}
                defaults={{ address: ctx.shop.address, contactName: ctx.shop.contactName, contactPhone: formatPhone(ctx.shop.phone) }}
              />
            </Card>
          )}
        </div>
      )}
      {carts.length > 0 && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+max(0.625rem,env(safe-area-inset-bottom)))] z-[999] px-3 md:bottom-4">
          <div className="pointer-events-auto mx-auto flex max-w-xl items-center gap-3 rounded-[1.75rem] bg-lime py-3 pr-3 pl-5 text-night shadow-[0_10px_30px_-10px_rgb(0_0_0/0.35)]">
            <div className="min-w-0 flex-1 overflow-hidden">
              <div className="truncate text-sm font-semibold">{t("Итого · поставщиков: {n}", { n: carts.length })}</div>
              <Money text={t.money(sum)} className="block font-display text-[1.4rem] font-bold tracking-tight tabular-nums" />
            </div>
            <Link href={checkoutHref} className={cn("flex h-14 shrink-0 items-center gap-2 rounded-[1.25rem] bg-night px-4 font-bold text-white")}>
              {t(owner ? "Оформить" : "Открыть")}
              <ArrowRight className="size-5 text-lime" strokeWidth={2.4} aria-hidden />
            </Link>
          </div>
        </div>
      )}
    </>
  );
}
