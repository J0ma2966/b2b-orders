-- Минимальное количество единицы продажи в одном заказе (0 — минимума нет)
ALTER TABLE "ProductUnit" ADD COLUMN "minOrderQty" DECIMAL(14,3) NOT NULL DEFAULT 0;
