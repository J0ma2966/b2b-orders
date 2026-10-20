import Link from "next/link";

export default function CatalogLayout({ children }: LayoutProps<"/supplier/catalog">) {
  return (
    <>
      <div className="mb-4 flex gap-4 border-b border-gray-200 text-sm">
        <Link href="/supplier/catalog" className="-mb-px border-b-2 border-transparent pb-2 hover:border-gray-300">Товары</Link>
        <Link href="/supplier/catalog/categories" className="-mb-px border-b-2 border-transparent pb-2 hover:border-gray-300">Категории</Link>
      </div>
      {children}
    </>
  );
}
