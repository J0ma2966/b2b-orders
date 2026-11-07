import { NextResponse, type NextRequest } from "next/server";

// Вошедший пользователь, открывший главную (это и стартовый экран мобильного приложения), сразу
// попадает в кабинет своей роли, а не на страницу регистрации. Здесь только проверка cookie без
// базы: сессию и роль проверяет /start, он же отвечает переадресацией (адрес в ней относительный,
// поэтому работает и по IP в локальной сети, и за прокси).
export function proxy(request: NextRequest) {
  if (!request.cookies.has("b2b_session")) return NextResponse.next();
  return NextResponse.rewrite(new URL("/start", request.url));
}

export const config = { matcher: "/" };
