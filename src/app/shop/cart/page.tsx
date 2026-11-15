import Link from "next/link";
import { EmptyState } from "@/components/ui";
import { CartBoard } from "@/components/shop/cart-board";
import { lineTotal } from "@/lib/order-core";
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
        <CartBoard
          owner={owner}
          blocked={ctx.shop.isBlocked}
          defaults={{ address: ctx.shop.address, contactName: ctx.shop.contactName, contactPhone: formatPhone(ctx.shop.phone) }}
          carts={carts.map((c, i) => {
            const next = terms[i].restrictsDates ? terms[i].dates()[0] : null;
            return {
              supplierId: c.supplierId,
              name: c.supplier.displayName,
              logo: fileUrl(c.supplier.logoPath) ?? null,
              min: terms[i].minOrderTotal ?? 0,
              next: next ? t.date(next) : null,
              items: c.items.map((it) => ({ id: it.id, name: it.productName, qty: `${formatQty(it.qty)} ${t(it.unitLabel)}`, sum: lineTotal(Number(it.price), Number(it.qty)) })),
            };
          })}
        />
      )}
    </>
  );
}
