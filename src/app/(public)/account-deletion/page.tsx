import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getT } from "@/lib/i18n/server";
import { legalInfo } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Удаление аккаунта") };
}

// Открытая страница об удалении аккаунта: её адрес указывается в Google Play (Data safety → Delete account URL).
// Сюда же попадает пользователь после удаления (?done=1).
export default async function AccountDeletionInfoPage({ searchParams }: PageProps<"/account-deletion">) {
  const [locale, params] = await Promise.all([getLocale(), searchParams]);
  const L = legalInfo();
  const done = params.done === "1";
  const mail = <a href={`mailto:${L.email}`} className="text-brand-600">{L.email}</a>;
  if (locale === "uz") {
    return (
      <>
        {done && <p className="mb-4 rounded-lg bg-green-50 p-3 text-green-900 ring-1 ring-green-200">Hisobingiz oʻchirildi.</p>}
        <h1>«Ulgurji buyurtmalar» hisobini oʻchirish</h1>
        <h2>Qanday oʻchirish mumkin</h2>
        <ul>
          <li>Ilovada yoki saytda: kiring → Profil → «Hisobni oʻchirish» → parolni kiriting va tasdiqlang.</li>
          <li>Kira olmasangiz: hisob telefon raqamidan {mail} manziliga xat yozing — 30 kun ichida oʻchiramiz.</li>
        </ul>
        <h2>Darhol oʻchiriladi</h2>
        <ul>
          <li>ism, telefon, e-mail, parol;</li>
          <li>barcha qurilmalardagi kirish sessiyalari va push tokenlari;</li>
          <li>bildirishnomalaringiz va doʻkon/yetkazib beruvchiga kirish huquqi.</li>
        </ul>
        <h2>Saqlanadi</h2>
        <p>Buyurtmalar, toʻlovlar, qarzlar, cheklar va yuk xatlari — doʻkon va yetkazib beruvchining hisob hujjatlari. Ular ismingiz va telefoningizsiz («Oʻchirilgan foydalanuvchi») qonunda belgilangan muddat davomida saqlanadi. Xavfsizlik jurnali yozuvlari ham shaxsiy ma’lumotlarsiz saqlanadi.</p>
        <p><Link href="/privacy" className="text-brand-600">Maxfiylik siyosati</Link></p>
      </>
    );
  }
  return (
    <>
      {done && <p className="mb-4 rounded-lg bg-green-50 p-3 text-green-900 ring-1 ring-green-200">Ваш аккаунт удалён.</p>}
      <h1>Удаление аккаунта «Оптовые заказы»</h1>
      <h2>Как удалить</h2>
      <ul>
        <li>В приложении или на сайте: войдите → Профиль → «Удалить аккаунт» → введите пароль и подтвердите.</li>
        <li>Если войти не получается: напишите на {mail} с номера телефона аккаунта — удалим в течение 30 дней.</li>
      </ul>
      <h2>Удаляется сразу</h2>
      <ul>
        <li>имя, телефон, e-mail, пароль;</li>
        <li>входы на всех устройствах и токены push-уведомлений;</li>
        <li>ваши уведомления и доступ к магазинам и поставщикам.</li>
      </ul>
      <h2>Сохраняется</h2>
      <p>Заказы, оплаты, долги, чеки и накладные — учётные документы магазина и поставщика. Они хранятся без вашего имени и телефона («Удалённый пользователь») в течение срока, установленного законом. Записи журнала безопасности тоже сохраняются без личных данных.</p>
      <p><Link href="/privacy" className="text-brand-600">Политика конфиденциальности</Link></p>
    </>
  );
}
