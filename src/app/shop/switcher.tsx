import { getShopContext } from "@/lib/auth/current";

export async function ShopSwitcher() {
  const ctx = await getShopContext();
  if (!ctx) return null;
  return <span className="truncate text-sm text-gray-500">{ctx.shop.name}</span>;
}
