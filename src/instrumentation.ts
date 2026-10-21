// Фоновые задачи запускаются вместе с сервером (Л2, Л3, Л7, А1)
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.JOBS_DISABLED === "1") return;
  const { startJobs } = await import("./lib/jobs-runner");
  startJobs();
}
