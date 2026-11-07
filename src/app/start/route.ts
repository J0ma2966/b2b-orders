import { cookies } from "next/headers";
import { getAuth, homePathFor } from "@/lib/auth/current";
import { SESSION_COOKIE } from "@/lib/auth/session";

function go(path: string) {
  return new Response(null, { status: 307, headers: { Location: path, "Cache-Control": "no-store" } });
}

// Куда вести вошедшего пользователя с главной (см. src/proxy.ts)
export async function GET() {
  const auth = await getAuth();
  if (!auth) {
    // Сессия истекла или удалена — убираем cookie, иначе главная снова отправит сюда
    (await cookies()).delete(SESSION_COOKIE);
    return go("/");
  }
  const home = await homePathFor(auth);
  // Без магазина и поставщика кабинета нет — профиль, а не главная (иначе цикл)
  return go(home === "/" ? "/account" : home);
}
