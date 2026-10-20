-- Отрицательный доступный остаток недопустим (ТЗ п. 18, 67): страховка на уровне базы
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_stock_non_negative"
  CHECK ("physicalQty" >= 0 AND "reservedQty" >= 0 AND "physicalQty" >= "reservedQty");
