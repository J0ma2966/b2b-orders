-- AlterTable
ALTER TABLE "SupplierMember" ADD COLUMN     "delivers" BOOLEAN NOT NULL DEFAULT false;


-- Поставщик без своих доставщиков развозит сам: владелец сразу получает раздел «Доставка»
UPDATE "SupplierMember" m SET "delivers" = true
WHERE m.role = 'OWNER'
  AND NOT EXISTS (
    SELECT 1 FROM "SupplierMember" c
    WHERE c."supplierId" = m."supplierId" AND c.role = 'COURIER' AND c."isActive"
  );
