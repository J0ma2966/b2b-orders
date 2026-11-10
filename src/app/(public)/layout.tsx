import Link from "next/link";
import { LanguageSwitcher } from "@/components/shell/language-switcher";

// Открытые страницы без входа: политика конфиденциальности, удаление аккаунта (ссылки для App Store и Google Play)
export default function PublicLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center px-4 py-8 sm:py-12">
      <div className="mb-6 flex w-full max-w-3xl items-center justify-between gap-3">
        <Link href="/" className="text-lg font-semibold text-brand-700">
          OptoLink
        </Link>
        <LanguageSwitcher />
      </div>
      <article className="w-full max-w-3xl rounded-xl bg-surface p-4 text-sm leading-relaxed shadow-sm ring-1 ring-gray-200 sm:p-8 [&_h1]:mb-4 [&_h1]:font-display [&_h1]:text-2xl [&_h1]:font-semibold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_li]:mt-1 [&_p]:mt-2 [&_ul]:list-disc [&_ul]:pl-5">
        {children}
      </article>
    </div>
  );
}
