-- Автоматический артикул товара: счётчик у поставщика и артикулы для товаров, у которых его нет
ALTER TABLE "Supplier" ADD COLUMN "skuSeq" INTEGER NOT NULL DEFAULT 0;

UPDATE "Supplier" s SET "skuSeq" = c.n
FROM (SELECT "supplierId", COUNT(*)::int AS n FROM "Product" WHERE "sku" IS NULL OR btrim("sku") = '' GROUP BY "supplierId") c
WHERE s."id" = c."supplierId";

UPDATE "Product" p SET "sku" = 'A-' || lpad(x.n::text, 5, '0')
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "supplierId" ORDER BY "createdAt", "id") AS n
  FROM "Product" WHERE "sku" IS NULL OR btrim("sku") = ''
) x
WHERE p."id" = x."id";
