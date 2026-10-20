import Link from "next/link";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-8 sm:py-12">
      <Link href="/" className="mb-6 text-lg font-semibold text-brand-700">
        Оптовые заказы
      </Link>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
