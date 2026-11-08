"use client";

import { useSyncExternalStore } from "react";
import { Spinner } from "@/components/ui";

// Индикатор загрузки при переходе между страницами.
// Пока сервер готовит новую страницу, на экране остаётся старая — без подсказки кажется, что нажатие не сработало.
// Быстрые переходы ничего не показывают; если переход идёт дольше BAR_DELAY — сверху ползёт тонкая полоска
// в цвете раздела, дольше SKELETON_DELAY — вместо старой страницы появляется её «силуэт» (тот же Spinner,
// что и при первой загрузке). Переход заканчивается, когда Next.js меняет адрес в истории браузера.

const BAR_DELAY = 200;
const SKELETON_DELAY = 1000;
const GIVE_UP = 15000;
const FINISH = 320;

type Phase = "idle" | "bar" | "slow" | "finish";

let phase: Phase = "idle";
let from: string | null = null;
let timers: ReturnType<typeof setTimeout>[] = [];
const listeners = new Set<() => void>();

function set(next: Phase) {
  if (phase === next) return;
  phase = next;
  listeners.forEach((l) => l());
}

function clearTimers() {
  timers.forEach(clearTimeout);
  timers = [];
}

function here() {
  return location.pathname + location.search;
}

function start() {
  clearTimers();
  from = here();
  if (phase === "finish") set("idle");
  timers.push(
    setTimeout(() => set("bar"), BAR_DELAY),
    setTimeout(() => set("slow"), SKELETON_DELAY),
    setTimeout(done, GIVE_UP),
  );
}

function done() {
  if (from === null) return;
  from = null;
  clearTimers();
  if (phase === "idle") return;
  // Полоска добегает до конца и гаснет; «силуэт» убирается сразу
  set("finish");
  timers.push(setTimeout(() => set("idle"), FINISH));
}

// Ссылка, по которой Next.js перейдёт внутри приложения: обычный клик, тот же сайт, другой адрес.
// Выгрузки и файлы (/api, /files) открываются без перехода — для них индикатор не нужен.
function navigatesTo(e: MouseEvent): boolean {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  const a = (e.target as Element | null)?.closest?.("a");
  if (!a || !a.href || a.hasAttribute("download") || (a.target && a.target !== "_self")) return false;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin) return false;
  if (/^\/(api|files)\//.test(url.pathname)) return false;
  return url.pathname + url.search !== here();
}

let installed = false;
function install() {
  if (installed) return;
  installed = true;
  document.addEventListener(
    "click",
    (e) => {
      if (navigatesTo(e)) start();
    },
    true,
  );
  // Next.js записывает новый адрес, когда новая страница уже на экране
  for (const name of ["pushState", "replaceState"] as const) {
    const original = history[name];
    history[name] = function (this: History, ...args: Parameters<History["pushState"]>) {
      const result = original.apply(this, args);
      if (from !== null && here() !== from) done();
      return result;
    };
  }
  window.addEventListener("popstate", done);
  window.addEventListener("pageshow", done);
}

function subscribe(listener: () => void) {
  install();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function usePhase() {
  return useSyncExternalStore(subscribe, () => phase, () => "idle" as Phase);
}

// Полоска вверху экрана (над шапкой и под вырезом телефона)
export function NavProgressBar() {
  const p = usePhase();
  if (p === "idle") return null;
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-[env(safe-area-inset-top)] z-[2000] h-[3px]">
      <div className={p === "finish" ? "nav-progress nav-progress-done" : "nav-progress"} />
    </div>
  );
}

// «Силуэт» страницы вместо старой, если переход затянулся. Ставится внутрь <main> (position: relative);
// старая страница прячется правилом в globals.css, отступы берутся у <main>
export function NavPendingOverlay() {
  const p = usePhase();
  if (p !== "slow") return null;
  return (
    <div className="nav-pending absolute inset-0 z-10" style={{ padding: "inherit" }}>
      <div className="sticky top-20">
        <Spinner />
      </div>
    </div>
  );
}
