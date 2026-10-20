import { Suspense } from "react";
import { Spinner } from "@/components/ui";

// Документы для печати: без меню кабинета
export default function DocumentsLayout({ children }: LayoutProps<"/documents">) {
  return (
    <div className="mx-auto w-full max-w-3xl flex-1 bg-white p-4 text-sm text-gray-900 sm:p-8 print:p-0">
      <Suspense fallback={<Spinner />}>{children}</Suspense>
    </div>
  );
}
