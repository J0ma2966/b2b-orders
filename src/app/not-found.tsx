import { ButtonLink } from "@/components/ui";
import { Tr } from "@/components/ui/tr";

export default function NotFound() {
  return (
    <main className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center px-4 py-16 text-center">
      <div className="text-5xl font-semibold text-gray-300">404</div>
      <h1 className="mt-2 text-lg font-semibold"><Tr>Страница не найдена</Tr></h1>
      <p className="mt-1 text-sm text-gray-500"><Tr>Возможно, ссылка устарела или у вас нет доступа к этому разделу.</Tr></p>
      <ButtonLink href="/" className="mt-6">На главную</ButtonLink>
    </main>
  );
}
