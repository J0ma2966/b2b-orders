-- AlterTable
ALTER TABLE "User" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);

-- Номер уже подтверждён: супер-админ, привязанный чат Telegram (человек поделился своим номером в боте)
-- или учётная запись создана самим человеком при регистрации (запись журнала register в те же секунды).
-- Сотрудники, которых добавил кто-то другой, остаются неподтверждёнными до первого входа по коду.
UPDATE "User" u SET "phoneVerifiedAt" = u."createdAt"
WHERE u."isSuperAdmin"
   OR u."telegramChatId" IS NOT NULL
   OR EXISTS (
     SELECT 1 FROM "AuditLog" a
     WHERE a."action" = 'register' AND a."actorUserId" = u."id"
       AND a."createdAt" <= u."createdAt" + INTERVAL '10 seconds'
   );
