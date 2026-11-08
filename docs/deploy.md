# Запуск на сервере

Платформа ставится на один сервер Ubuntu 22.04 / 24.04 одной командой: Node.js 22, PostgreSQL, nginx,
HTTPS от Let's Encrypt, служба systemd, ежедневные резервные копии и firewall. Скрипты лежат в `deploy/`.

| Что | Где на сервере |
|---|---|
| Код | `/opt/b2b-orders` (пользователь `b2b`) |
| Настройки, пароль базы, ключи | `/opt/b2b-orders/.env` (права 600, в git не попадает) |
| Фото и логотипы | `/var/lib/b2b-orders/uploads` |
| Резервные копии | `/var/backups/b2b-orders` (14 дней) |
| Служба | `b2b-orders` (порт 3000 только внутри сервера, снаружи — nginx на 80/443) |

Серверу нужно минимум 2 ГБ памяти (на сервере меньше 3,5 ГБ скрипт сам добавит файл подкачки на 2 ГБ для сборки) и 10 ГБ диска.

## 1. Подключиться к серверу с Windows

Откройте **PowerShell** (Пуск → PowerShell) и введите, подставив IP своего сервера:

```powershell
ssh root@152.228.112.228
```

При первом входе спросит `Are you sure you want to continue connecting?` — напишите `yes`. Затем пароль от сервера
(его прислал провайдер; при вводе символы не видны — это нормально). Строка `root@…:~#` значит, что вы на сервере.

Вход по ключу вместо пароля (по желанию, безопаснее). На ноутбуке в PowerShell:

```powershell
ssh-keygen -t ed25519            # Enter на все вопросы (пароль ключа — пустой)
$k = Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub; ssh root@152.228.112.228 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && echo '$k' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_ADDED"
```

Ключ передаётся внутри команды, а не через `type … | ssh`: в PowerShell конвейер закрывает запрос пароля, и ssh выходит молча.

После этого `ssh root@152.228.112.228` пускает без пароля.

## 2. Установить платформу

На сервере (после `ssh`):

```bash
curl -4 -fsSLO https://raw.githubusercontent.com/J0ma2966/b2b-orders/main/deploy/install.sh
bash install.sh
```

Скрипт задаст несколько вопросов:

- **Домен.** Если своего домена пока нет — просто Enter: возьмётся бесплатный адрес вида
  `152-228-112-228.sslip.io`. Он всегда указывает на IP сервера, и для него выпускается настоящий сертификат HTTPS.
- **Почта для Let's Encrypt** — придут напоминания, если сертификат вдруг не продлится. Можно оставить пустой.
- **Телефон супер-админа** — номер, с которым вы будете входить в админку.
- **Владелец платформы, почта и телефон** — для страницы «Политика конфиденциальности» (её требуют Google Play и App Store).

Установка идёт 5–10 минут. В конце скрипт напишет адрес сайта и **временный пароль супер-админа** —
он показывается один раз, сохраните его. При первом входе платформа попросит придумать свой пароль.

Пароль базы, ключи push (VAPID) и `CRON_SECRET` скрипт создаёт сам и пишет в `/opt/b2b-orders/.env`.
Копировать их никуда не нужно.

Повторный запуск `bash install.sh` безопасен: существующие `.env`, база и пароли не трогаются.

## 3. Мобильные приложения на боевой сервер

APK собирает GitHub Actions, адрес сервера зашивается при сборке.

1. GitHub → репозиторий → **Settings → Secrets and variables → Actions → Variables → New repository variable**.
2. Name: `MOBILE_SERVER_URL`, Value: адрес из конца установки, например `https://152-228-112-228.sslip.io`.
3. **Actions → Mobile → Run workflow** (или любой новый коммит в `main`). Готовый APK — в артефактах сборки.

При смене адреса (например, переезд на свой домен) APK нужно собрать заново.

## 4. Обновление

Когда в `main` появились изменения:

```bash
sudo b2b-update
```

Скрипт делает резервную копию, забирает код, ставит зависимости, применяет миграции базы, собирает и перезапускает.
Пока идёт сборка (2–5 минут), часть страниц может отвечать с ошибкой — обновляйте в спокойное время.

