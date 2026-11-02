// Переход по нажатию на уведомление — только на страницу своего сайта
export function safePath(url: string | null | undefined) {
  return url && url.startsWith("/") && !url.startsWith("//") && !url.startsWith("/\\") ? url : "/notifications";
}
