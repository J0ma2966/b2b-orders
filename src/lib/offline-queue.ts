// Д4: приёмки, сохранённые на телефоне без сети, и черновики формы приёмки.
// Хранилище передаётся параметром — так помощники проверяются тестами без браузера.

export type QueuedAcceptance = {
  id: string;
  userId: string;
  orderId: string;
  title: string; // «№12, Магазин» — для списка неотправленных
  fields: [string, string][];
  savedAt: number;
  error?: string; // сервер отклонил: доставщик исправляет и отправляет снова
};

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const QUEUE_KEY = "b2b-offline-acceptances";
const DRAFT_KEY = "b2b-accept-draft:";
export const QUEUE_EVENT = "b2b-offline-queue";
// Черновик дольше суток не нужен: доставка за это время закрыта или переназначена
const DRAFT_TTL = 24 * 3600_000;

function readAll(store: Store): QueuedAcceptance[] {
  try {
    const list = JSON.parse(store.getItem(QUEUE_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === "string" && Array.isArray(e.fields)) : [];
  } catch {
    return [];
  }
}

function writeAll(store: Store, list: QueuedAcceptance[]) {
  if (list.length) store.setItem(QUEUE_KEY, JSON.stringify(list));
  else store.removeItem(QUEUE_KEY);
}

export function readQueue(store: Store, userId: string) {
  return readAll(store).filter((e) => e.userId === userId);
}

export function queuedFor(store: Store, userId: string, orderId: string) {
  return readQueue(store, userId).find((e) => e.orderId === orderId) ?? null;
}

// Одна приёмка на заказ: новая отправка заменяет прежнюю
export function enqueue(store: Store, entry: Omit<QueuedAcceptance, "id" | "savedAt">, now = Date.now()) {
  const list = readAll(store).filter((e) => !(e.userId === entry.userId && e.orderId === entry.orderId));
  const item: QueuedAcceptance = { ...entry, id: `${entry.orderId}-${now}`, savedAt: now };
  writeAll(store, [...list, item]);
  return item;
}

export function removeQueued(store: Store, id: string) {
  writeAll(store, readAll(store).filter((e) => e.id !== id));
}

export function markQueuedError(store: Store, id: string, error: string) {
  writeAll(store, readAll(store).map((e) => (e.id === id ? { ...e, error } : e)));
}

// Поля формы без служебных полей серверного действия
export function formFields(fd: FormData): [string, string][] {
  const out: [string, string][] = [];
  for (const [k, v] of fd.entries()) if (typeof v === "string" && !k.startsWith("$")) out.push([k, v]);
  return out;
}

export function toFormData(fields: [string, string][]) {
  const fd = new FormData();
  for (const [k, v] of fields) fd.append(k, v);
  return fd;
}

// Запрос не дошёл до сервера: нет сети или связь оборвалась
export function isNetworkError(e: unknown, online = true) {
  return !online || (e instanceof TypeError && /fetch|network|load failed/i.test(e.message));
}

export function saveDraft(store: Store, orderId: string, fields: [string, string][], now = Date.now()) {
  store.setItem(DRAFT_KEY + orderId, JSON.stringify({ at: now, fields }));
}

export function readDraft(store: Store, orderId: string, now = Date.now()): [string, string][] | null {
  try {
    const d = JSON.parse(store.getItem(DRAFT_KEY + orderId) ?? "null");
    if (!d || !Array.isArray(d.fields) || now - d.at > DRAFT_TTL) return null;
    return d.fields;
  } catch {
    return null;
  }
}

export function clearDraft(store: Store, orderId: string) {
  store.removeItem(DRAFT_KEY + orderId);
}

// localStorage может быть недоступен (приватный режим, запрет сайта)
export function browserStore(): Store | null {
  try {
    const s = window.localStorage;
    s.getItem(QUEUE_KEY);
    return s;
  } catch {
    return null;
  }
}

export function announceQueue() {
  window.dispatchEvent(new Event(QUEUE_EVENT));
}

export const NO_NETWORK = "Нет сети. Попробуйте ещё раз, когда появится связь";

// Просьба к service worker сохранить страницы для работы без сети.
// prune — убрать сохранённые заказы, которых нет в списке (доставлены или сняты)
export function warmPages(urls: string[], opts: { force?: boolean; prune?: boolean } = {}) {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "warm", urls, ...opts });
  } catch {}
}

export function forgetOfflinePages() {
  try {
    navigator.serviceWorker?.controller?.postMessage({ type: "forget" });
  } catch {}
}
