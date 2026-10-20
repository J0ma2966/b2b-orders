import Link from "next/link";

export const PAGE_SIZE = 20;

export function pageFrom(sp: Record<string, string | string[] | undefined>) {
  const n = Number(sp.page);
  return Number.isInteger(n) && n > 0 ? n : 1;
}

export function Pagination({
  page,
  total,
  basePath,
  params,
}: {
  page: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (pages <= 1) return null;
  const href = (p: number) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) q.set(k, v);
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return s ? `${basePath}?${s}` : basePath;
  };
  return (
    <div className="mt-4 flex items-center justify-between text-sm">
      <span className="text-gray-500">
        Страница {page} из {pages} · всего {total}
      </span>
      <div className="flex gap-2">
        {page > 1 && <Link className="rounded-lg px-3 py-1.5 ring-1 ring-gray-300 hover:bg-gray-50" href={href(page - 1)}>← Назад</Link>}
        {page < pages && <Link className="rounded-lg px-3 py-1.5 ring-1 ring-gray-300 hover:bg-gray-50" href={href(page + 1)}>Вперёд →</Link>}
      </div>
    </div>
  );
}
