import Link from "next/link";
import { LanguageSwitcher } from "@/components/shell/language-switcher";
import { Tr } from "@/components/ui/tr";

export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-8 sm:py-12">
      <div className="mb-6 flex w-full max-w-xl items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold text-brand-700">
          <Tr>Оптовые заказы</Tr>
        </Link>
        <LanguageSwitcher />
      </div>
      <div className="w-full max-w-xl">{children}</div>
    </div>
  );
}
