import { describe, expect, it } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { apnsBody, apnsJwt, apnsTokenGone, fcmBody, fcmErrorSummary, fcmTokenGone, fcmTransient, googleAssertion, validDeviceToken } from "@/lib/native-push-core";
import { safePath } from "@/lib/push-path";
import { fileNameFrom } from "@/lib/native";

const parts = (jwt: string) => jwt.split(".").map((p, i) => (i < 2 ? JSON.parse(Buffer.from(p, "base64url").toString()) : p));

describe("push в мобильном приложении", () => {
  it("JWT для APNs подписан ES256 и проверяется открытым ключом", () => {
    const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = apnsJwt({ keyId: "KEY123", teamId: "TEAM1", privateKey: pem }, 1_700_000_000);
    const [header, claims, sig] = parts(jwt);
    expect(header).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(claims).toEqual({ iss: "TEAM1", iat: 1_700_000_000 });
    const [h, c] = jwt.split(".");
    const ok = verify("sha256", Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(sig, "base64url"));
    expect(ok).toBe(true);
    expect(Buffer.from(sig, "base64url")).toHaveLength(64);
  });

  it("JWT сервисного аккаунта Google подписан RS256 и запрашивает только FCM", () => {
    const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
    const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    const jwt = googleAssertion({ client_email: "push@p.iam.gserviceaccount.com", private_key: pem }, 100);
    const [header, claims, sig] = parts(jwt);
    expect(header.alg).toBe("RS256");
    expect(claims).toMatchObject({ iss: "push@p.iam.gserviceaccount.com", scope: "https://www.googleapis.com/auth/firebase.messaging", iat: 100, exp: 3700 });
    const [h, c] = jwt.split(".");
    expect(verify("RSA-SHA256", Buffer.from(`${h}.${c}`), publicKey, Buffer.from(sig, "base64url"))).toBe(true);
  });

  it("по нажатию уведомление открывает только страницу своего сайта", () => {
    expect(safePath("/shop/orders/1")).toBe("/shop/orders/1");
    expect(safePath("https://evil.example/x")).toBe("/notifications");
    expect(safePath("//evil.example/x")).toBe("/notifications");
    expect(safePath("/\\evil.example")).toBe("/notifications");
    expect(safePath(null)).toBe("/notifications");
    expect(fcmBody("tok", { title: "T", body: "B", url: "javascript:alert(1)" }).message.data.url).toBe("/notifications");
    expect(apnsBody({ title: "T", body: "B", url: "/courier" })).toEqual({ aps: { alert: { title: "T", body: "B" }, sound: "default" }, url: "/courier" });
  });

  it("недействительные токены распознаются и удаляются", () => {
    expect(fcmTokenGone(404, "")).toBe(true);
    expect(fcmTokenGone(400, '{"error":{"details":[{"errorCode":"UNREGISTERED"}]}}')).toBe(true);
    expect(fcmTokenGone(500, "UNREGISTERED")).toBe(false);
    expect(fcmTokenGone(401, "")).toBe(false);
    expect(fcmTokenGone(403, '{"error":{"status":"PERMISSION_DENIED","details":[{"errorCode":"SENDER_ID_MISMATCH"}]}}')).toBe(true);
    expect(fcmTokenGone(403, '{"error":{"status":"PERMISSION_DENIED","message":"Permission denied"}}')).toBe(false);
    expect(fcmTokenGone(400, '{"error":{"message":"The registration token is not a valid FCM registration token"}}')).toBe(true);
    expect(fcmTransient(503)).toBe(true);
    expect(fcmTransient(429)).toBe(true);
    expect(fcmTransient(403)).toBe(false);
    expect(fcmErrorSummary(403, '{\n "error": {\n  "code": 403,\n  "message": "Permission denied",\n  "status": "PERMISSION_DENIED"\n }\n}')).toBe(
      "FCM 403 PERMISSION_DENIED: Permission denied",
    );
    const iam = fcmErrorSummary(
      403,
      JSON.stringify({ error: { code: 403, message: "Permission 'cloudmessaging.messages.create' denied on resource 'projects/x'. Remediate access with this Troubleshooter URL - https://console.cloud.google.com/x .", status: "PERMISSION_DENIED", details: [{ reason: "IAM_PERMISSION_DENIED" }] } }),
    );
    expect(iam).toMatch(/^FCM 403 IAM_PERMISSION_DENIED: Permission 'cloudmessaging.messages.create' denied on resource 'projects\/x'\. → /);
    expect(iam).not.toContain("Troubleshooter");
    expect(fcmErrorSummary(502, "<html>\nBad gateway</html>")).toBe("FCM 502: <html> Bad gateway</html>");
    expect(apnsTokenGone(410, "")).toBe(true);
    expect(apnsTokenGone(400, '{"reason":"BadDeviceToken"}')).toBe(true);
    expect(apnsTokenGone(403, '{"reason":"InvalidProviderToken"}')).toBe(false);
  });

  it("принимаются только токены правильного вида", () => {
    expect(validDeviceToken("IOS", "a".repeat(64))).toBe(true);
    expect(validDeviceToken("IOS", "a".repeat(63))).toBe(false);
    expect(validDeviceToken("ANDROID", "cXyZ:APA91b" + "x".repeat(140))).toBe(true);
    expect(validDeviceToken("ANDROID", "bad token with spaces")).toBe(false);
    expect(validDeviceToken("ANDROID", 123)).toBe(false);
  });
});

describe("выгрузка файлов в приложении", () => {
  it("имя файла берётся из Content-Disposition и очищается от путей", () => {
    expect(fileNameFrom(`attachment; filename="orders.xlsx"; filename*=UTF-8''%D0%97%D0%B0%D0%BA%D0%B0%D0%B7%D1%8B.xlsx`, "file")).toBe("Заказы.xlsx");
    expect(fileNameFrom(`attachment; filename="debts.xlsx"`, "file")).toBe("debts.xlsx");
    expect(fileNameFrom(`attachment; filename="../../etc/passwd"`, "file")).toBe("_.._etc_passwd");
    expect(fileNameFrom(null, "file")).toBe("file");
    expect(fileNameFrom(`attachment; filename*=UTF-8''%E0%A4%A`, "file")).toBe("file");
  });
});
