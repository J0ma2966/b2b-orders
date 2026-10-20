import { getSupplierContext } from "@/lib/auth/current";
import { switchSupplierAction } from "./actions";

export async function SupplierSwitcher() {
  const ctx = await getSupplierContext();
  if (!ctx) return null;
  if (ctx.memberships.length < 2) return <span className="truncate text-sm text-gray-500">{ctx.supplier.displayName}</span>;
  return (
    <div className="flex gap-1 overflow-x-auto">
      {ctx.memberships.map((m) => (
        <form key={m.id} action={switchSupplierAction}>
          <input type="hidden" name="supplierId" value={m.supplierId} />
          <button className={`rounded-full px-3 py-1 text-xs whitespace-nowrap ${m.supplierId === ctx.supplier.id ? "bg-brand-600 text-white" : "bg-gray-100 text-gray-700"}`}>
            {m.supplier.displayName}
          </button>
        </form>
      ))}
    </div>
  );
}
