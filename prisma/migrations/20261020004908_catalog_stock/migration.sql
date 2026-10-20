-- CreateEnum
CREATE TYPE "UnitKind" AS ENUM ('PIECE', 'BOX', 'BLOCK', 'KG', 'PACK', 'LITER', 'OTHER');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('INITIAL', 'INCOME', 'RESERVE', 'RELEASE', 'SALE', 'BONUS', 'FORCED_SALE', 'RETURN_UNACCEPTED', 'TO_RETURNED', 'BACK_TO_STOCK', 'WRITE_OFF', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "AntifraudStatus" AS ENUM ('OPEN', 'CONFIRMED', 'REJECTED', 'WATCHING');

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "categoryId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "brand" TEXT,
    "sku" TEXT,
    "weightKg" DECIMAL(10,3),
    "attributes" JSONB NOT NULL DEFAULT '[]',
    "photoPaths" TEXT[],
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "allowReplacement" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "kind" "UnitKind" NOT NULL,
    "customName" TEXT NOT NULL DEFAULT '',
    "price" DECIMAL(14,2),
    "physicalQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "reservedQty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PriceHistory" (
    "id" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "oldPrice" DECIMAL(14,2),
    "newPrice" DECIMAL(14,2),
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PriceHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "physicalDelta" DECIMAL(14,3) NOT NULL,
    "reservedDelta" DECIMAL(14,3) NOT NULL,
    "physicalAfter" DECIMAL(14,3) NOT NULL,
    "reservedAfter" DECIMAL(14,3) NOT NULL,
    "userId" TEXT,
    "onBehalfOfUserId" TEXT,
    "reason" TEXT,
    "relatedEntity" TEXT,
    "relatedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AntifraudEvent" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "productUnitId" TEXT NOT NULL,
    "oldPrice" DECIMAL(14,2) NOT NULL,
    "newPrice" DECIMAL(14,2) NOT NULL,
    "changePct" DECIMAL(6,2) NOT NULL,
    "userId" TEXT,
    "onBehalfOfUserId" TEXT,
    "status" "AntifraudStatus" NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AntifraudEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Category_supplierId_name_key" ON "Category"("supplierId", "name");

-- CreateIndex
CREATE INDEX "Product_supplierId_archivedAt_idx" ON "Product"("supplierId", "archivedAt");

-- CreateIndex
CREATE INDEX "Product_categoryId_idx" ON "Product"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_productId_kind_customName_key" ON "ProductUnit"("productId", "kind", "customName");

-- CreateIndex
CREATE INDEX "PriceHistory_productUnitId_createdAt_idx" ON "PriceHistory"("productUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_productUnitId_createdAt_idx" ON "StockMovement"("productUnitId", "createdAt");

-- CreateIndex
CREATE INDEX "StockMovement_relatedEntity_relatedId_idx" ON "StockMovement"("relatedEntity", "relatedId");

-- CreateIndex
CREATE INDEX "AntifraudEvent_status_createdAt_idx" ON "AntifraudEvent"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AntifraudEvent_supplierId_idx" ON "AntifraudEvent"("supplierId");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PriceHistory" ADD CONSTRAINT "PriceHistory_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntifraudEvent" ADD CONSTRAINT "AntifraudEvent_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntifraudEvent" ADD CONSTRAINT "AntifraudEvent_productUnitId_fkey" FOREIGN KEY ("productUnitId") REFERENCES "ProductUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
