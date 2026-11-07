// Счётчики разделов меню (нижняя панель, меню слева, вкладки, экран «Ещё»).
// Чистые функции: к какому разделу относится ссылка уведомления и как сложить счётчики.

export type Badges = Record<string, number>;

// Путь без ?запроса и #якоря
const pathOf = (link: string) => link.split(/[?#]/, 1)[0];

// Раздел ссылки — самый длинный href меню, который является её началом.
// aliases переносит чужие пути в свой раздел: у поставщика, который развозит сам, «/courier» → «Доставки».
export function sectionOf(link: string | null | undefined, hrefs: string[], aliases: Record<string, string> = {}): string | null {
  if (!link || !link.startsWith("/")) return null;
  let path = pathOf(link);
  for (const [from, to] of Object.entries(aliases)) {
    if (path === from || path.startsWith(from + "/")) {
      path = to;
      break;
    }
  }
  let best: string | null = null;
  for (const href of hrefs) {
    if ((path === href || path.startsWith(href + "/")) && (!best || href.length > best.length)) best = href;
  }
  return best;
}

export function countBySection(links: (string | null)[], hrefs: string[], aliases?: Record<string, string>): Badges {
  const out: Badges = {};
  for (const link of links) {
    const s = sectionOf(link, hrefs, aliases);
    if (s) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

// Счётчик раздела — наибольшее из «ждёт действия» и «непрочитанных уведомлений», чтобы одно событие не считалось дважды
export function mergeMax(...all: Badges[]): Badges {
  const out: Badges = {};
  for (const b of all) for (const [k, v] of Object.entries(b)) if (v > 0) out[k] = Math.max(out[k] ?? 0, v);
  return out;
}

// Пункт, который собирает разделы, не поместившиеся в нижнюю панель («Ещё», «Профиль»), получает их сумму
export function withOverflow(badges: Badges, allHrefs: string[], shownHrefs: string[], overflowHref: string): Badges {
  const hidden = allHrefs.filter((h) => !shownHrefs.includes(h) && h !== overflowHref);
  const sum = hidden.reduce((s, h) => s + (badges[h] ?? 0), 0);
  return sum > 0 ? { ...badges, [overflowHref]: (badges[overflowHref] ?? 0) + sum } : badges;
}

// Уведомления, которые закрывает открытие страницы: ссылка ведёт ровно на эту страницу
export function seenLinks(pathname: string) {
  const path = pathOf(pathname);
  return [path, `${path}?`, `${path}#`];
}
