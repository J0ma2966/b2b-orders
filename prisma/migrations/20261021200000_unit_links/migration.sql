-- Л4: единица, остаток которой ведётся в другой единице того же товара («коробка = 24 шт.»)
ALTER TABLE "ProductUnit" ADD COLUMN     "baseQty" DECIMAL(14,3),
ADD COLUMN     "baseUnitId" TEXT;

ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_baseUnitId_fkey" FOREIGN KEY ("baseUnitId") REFERENCES "ProductUnit"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Соотношение задаётся вместе со ссылкой и больше нуля; ссылка на саму себя запрещена
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_base_link" CHECK (
  ("baseUnitId" IS NULL AND "baseQty" IS NULL) OR ("baseUnitId" IS NOT NULL AND "baseQty" > 0 AND "baseUnitId" <> "id")
);

CREATE INDEX "ProductUnit_baseUnitId_idx" ON "ProductUnit"("baseUnitId");
