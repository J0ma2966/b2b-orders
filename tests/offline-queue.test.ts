import { describe, expect, it } from "vitest";
import { clearDraft, enqueue, formFields, isNetworkError, markQueuedError, queuedFor, readDraft, readQueue, removeQueued, saveDraft, toFormData } from "@/lib/offline-queue";

function memoryStore() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
}

describe("Д4: приёмки без сети", () => {
  it("одна приёмка на заказ, у каждого доставщика своя очередь", () => {
    const s = memoryStore();
    enqueue(s, { userId: "u1", orderId: "o1", title: "№1", fields: [["qr", "A"]] }, 1);
    enqueue(s, { userId: "u2", orderId: "o2", title: "№2", fields: [] }, 2);
    const again = enqueue(s, { userId: "u1", orderId: "o1", title: "№1", fields: [["qr", "B"]] }, 3);
    expect(readQueue(s, "u1")).toEqual([again]);
    expect(queuedFor(s, "u1", "o1")?.fields).toEqual([["qr", "B"]]);
    expect(queuedFor(s, "u1", "o2")).toBeNull();
    markQueuedError(s, again.id, "QR-код не подходит");
    expect(queuedFor(s, "u1", "o1")?.error).toBe("QR-код не подходит");
    removeQueued(s, again.id);
    expect(readQueue(s, "u1")).toEqual([]);
    expect(readQueue(s, "u2")).toHaveLength(1);
  });

  it("испорченное хранилище не ломает приложение", () => {
    const s = memoryStore();
    s.setItem("b2b-offline-acceptances", "{oops");
    expect(readQueue(s, "u1")).toEqual([]);
    s.setItem("b2b-offline-acceptances", JSON.stringify([{ id: 1 }, null, { id: "x", userId: "u1", fields: [] }]));
    expect(readQueue(s, "u1").map((e) => e.id)).toEqual(["x"]);
  });

  it("поля формы без служебных, черновик живёт сутки", () => {
    const fd = new FormData();
    fd.append("$ACTION_ID_abc", "");
    fd.append("itemId", "i1");
    fd.append("itemId", "i2");
    fd.append("qr", "ABC");
    const fields = formFields(fd);
    expect(fields).toEqual([["itemId", "i1"], ["itemId", "i2"], ["qr", "ABC"]]);
    expect(toFormData(fields).getAll("itemId")).toEqual(["i1", "i2"]);

    const s = memoryStore();
    saveDraft(s, "o1", fields, 1000);
    expect(readDraft(s, "o1", 2000)).toEqual(fields);
    expect(readDraft(s, "o1", 1000 + 25 * 3600_000)).toBeNull();
    clearDraft(s, "o1");
    expect(readDraft(s, "o1", 2000)).toBeNull();
  });

  it("сбой сети отличается от ошибки в коде", () => {
    expect(isNetworkError(new TypeError("Failed to fetch"))).toBe(true);
    expect(isNetworkError(new TypeError("Load failed"))).toBe(true);
    expect(isNetworkError(new TypeError("x is not a function"))).toBe(false);
    expect(isNetworkError(new Error("boom"), false)).toBe(true);
  });
});
