// Автоматический артикул товара: A-00001, A-00002… — свой счётчик у каждого поставщика.
// Буква впереди — чтобы Excel при выгрузке и обратной загрузке не превратил артикул в число 1.
export const SKU_PREFIX = "A-";

export function formatSku(n: number) {
  return `${SKU_PREFIX}${String(n).padStart(5, "0")}`;
}
