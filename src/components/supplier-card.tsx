import Link from "next/link";
import { fileUrl } from "@/lib/storage-url";

export function SupplierCard({ s }: { s: { id: string; displayName: string; description: string | null; logoPath: string | null } }) {
  const logo = fileUrl(s.logoPath);
  return (
    <Link href={`/shop/suppliers/${s.id}`} className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm ring-1 ring-gray-200 hover:ring-brand-500">
      {logo ? (
        <img src={logo} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <div className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-xl font-semibold text-brand-700">
          {s.displayName.slice(0, 1)}
        </div>
      )}
      <div className="min-w-0">
        <div className="truncate font-medium">{s.displayName}</div>
        {s.description && <div className="line-clamp-2 text-xs text-gray-500">{s.description}</div>}
      </div>
    </Link>
  );
}
