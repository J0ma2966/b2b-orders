// Запуск фоновых задач по таймеру внутри процесса сервера. При нескольких экземплярах
// приложения задачи остаются безопасными: каждая отмечает обработанные записи.
const INTERVAL = Number(process.env.JOBS_INTERVAL_MS ?? 5 * 60_000);

let started = false;

export function startJobs() {
  if (started) return;
  started = true;
  const tick = async () => {
    try {
      const { runJobs } = await import("./jobs");
      await runJobs();
    } catch (e) {
      console.error("[jobs]", e);
    }
  };
  setTimeout(tick, 30_000);
  setInterval(tick, INTERVAL).unref();
}
