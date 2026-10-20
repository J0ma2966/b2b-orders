"use client";

export function PrintBar({ back }: { back: string }) {
  return (
    <div className="mb-4 flex justify-between print:hidden">
      <button type="button" onClick={() => history.length > 1 ? history.back() : (location.href = back)} className="text-brand-600">← Назад</button>
      <button type="button" onClick={() => window.print()} className="rounded-lg bg-brand-600 px-4 py-2 text-white">Печать / PDF</button>
    </div>
  );
}
