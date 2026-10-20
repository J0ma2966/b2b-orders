import { describe, expect, it } from "vitest";
import { availableSupplierActions, supplierTransition } from "@/lib/statuses";
import { assignableRoles, canManageMember } from "@/lib/supplier-roles";

describe("модерация поставщика", () => {
  it("заявку на проверке можно подтвердить, отклонить, запросить сведения, заблокировать", () => {
    expect(availableSupplierActions("PENDING").sort()).toEqual(["approve", "block", "reject", "request_info"]);
  });

  it("активного можно только заблокировать", () => {
    expect(availableSupplierActions("ACTIVE")).toEqual(["block"]);
    expect(supplierTransition("approve", "ACTIVE")).toBeNull();
  });

  it("разблокировка возвращает в активные", () => {
    expect(supplierTransition("unblock", "BLOCKED")).toBe("ACTIVE");
  });

  it("после запроса сведений поставщик отправляет заявку снова", () => {
    expect(supplierTransition("request_info", "PENDING")).toBe("NEEDS_INFO");
    expect(supplierTransition("resubmit", "NEEDS_INFO")).toBe("PENDING");
    expect(supplierTransition("resubmit", "ACTIVE")).toBeNull();
  });
});

describe("права в команде поставщика", () => {
  it("владелец управляет администраторами и доставщиками", () => {
    expect(assignableRoles("OWNER")).toEqual(["ADMIN", "COURIER"]);
  });
  it("администратор — только доставщиками", () => {
    expect(assignableRoles("ADMIN")).toEqual(["COURIER"]);
    expect(canManageMember("ADMIN", "ADMIN")).toBe(false);
  });
  it("владельца не трогает никто, доставщик никого", () => {
    expect(canManageMember("OWNER", "OWNER")).toBe(false);
    expect(assignableRoles("COURIER")).toEqual([]);
  });
});
