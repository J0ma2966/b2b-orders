import { ButtonLink } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="text-5xl font-semibold text-gray-300">404</div>
      <h1 className="mt-2 text-lg font-semibold">Страница не найдена</h1>
      <p className="mt-1 text-sm text-gray-500">Возможно, ссылка устарела или у вас нет доступа к этому разделу.</p>
      <ButtonLink href="/" className="mt-6">На главную</ButtonLink>
    </main>
  );
}