## 5. Резервные копии

Каждую ночь в 03:30 (время сервера) сохраняются база (`db_ДАТА.dump`) и фото (`uploads_ДАТА.tar.gz`)
в `/var/backups/b2b-orders`, хранятся 14 дней. Сделать копию сейчас: `sudo b2b-backup`.

Копии лежат на том же сервере, поэтому раз в неделю скачивайте свежую к себе. На ноутбуке в PowerShell:

```powershell
mkdir D:\Backups\b2b -Force
scp "root@152.228.112.228:/var/backups/b2b-orders/*" D:\Backups\b2b\
```

Восстановление из копии (на сервере; база заменится целиком):

```bash
sudo systemctl stop b2b-orders
sudo -u postgres pg_restore --clean --if-exists -d b2b < /var/backups/b2b-orders/db_ДАТА.dump
sudo tar -xzf /var/backups/b2b-orders/uploads_ДАТА.tar.gz -C /var/lib/b2b-orders
sudo chown -R b2b:b2b /var/lib/b2b-orders/uploads
sudo systemctl start b2b-orders
```

## 6. Свой домен

1. Купите домен (например, на cctld.uz или ahost.uz) и в его DNS добавьте **A-запись**: имя `app` (или `@` для самого домена),
   значение — IP сервера.
2. Подождите, пока запись заработает (от минут до пары часов). Проверка на ноутбуке: `ping app.example.uz` показывает IP сервера.
3. На сервере: `sudo b2b-set-domain app.example.uz`
4. Поменяйте `MOBILE_SERVER_URL` в GitHub (раздел 3) и раздайте новый APK.

## 7. Push в Android-приложении (Firebase)

Push в браузере работают сразу. Для системных push в приложении нужен проект Firebase (docs/mobile.md):

1. Скопируйте ключ сервисного аккаунта на сервер (на ноутбуке):
   `scp C:\Users\ВЫ\Downloads\…-firebase-adminsdk-….json root@152.228.112.228:/opt/b2b-orders/secrets/fcm.json`
2. На сервере:
   ```bash
   sudo chown b2b:b2b /opt/b2b-orders/secrets/fcm.json && sudo chmod 600 /opt/b2b-orders/secrets/fcm.json
   sudo sed -i 's|^FCM_SERVICE_ACCOUNT_FILE=.*|FCM_SERVICE_ACCOUNT_FILE="/opt/b2b-orders/secrets/fcm.json"|' /opt/b2b-orders/.env
   sudo systemctl restart b2b-orders
   ```
3. В GitHub добавьте секрет `GOOGLE_SERVICES_JSON` (содержимое `google-services.json`) и пересоберите APK.

## 8. Полезные команды

| Задача | Команда |
|---|---|
| Работает ли сайт | `systemctl status b2b-orders` |
| Журнал приложения (выход — Ctrl+C) | `journalctl -u b2b-orders -f` |
| Перезапуск | `systemctl restart b2b-orders` |
| Изменить настройки | `nano /opt/b2b-orders/.env`, затем перезапуск |
| Журнал nginx | `tail -f /var/log/nginx/error.log` |
| Сертификат и дата продления | `certbot certificates` |
| Место на диске | `df -h /` |

**Сайт не открывается.** `systemctl status b2b-orders` и `journalctl -u b2b-orders -n 50` покажут ошибку.
Если служба работает, проверьте `nginx -t` и `ufw status` (должны быть открыты `OpenSSH` и `Nginx Full`).

**Установка зависла на первом же скачивании, `apt-get update` не проходит.** У сервера закрыт исходящий интернет.
Проверка: `curl -4 -sS -m 10 -o /dev/null -w "%{http_code}\n" https://archive.ubuntu.com` должна вывести код (200/301), а не ошибку.
Откройте исходящие соединения (80, 443, DNS 53) в firewall / security group в панели хостинга или попросите поддержку.

**Сертификат не выдался.** Обычно домен ещё не указывает на сервер, или провайдер закрыл порт 80
в своей панели (firewall/security group) — откройте 80 и 443 там. Повтор: `certbot --nginx -d ДОМЕН --redirect --hsts`.
