import type { Metadata } from "next";
import Link from "next/link";
import { getLocale, getT } from "@/lib/i18n/server";
import { legalInfo } from "@/lib/legal";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT())("Политика конфиденциальности") };
}

// Политика конфиденциальности сайта и мобильных приложений (обязательна для App Store и Google Play).
// Перечень данных должен совпадать с анкетами «App Privacy» и «Data safety» — см. docs/mobile.md.
export default async function PrivacyPage() {
  const locale = await getLocale();
  const L = legalInfo();
  const contact = (
    <>
      <a href={`mailto:${L.email}`} className="text-brand-600">{L.email}</a>
      {L.phone && <>, {L.phone}</>}
    </>
  );
  if (locale === "uz") {
    return (
      <>
        <h1>Maxfiylik siyosati</h1>
        <p>Yangilangan: {L.updated}. Ushbu siyosat «Ulgurji buyurtmalar» platformasi — sayt hamda Android va iOS ilovalariga taalluqli. Shaxsiy ma’lumotlar operatori: {L.operator}. Aloqa: {contact}.</p>
        <h2>Qanday ma’lumotlar yigʻiladi</h2>
        <ul>
          <li>Hisob: ism, telefon raqami, e-mail (ixtiyoriy), parol (faqat xesh koʻrinishida saqlanadi), interfeys tili.</li>
          <li>Tashkilot: doʻkon yoki yetkazib beruvchi nomi, INN, manzil, telefonlar, xaritadagi nuqta, logotip va rasmlar.</li>
          <li>Buyurtmalar va hisob-kitoblar: buyurtmalar, qabul qilish, toʻlovlar, qarzlar, almashtirish arizalari (nuqson rasmi va videosi bilan).</li>
          <li>Joylashuv: faqat siz xaritada «Mening joylashuvim» tugmasini bosganingizda, doʻkon nuqtasini belgilash uchun. Fonda kuzatilmaydi.</li>
          <li>Kamera: buyurtmani qabul qilishda QR-kodni skanerlash va nuqson rasmini olish uchun. Rasmlar faqat siz yuborganingizda serverga yuklanadi.</li>
          <li>Qurilma: push-bildirishnomalar tokeni, kirish sessiyasi, IP-manzil va brauzer/ilova turi — xavfsizlik va kirish jurnali uchun.</li>
        </ul>
        <h2>Nima uchun</h2>
        <p>Faqat platforma ishlashi uchun: buyurtma berish va yetkazib berish, toʻlov va qarzlarni hisobga olish, bildirishnomalar, firibgarlikdan himoya va harakatlar auditi. Reklama, kuzatuv (tracking) va ma’lumotlarni sotish yoʻq. Platforma pul oʻtkazmaydi va bank kartalari ma’lumotlarini saqlamaydi.</p>
        <h2>Kimga beriladi</h2>
        <ul>
          <li>Buyurtmangiz ishtirokchilariga: doʻkon — yetkazib beruvchi va uning kuryeriga (manzil, telefon, buyurtma), yetkazib beruvchi — doʻkonga.</li>
          <li>Push-bildirishnomalarni yetkazish uchun: Google (Firebase Cloud Messaging) va Apple (APNs) — faqat bildirishnoma matni va qurilma tokeni.</li>
          <li>Xarita plitkalari OpenStreetMap’dan yuklanadi.</li>
          <li>Qonunda nazarda tutilgan hollarda davlat organlariga.</li>
        </ul>
        <h2>Saqlash va himoya</h2>
        <p>Ma’lumotlar Oʻzbekiston Respublikasining «Shaxsga doir ma’lumotlar toʻgʻrisida»gi qonuniga muvofiq qayta ishlanadi. Ulanish faqat HTTPS orqali, parollar bcrypt xeshi koʻrinishida saqlanadi, kirish sessiyasi ilovada himoyalangan cookie’da saqlanadi va zaxira nusxaga tushmaydi.</p>
        <h2>Hisobni oʻchirish</h2>
        <p>Hisobni istalgan vaqtda ilovada oʻchirish mumkin: Profil → «Hisobni oʻchirish». Batafsil: <Link href="/account-deletion" className="text-brand-600">hisobni oʻchirish</Link>. Ism, telefon, e-mail, parol, sessiyalar va bildirishnomalar darhol oʻchiriladi. Buyurtmalar, toʻlovlar va qarzlar tashkilotlarning hisob hujjatlari sifatida ismingiz va telefoningizsiz saqlanadi.</p>
        <h2>Sizning huquqlaringiz</h2>
        <p>Ma’lumotlaringizni koʻrish, tuzatish va oʻchirishni talab qilishingiz mumkin: {contact}. Javob 30 kun ichida beriladi.</p>
      </>
    );
  }
  return (
    <>
      <h1>Политика конфиденциальности</h1>
      <p>Обновлено: {L.updated}. Политика действует для платформы «Оптовые заказы» — сайта и приложений для Android и iOS. Оператор персональных данных: {L.operator}. Связь: {contact}.</p>
      <h2>Какие данные мы собираем</h2>
      <ul>
        <li>Аккаунт: имя, телефон, e-mail (по желанию), пароль (хранится только в виде хеша), язык интерфейса.</li>
        <li>Организация: название магазина или поставщика, ИНН, адрес, телефоны, точка на карте, логотип и фото.</li>
        <li>Заказы и расчёты: заказы, приёмка, оплаты, долги, заявки на замену (с фото и видео брака).</li>
        <li>Местоположение: только когда вы нажимаете «Моё местоположение» на карте, чтобы отметить точку магазина. В фоне не отслеживается.</li>
        <li>Камера: для сканирования QR-кода при приёмке заказа и снимков брака. Снимки загружаются на сервер, только когда вы их отправляете.</li>
        <li>Устройство: токен push-уведомлений, сессия входа, IP-адрес и тип браузера или приложения — для безопасности и журнала входов.</li>
      </ul>
      <h2>Зачем</h2>
      <p>Только для работы платформы: оформление и доставка заказов, учёт оплат и долгов, уведомления, защита от мошенничества и журнал действий. Рекламы, слежения (tracking) и продажи данных нет. Платформа не проводит платежи и не хранит данные банковских карт.</p>
      <h2>Кому передаются</h2>
      <ul>
        <li>Участникам вашего заказа: магазин — поставщику и его доставщику (адрес, телефон, заказ), поставщик — магазину.</li>
        <li>Для доставки push-уведомлений: Google (Firebase Cloud Messaging) и Apple (APNs) — только текст уведомления и токен устройства.</li>
        <li>Плитки карты загружаются с OpenStreetMap.</li>
        <li>Государственным органам — в случаях, предусмотренных законом.</li>
      </ul>
      <h2>Хранение и защита</h2>
      <p>Данные обрабатываются по Закону Республики Узбекистан «О персональных данных». Соединение только по HTTPS, пароли хранятся в виде хеша bcrypt, сессия входа в приложении хранится в защищённой cookie и не попадает в резервные копии.</p>
      <h2>Удаление аккаунта</h2>
      <p>Аккаунт можно удалить в любой момент в приложении: Профиль → «Удалить аккаунт». Подробнее: <Link href="/account-deletion" className="text-brand-600">удаление аккаунта</Link>. Имя, телефон, e-mail, пароль, сессии и уведомления удаляются сразу. Заказы, оплаты и долги сохраняются как учётные документы организаций — без вашего имени и телефона.</p>
      <h2>Ваши права</h2>
      <p>Вы можете запросить доступ к своим данным, их исправление или удаление: {contact}. Ответ — в течение 30 дней.</p>
    </>
  );
}
