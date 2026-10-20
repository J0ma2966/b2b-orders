// Чистая логика территорий (без БД), покрыта тестами.

export type TerritoryNode = { id: string; parentId: string | null; name: string; type: string };

// Цепочка от территории вверх до корня: [район, город, регион, страна].
export function ancestorChain(id: string, byId: Map<string, TerritoryNode>): TerritoryNode[] {
  const chain: TerritoryNode[] = [];
  const seen = new Set<string>();
  let cur = byId.get(id);
  while (cur && !seen.has(cur.id)) {
    chain.push(cur);
    seen.add(cur.id);
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return chain;
}

// Поставщик доставляет в точку, если в его территории есть сама точка или любой её предок
// (ТЗ п. 10: регион покрывает все его города и районы).
export function isCovered(shopTerritoryId: string, supplierTerritoryIds: Iterable<string>, byId: Map<string, TerritoryNode>) {
  const covered = new Set(supplierTerritoryIds);
  return ancestorChain(shopTerritoryId, byId).some((t) => covered.has(t.id));
}

// translateName — перевод названий (сами названия хранятся в базе на русском)
export function territoryLabel(id: string, byId: Map<string, TerritoryNode>, translateName: (name: string) => string = (n) => n) {
  return ancestorChain(id, byId)
    .filter((t) => t.type !== "COUNTRY")
    .reverse()
    .map((t) => translateName(t.name))

    .join(", ");
}
