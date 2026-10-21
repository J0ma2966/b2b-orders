import type { Prisma, OrderStatus } from "@/generated/prisma/client";
import { requireActiveSupplier, requireShopOwner, requireShop, requireSuperAdmin } from "@/lib/auth/current";
import { getT } from "@/lib/i18n/server";
import { debtSheets, ordersSheet, reportSheets } from "@/lib/exports";
import { buildReport } from "@/lib/reports";
import { ORDER_STATUS_LABEL, orderStatusFilter } from "@/lib/order-core";
import { parsePeriod, periodRange } from "@/lib/report-core";
import { buildXlsx, type Sheet } from "@/lib/xlsx";

// П7: выгрузка в Excel. /api/export/{supplier|shop|admin}/{orders|debts|report}?…
// Параметры те же, что у страниц списков и отчётов.
export async function GET(req: Request, { params }: RouteContext<"/api/export/[scope]/[kind]">) {
  const { scope, kind } = await params;
  const sp = new URL(req.url).searchParams;
  const str = (k: string) => sp.get(k) ?? "";
  const t = await getT();
  const range = () => periodRange(parsePeriod(str("period") || undefined), new Date(), { from: str("from") || undefined, to: str("to") || undefined });
  const status = str("status");
  const ordersWhere: Prisma.OrderWhereInput = { status: orderStatusFilter(status || "all") };
  let sheets: Sheet[] | null = null;

  if (scope === "supplier") {
    const ctx = await requireActiveSupplier();
    const supplierId = ctx.supplier.id;
    if (kind === "orders") sheets = [await ordersSheet({ ...ordersWhere, supplierId }, t, { shop: true })];
    if (kind === "debts") sheets = await debtSheets({ supplierId }, t);
    if (kind === "report") sheets = reportSheets(await buildReport({ ...range(), supplierId }), t, false);
  } else if (scope === "shop") {
    const ctx = kind === "orders" ? await requireShop() : await requireShopOwner();
    const shopId = ctx.shop.id;
    if (kind === "orders") sheets = [await ordersSheet({ ...ordersWhere, shopId }, t, { supplier: true })];
    if (kind === "debts") sheets = await debtSheets({ shopId }, t);
  } else if (scope === "admin") {
    await requireSuperAdmin();
    if (kind === "orders") sheets = [await ordersSheet({ ...ordersWhere, ...(str("supplier") && { supplierId: str("supplier") }) }, t, { shop: true, supplier: true })];
    if (kind === "report") {
      sheets = reportSheets(
        await buildReport({
          ...range(),
          supplierId: str("supplier") || undefined,
          territoryId: str("territory") || undefined,
          shopId: str("shop") || undefined,
          productId: str("product") || undefined,
          status: status in ORDER_STATUS_LABEL ? (status as OrderStatus) : undefined,
        }),
        t,
        true,
      );
    }
  }
  if (!sheets) return new Response("Not found", { status: 404 });
  const day = new Date(Date.now() + 5 * 3_600_000).toISOString().slice(0, 10);
  return new Response(new Uint8Array(buildXlsx(sheets)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${kind}-${day}.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
