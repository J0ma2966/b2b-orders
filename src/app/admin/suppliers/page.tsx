import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { FilterBar } from "@/components/ui/filter-bar";
import { PAGE_SIZE, Pagination, pageFrom } from "@/components/ui/pagination";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/auth/current";
import { formatDate } from "@/lib/format";
import { formatPhone } from "@/lib/phone";
import { SUPPLIER_STATUS_COLOR, SUPPLIER_STATUS_LABEL } from "@/lib/statuses";
import type { Prisma, SupplierStatus } from "@/generated/prisma/client";

export default async function SuppliersPage({ searchParams }: PageProps<"/admin/suppliers">) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = typeof sp.status === "string" && sp.status in SUPPLIER_STATUS_LABEL ? (sp.status as SupplierStatus) : undefined;
  const page = pageFrom(sp);
  const where: Prisma.SupplierWhereInput = {
    ...(status === "PENDING" ? { status: { in: ["PENDING", "NEEDS_INFO"] } } : status ? { status } : {}),
    ...(q && {
      OR: [
        { legalName: { contains: q, mode: "insensitive" } },
        { displayName: { contains: q, mode: "insensitive" } },
        { inn: { contains: q } },
        { phone: { contains: q } },
      ],
    }),
  };
  const [total, rows] = await Promise.all([
    db.supplier.count({ where }),
    db.supplier.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE }),
  ]);
  return (
    <>
      <PageHeader title="Поставщики" />
      <FilterBar q={q} status={status} statuses={Object.entries(SUPPLIER_STATUS_LABEL)} placeholder="Название, ИНН, телефон" />
      {rows.length === 0 ? (
        <EmptyState>Поставщиков не найдено</EmptyState>
      ) : (
        <Card className="p-0 sm:p-0">
          <ul className="divide-y divide-gray-100">
            {rows.map((s) => (
              <li key={s.id}>
                <Link href={`/admin/suppliers/${s.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.legalName}</div>
                    <div className="text-xs text-gray-500">
                      ИНН {s.inn} · {formatPhone(s.phone)} · заявка {formatDate(s.createdAt)}
                    </div>
                  </div>
                  <Badge color={SUPPLIER_STATUS_COLOR[s.status]}>{SUPPLIER_STATUS_LABEL[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page} total={total} basePath="/admin/suppliers" params={{ q, status }} />
    </>
  );
}
