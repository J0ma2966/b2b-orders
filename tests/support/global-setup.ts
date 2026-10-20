import { execSync } from "node:child_process";

// Интеграционные тесты идут на отдельной базе TEST_DATABASE_URL; миграции применяются перед запуском.
export default function setup() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return;
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "ignore" });
}
