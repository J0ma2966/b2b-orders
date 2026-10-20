import Link from "next/link";
import { fileUrl } from "@/lib/storage-url";
import { Tr } from "@/components/ui/tr";

// Плитка поставщика на витрине магазина
export function SupplierCard({ s }: { s: { id: string; displayName: string; description: string | null; logoPath: string | null } }) {
  const logo = fileUrl(s.logoPath);
  return (
    <Link href={`/shop/suppliers/${s.id}`} className="group flex items-center gap-4 rounded-2xl bg-surface p-4 ring-1 ring-black/5 hover:ring-brand-500">
      {logo ? (
        <img src={logo} alt="" className="size-16 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-brand-600 font-display text-2xl font-semibold text-on-brand" aria-hidden>
          {s.displayName.replace(/^(ООО|ИП|ЧП|МЧЖ|XK|OOO)\s*/i, "").replace(/[«"]/g, "").slice(0, 1)}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold group-hover:text-brand-700">{s.displayName}</div>
        {s.description && <div className="mt-0.5 line-clamp-2 text-sm text-gray-500">{s.description}</div>}
        <div className="mt-1.5 text-sm font-medium text-brand-700"><Tr>Открыть каталог</Tr></div>
      </div>
    </Link>
  );
}
