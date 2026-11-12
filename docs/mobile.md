# Мобильные приложения (Android, iOS)

## Подход

Приложения — нативная оболочка [Capacitor 8](https://capacitorjs.com) над сайтом платформы. Сайт — Next.js с Server Actions и рендером на сервере, поэтому страницы не упаковываются в приложение, а загружаются с сервера (`server.url` в `capacitor.config.ts`). Одна кодовая база: любое изменение на сайте сразу появляется в приложениях без выпуска новой версии, данные всегда те же, что на сайте (одна база, одни и те же Server Actions).

В приложении лежат только: страница «Нет связи» (`mobile/www/offline.html`), иконки и заставка, нативный код.

Почему не React Native / Flutter: пришлось бы переписать все 4 кабинета и держать вторую реализацию логики. Почему не «просто сайт в обёртке»: Apple отклоняет такие приложения (App Review Guideline 4.2 «Minimum Functionality»), поэтому в приложении есть то, чего нет у сайта в браузере.

### Что приложение делает нативно

| Функция | Android | iOS | Где |
|---|---|---|---|
| Push-уведомления системы (на заблокированном экране, без браузера) | FCM | APNs | `src/lib/native-push.ts`, `src/components/native/native-push.ts` |
| Переход из уведомления сразу на заказ | ✓ | ✓ | `src/components/native/native-bridge.tsx` |
| Печать / сохранение PDF чека и накладной системным окном печати | `PrintPlugin.java` | `AppViewController.swift` | `src/lib/native.ts` → `printPage()` |
| Выгрузки Excel — системное меню «Поделиться» (Telegram, почта, файлы) | ✓ | ✓ | `shareDownload()` |
| Карты и маршруты открываются в Яндекс Картах / Google Maps | ✓ | ✓ | NativeBridge |
| Вибрация при считывании QR | ✓ | ✓ | `qr-scanner.tsx` |
| Офлайн доставщика (service worker) | ✓ | ✓ (WKAppBoundDomains) | `public/sw.js` |
| Экран «Нет связи» с повтором вместо ошибки браузера («Повторить» и возврат связи: приложение само проверяет связь и открывает ту же страницу; пока связи нет, экран остаётся на месте) | ✓ | ✓ | `offline.html`, Android: `OfflineRetryPlugin` |
| Сессия входа не попадает в резервные копии | `allowBackup=false` | `isExcludedFromBackup` | манифест / AppDelegate |

Сканер QR — тот же, что на сайте (камера во встроенном браузере + jsQR): работает на обеих платформах без сервисов Google и без лишних 3–5 МБ нативной библиотеки.

Сервер узнаёт приложение по метке `B2BOrdersApp/1` в User-Agent.

### Для кого

Одно приложение для всех ролей: магазин (витрина), доставщик (тёмное приложение для улицы), поставщик (кабинет с нижней панелью «Главная · Заказы · Доставки · Остатки · Ещё»). Поставщик, который развозит сам («Сам развожу заказы»), переходит в режим доставки из «Ещё» или раздела «Доставка» и возвращается кнопкой 🏢. Проверка на телефоне: `tests/e2e/supplier-app.mjs`.

## Сборка

```bash
npm install
# адрес боевого сервера (только https)
MOBILE_SERVER_URL=https://заказы.example.uz npm run mobile:sync
npm run mobile:android   # открывает Android Studio
npm run mobile:ios       # открывает Xcode (только на Mac)
```

**Проверка на своём компьютере по Wi‑Fi** — отладочный APK без зашитого адреса (`MOBILE_DEV_SETUP=1`, адрес вводится на телефоне), пошагово: [docs/local-wifi.md](local-wifi.md).

`mobile:sync` пишет адрес сервера в страницу «Нет связи» и в `WKAppBoundDomains` (Info.plist), затем `cap sync` копирует настройки в оба проекта. Для разработки на своём компьютере: `MOBILE_ALLOW_HTTP=1 MOBILE_SERVER_URL=http://192.168.1.10:3000 npm run mobile:sync` — открытый HTTP разрешён только в отладочной сборке Android.

Проверка в CI: `.github/workflows/mobile.yml` на каждый PR собирает отладочный APK (скачивается в разделе Actions → запуск → Artifacts) и iOS-сборку для симулятора. Адрес сервера для CI — переменная репозитория `MOBILE_SERVER_URL`.

### Android: подписанная сборка для Google Play

В GitHub Actions: **Actions → Android release → Run workflow** — подписанный AAB для Play и APK того же выпуска. Ключ загрузки — в секретах репозитория. Ключ, секреты и всё, что заполнить в Play Console: [docs/google-play.md](google-play.md).

На своём компьютере (нужен Android SDK): ключ из `scripts/android-upload-key.ps1`, файл `mobile/android/keystore.properties` (в .gitignore) со строками `storeFile`, `storePassword`, `keyAlias=upload`, `keyPassword`, затем `cd mobile/android && ./gradlew bundleRelease -PversionCode=2 -PversionName=1.0.1` → `app/build/outputs/bundle/release/app-release.aab`. `versionCode` увеличивать при каждой загрузке.

### iOS: сборка для App Store

На Mac с Xcode 16+: `npm run mobile:ios` → в Xcode выбрать команду (Team) в Signing & Capabilities, проверить, что есть Push Notifications → Product → Archive → Distribute App → App Store Connect.

В `App.entitlements` стоит `aps-environment = development` (для сборок из Xcode). При Archive → Distribute App с профилем App Store Xcode сам подставляет `production`; проверьте это в окне экспорта (Entitlements). Сервер для TestFlight и App Store должен работать с `APNS_PRODUCTION=1`.

Отступы от системных панелей: сайт не использует `viewport-fit=cover`, поэтому на iOS включён `contentInset: "automatic"`, а на Android 15+ (принудительный edge-to-edge) WebView отодвигает сам Capacitor (`SystemBars.insetsHandling`). При первой установке на устройство проверьте, что шапка не уходит под строку состояния.

### Иконка и заставка

`python3 scripts/mobile-icons.py` — из файлов `mobile/resources` (`icon.png`, `foreground.png`, `monochrome.png`, `splash-mark.png`, все 1024×1024) делает иконки Android (обычные, круглые, адаптивные и тематические Android 13+), iOS, PWA и заставки. Сейчас там логотип OptoLink; исходники в SVG и правила использования — `public/brand/README.md`.

### Push-уведомления: настройка сервера

| Платформа | Что нужно | Переменные `.env` |
|---|---|---|
| Android | Проект Firebase → добавить Android-приложение `uz.b2borders.app` → скачать `google-services.json` в `mobile/android/app/` (или в секрет `GOOGLE_SERVICES_JSON` для сборки в GitHub Actions); Project settings → Service accounts → Generate new private key | `FCM_SERVICE_ACCOUNT_FILE` (или `FCM_SERVICE_ACCOUNT` — JSON строкой) |
| iOS | Apple Developer → Keys → новый ключ с APNs → файл `.p8`, Key ID; Team ID — в Membership | `APNS_KEY_FILE`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION=1` для TestFlight/App Store |

Без этих ключей приложение работает, только системные push не приходят (уведомления в колокольчике и счётчики разделов есть всегда). Токен устройства привязан к сессии входа (`DeviceToken.sessionId`, каскадное удаление): после «Выйти» на телефоне уведомления на него больше не приходят. Недействительные токены (приложение удалено) сервер удаляет сам по ответу FCM/APNs.

#### Firebase для Android по шагам

1. Откройте <https://console.firebase.google.com> под Google-аккаунтом → **Create a project** (название любое, например `b2b-orders`; Google Analytics можно выключить).
2. На странице проекта нажмите значок **Android** («Add app») → *Android package name*: `uz.b2borders.app` (ровно так, иначе push не придут) → *Register app*.
3. Скачайте **google-services.json** (кнопка *Download google-services.json*). Остальные шаги мастера (Gradle) пропустите — в проекте уже настроено.
4. Файл нужен **приложению**:
   - сборка в GitHub Actions (APK из артефактов `android-debug-apk`, `android-wifi-test-apk`): репозиторий → **Settings → Secrets and variables → Actions → New repository secret**, имя `GOOGLE_SERVICES_JSON`, значение — всё содержимое файла. Затем перезапустите сборку **Actions → Mobile → Run workflow**. В журнале шага «Firebase для push» должно быть «приложение uz.b2borders.app найдено»;
   - сборка на своём компьютере: положите файл в `mobile/android/app/google-services.json` (в git он не попадает).
5. Ключ нужен **серверу** (он отправляет push): Firebase → ⚙ **Project settings → Service accounts → Generate new private key** → скачается JSON. Положите его рядом с сервером, например `secrets/firebase-sa.json`, и в `.env` укажите `FCM_SERVICE_ACCOUNT_FILE="secrets/firebase-sa.json"`. Перезапустите сервер. Этот файл секретный: никому не пересылайте и не кладите в репозиторий.

   Если в журнале сервера `native push ANDROID Error: FCM 403 IAM_PERMISSION_DENIED … cloudmessaging.messages.create`, значит у сервисного аккаунта из этого файла нет права отправлять push в проекте. Выдайте этому аккаунту (`client_email` из файла, обычно `firebase-adminsdk-…@<проект>.iam.gserviceaccount.com`) роль **Firebase Cloud Messaging API Admin** в Google Cloud Console → IAM проекта; действует через несколько минут, без перезапуска. Новый ключ того же аккаунта не поможет: права выдаются аккаунту, а не ключу. Проверьте также, что ключ из того же проекта, что и `google-services.json`, и что Firebase Cloud Messaging API включён. Проверить, какой аккаунт в файле: `python3 -c "import json;d=json.load(open('secrets/fcm.json'));print(d['project_id'],d['client_email'])"`.
   Ошибки `UNREGISTERED`/`SENDER_ID_MISMATCH` не тревожные: это устаревшие токены (приложение удалено или собрано с другим проектом Firebase), сервер удаляет их сам. Временные сбои Google (429, 5xx) пишутся как `native push … delayed` и в Telegram не приходят.
   Проще: положите оба файла из Firebase в «Загрузки» и выполните `npm run push:setup` — скрипт сам разложит их, впишет `.env`, создаст ключи VAPID и проверит ключ у Google (`scripts/push-setup.mjs`, пошагово для Windows — `docs/local-wifi.md`, раздел 13).
6. Установите новый APK. При первом входе приложение спросит разрешение на уведомления (Android 13+) — ответьте «Разрешить». Проверка: **Профиль → «Включить push на этом устройстве»** — должно ответить «Push включён на этом устройстве», а в строке «Устройств с push» стать 1.

Что видит пользователь: уведомление в шторке со значком коробки и звуком (канал «Заказы и уведомления» с высокой важностью); нажатие открывает нужную страницу. Если приложение открыто, push показывается всплывающим сообщением вверху экрана, а страница и счётчики обновляются сами.

Защита от неполной настройки: если на сервере нет ключа — приложение не спрашивает разрешение; если APK собран без `google-services.json` — приложение это определяет (плагин `PushStatus`) и не вызывает регистрацию, которая без Firebase роняет приложение.

### Счётчики разделов

Число на пункте нижней панели, меню слева, вкладках витрины, экране «Ещё» и в профиле магазина — непрочитанные уведомления этого раздела (раздел определяется по ссылке уведомления, `src/lib/nav-badges-core.ts`). Особые счётчики: корзина — число позиций; у поставщика «Заказы» — заказы, ждущие ответа, «Доставки» — свои доставки. Пункт «Ещё» (поставщик) и «Профиль» (магазин) суммируют разделы, которые не поместились в нижнюю панель. Открыл страницу, на которую ведёт уведомление, — оно прочитано и счётчик гаснет (`SeenTracker`).

## Требования магазинов

### Общее для обоих

| Требование | Как выполнено |
|---|---|
| Политика конфиденциальности по открытой ссылке и внутри приложения | `/privacy` (ru, uz), ссылки на входе, при регистрации и в профиле. Реквизиты владельца — `LEGAL_OPERATOR_NAME`, `LEGAL_CONTACT_EMAIL`, `LEGAL_CONTACT_PHONE` |
| Удаление аккаунта в приложении (Apple 5.1.1(v), Google Play «Account deletion») | Профиль → «Удалить аккаунт» → пароль + подтверждение. Открытая страница с порядком удаления для Google Play: `/account-deletion` |
| Демо-доступ для проверяющих | Нужно создать учётки магазина, поставщика (с «Сам развожу заказы») и доставщика у тестового поставщика и указать их в App Review Information / App access (вход только по паролю, без SMS) |
| Нет оплаты цифровых товаров | Платформа не проводит платежи — встроенные покупки Apple/Google не требуются |
| Шифрование | Только HTTPS → `ITSAppUsesNonExemptEncryption = false`, экспортная документация не нужна |

**Что удаляется:** имя, телефон (освобождается для новой регистрации), e-mail, пароль, все сессии, токены push, подписки web push, уведомления, история попыток входа, членство в магазинах и у поставщиков, закрепление доставщика за территорией. **Что остаётся** (учётные документы организаций, допускается Apple и Google как «legal/legitimate business reasons»): заказы, оплаты, долги, чеки, накладные, журнал аудита — с пометкой «Удалённый пользователь». Если удаляется последний владелец/администратор поставщика, поставщик скрывается от магазинов и не принимает заказы, супер-админу приходит уведомление. Супер-админ из приложения не удаляется.

### Apple App Store

| Пункт | Статус |
|---|---|
| 4.2 Minimum Functionality | Нативные push, печать, «Поделиться», офлайн-режим, экран нет связи, вибрация — см. таблицу выше. Риск отказа остаётся (B2B-приложения на WebView иногда возвращают); в заметках для проверяющего описать нативные функции и офлайн доставщика |
| 2.1 App Completeness | Демо-аккаунты, сервер должен работать во время проверки |
| 5.1.1 Data Collection | Тексты разрешений (камера, микрофон для видео брака, фото, геолокация при использовании) в `Info.plist` на русском и узбекском; разрешения запрашиваются только в момент использования |
| Privacy Manifest | `mobile/ios/App/App/PrivacyInfo.xcprivacy`: tracking нет, собираемые данные (имя, телефон, адрес, точная геолокация, фото/видео, история покупок, финансовая информация, ID устройства) — только для работы приложения |
| App Privacy в App Store Connect | Заполнить теми же типами данных: Contact Info (Name, Phone, Physical Address), Location (Precise), User Content (Photos or Videos), Purchases, Financial Info (Other), Identifiers (Device ID). Все — «Linked to user», «Not used for tracking», цель — App Functionality |
| Минимальная iOS | 15.0 (требование Capacitor 8), iPhone и iPad |
| Сборка | Xcode 16+ / iOS 18 SDK — требование App Store с апреля 2025 |
| Sign in with Apple | Не нужен: нет входа через сторонние сервисы |

### Google Play

| Пункт | Статус |
|---|---|
| Target API | `targetSdkVersion 36` (Android 16), `minSdk 26` (Android 8.0, нужен сканеру QR) — соответствует требованию Play на 2026 г. (36 с 31.08.2026) |
| Формат | Android App Bundle (`bundleRelease`), Play App Signing |
| Data safety | Те же типы данных, что в App Privacy: Personal info (Name, Phone, Address), Location (Approximate, Precise), Photos and videos, Financial info (Purchase history, Other), Device IDs. Данные шифруются при передаче — да; пользователь может запросить удаление — да, ссылка `https://<домен>/account-deletion` |
| Разрешения | INTERNET, CAMERA, ACCESS_COARSE/FINE_LOCATION (только при использовании), POST_NOTIFICATIONS (Android 13+), VIBRATE (вибрация при считывании QR). Фоновой геолокации нет |
| 16 КБ страницы памяти (обязательно для Android 15+) | В приложении нет собственных нативных .so-библиотек — требование выполняется |
| Тестирование для новых личных аккаунтов разработчика | Для личного (не организации) аккаунта Play Console требует закрытое тестирование с 12+ тестировщиками 14 дней до публикации. Аккаунт организации (нужен D-U-N-S) этого не требует. Порядок публикации — [docs/google-play.md](google-play.md) |

## Безопасность (OWASP MASVS 2, уровень L1)

| Группа | Что проверено и сделано |
|---|---|
| STORAGE | Сессия — httpOnly cookie (на сервере хранится только SHA-256 токена); в коде приложения токенов нет. Android: `allowBackup=false` + `dataExtractionRules` исключают всё из облачной копии и переноса. iOS: каталоги WebKit/Cookies/Caches помечены `isExcludedFromBackup`. Очередь офлайн-приёмок — в песочнице приложения, своя у каждого доставщика; сохранённые страницы доставщика удаляются при выходе |
| CRYPTO | Своей криптографии на телефоне нет. Сервер подписывает JWT для FCM (RS256) и APNs (ES256) стандартным `node:crypto`; ключи только в переменных окружения сервера |
| AUTH | Вход по паролю (bcrypt, лимит попыток), сессия 30 дней. Удаление аккаунта требует пароль. Токен push привязан к сессии и удаляется при выходе |
| NETWORK | Только HTTPS: Android `network_security_config` (cleartext запрещён, только системные CA; в debug-сборке — HTTP и пользовательские CA для разработки), iOS ATS без исключений. Pinning сертификата не включён сознательно: при смене сертификата (Let's Encrypt каждые 90 дней) приложение перестало бы работать до обновления |
| PLATFORM | Встроенный браузер открывает только свой домен (`allowNavigation`, на iOS ещё `limitsNavigationsToAppBoundDomains`); остальные ссылки — во внешних приложениях. Мост Capacitor доступен только страницам своего домена. FileProvider отдаёт наружу только временные файлы из кэша (было — весь внешний накопитель). Экспортирована только главная Activity. Переход по нажатию на push — только на путь своего сайта (`safePath`, тесты) |
| CODE | Release: `debuggable false`, отладка WebView выключена (включается только при http-адресе разработки). Зависимости — официальные плагины Capacitor, `npm audit` — 0 уязвимостей |
| RESILIENCE | Защита от реверса/root не требуется для L1 и не включена |
| PRIVACY | Политика, удаление аккаунта, манифест приватности, запрос разрешений по месту, нет рекламы и трекинга |

Рекомендации для запуска: серверу — HSTS в nginx (`add_header Strict-Transport-Security "max-age=31536000" always;`), сертификат с автообновлением. По закону РУз «О персональных данных» (ст. 27¹) базы с персональными данными граждан Узбекистана должны храниться на серверах в Узбекистане — учтите при выборе хостинга.

## Проверка

- `npx vitest run` — в том числе `tests/mobile.test.ts` (подписи JWT FCM/APNs, разбор ответов, безопасный переход из push, имена файлов) и `tests/account-deletion.int.test.ts`.
- `node tests/e2e/mobile-compliance.mjs` на работающем сервере — политика без входа на двух языках, ссылки на входе и регистрации, удаление аккаунта на экране телефона, повторная регистрация с тем же номером.
- На устройствах (вручную, после выкладки сервера): вход, QR-приёмка камерой, фото брака, печать чека, выгрузка Excel → «Поделиться», push при новом заказе и переход по нему, режим полёта у доставщика → приёмка → связь вернулась → отправилась, «Нет связи» при запуске без сети, удаление аккаунта.
