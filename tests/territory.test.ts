import { describe, expect, it } from "vitest";
import { ancestorChain, isCovered, territoryLabel, type TerritoryNode } from "@/lib/territory-core";

const nodes: TerritoryNode[] = [
  { id: "uz", parentId: null, name: "Узбекистан", type: "COUNTRY" },
  { id: "tash", parentId: "uz", name: "г. Ташкент", type: "REGION" },
  { id: "chil", parentId: "tash", name: "Чиланзарский район", type: "DISTRICT" },
  { id: "yunus", parentId: "tash", name: "Юнусабадский район", type: "DISTRICT" },
  { id: "khorezm", parentId: "uz", name: "Хорезмская область", type: "REGION" },
  { id: "urgench", parentId: "khorezm", name: "Ургенч", type: "CITY" },
];
const byId = new Map(nodes.map((n) => [n.id, n]));

describe("территории доставки", () => {
  it("строит цепочку до корня", () => {
    expect(ancestorChain("chil", byId).map((t) => t.id)).toEqual(["chil", "tash", "uz"]);
  });

  it("регион покрывает свои районы", () => {
    expect(isCovered("chil", ["tash"], byId)).toBe(true);
  });

  it("район покрывает только себя", () => {
    expect(isCovered("chil", ["yunus"], byId)).toBe(false);
    expect(isCovered("yunus", ["yunus"], byId)).toBe(true);
  });

  it("другой регион не покрывает", () => {
    expect(isCovered("urgench", ["tash"], byId)).toBe(false);
  });

  it("не зацикливается на битых данных", () => {
    const loop = new Map<string, TerritoryNode>([
      ["a", { id: "a", parentId: "b", name: "A", type: "CITY" }],
      ["b", { id: "b", parentId: "a", name: "B", type: "REGION" }],
    ]);
    expect(ancestorChain("a", loop)).toHaveLength(2);
  });

  it("подпись без страны", () => {
    expect(territoryLabel("urgench", byId)).toBe("Хорезмская область, Ургенч");
  });
});
