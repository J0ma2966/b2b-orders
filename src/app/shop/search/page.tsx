import { redirect } from "next/navigation";

// Поиск по всем поставщикам теперь в ленте товаров на главной; старые ссылки ведут туда
export default async function ShopSearchPage({ searchParams }: PageProps<"/shop/search">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  redirect(q ? `/shop?q=${encodeURIComponent(q)}` : "/shop");
}
