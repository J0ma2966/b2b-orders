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
  startSupportMail();
}

// Почта техподдержки (src/lib/support-mail.ts): своя частота, по умолчанию раз в минуту.
// Включается, только если в .env заданы SUPPORT_IMAP_HOST и SUPPORT_IMAP_USER (пароль проверит сама проверка).
function startSupportMail() {
  if (!process.env.SUPPORT_IMAP_HOST || !process.env.SUPPORT_IMAP_USER) return;
  const every = Math.max(30_000, Number(process.env.SUPPORT_MAIL_INTERVAL_MS) || 60_000);
  const tick = async () => {
    try {
      const { pollSupportMail } = await import("./support-mail");
      await pollSupportMail();
    } catch (e) {
      console.error("[support-mail]", e);
    }
  };
  setTimeout(tick, 20_000);
  setInterval(tick, every).unref();
}
