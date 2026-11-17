# Тармақ — внутренняя сеть колледжа

Фронтенд: Next.js 14 (App Router) + TypeScript + Tailwind + Lucide, PWA.
Бэкенд: Google Таблица (база) + Google Диск (фото) + Google Apps Script (API). Бесплатно.

```
tarmak/
├── gas/
│   ├── Code.gs              ← весь бэкенд (вставить в Apps Script)
│   ├── appsscript.json      ← манифест проекта Apps Script (часовой пояс, доступы, web app)
│   └── mock-server.mjs      ← локальная имитация Apps Script для разработки без Google
├── web/                     ← Next.js приложение
│   ├── app/
│   │   ├── layout.tsx       ← мета-теги PWA/iOS, viewport-fit=cover, theme-color
│   │   ├── page.tsx
│   │   └── globals.css      ← токены светлой/тёмной темы, стиль Threads, safe-area
│   ├── components/
│   │   ├── AppShell.tsx     ← экраны, тост, полоска синхронизации
│   │   ├── Feed.tsx         ← лента + вкладки + ҚАЗ|РУС
│   │   ├── PostCard.tsx     ← пост, ветка (линия-коннектор), репост, комментарий
│   │   ├── PostParts.tsx    ← опрос, бейджи заявки/SLA, офиц. ответ, цитата, панель действий
│   │   ├── PostDetail.tsx   ← ветка комментариев + поле ответа
│   │   ├── Composer.tsx     ← новый пост / ветка / заявка, фото, опрос, анонимно
│   │   ├── TicketAdmin.tsx  ← статус, дедлайн, «Әкімшілік жауабы»
│   │   ├── AdminPanel.tsx   ← KPI, T = Σtᵢ / n, категории, статусы
│   │   ├── Search.tsx  Notifications.tsx  Profile.tsx  Sheets.tsx
│   │   ├── BottomNav.tsx  Onboarding.tsx  SubBar.tsx  SWRegister.tsx  ui.tsx
│   ├── lib/
│   │   ├── api.ts           ← fetch к Apps Script (POST с text/plain → без CORS preflight)
│   │   ├── store.tsx        ← состояние + Optimistic UI + опрос сервера каждые 20 с
│   │   ├── stats.ts         ← расчёт KPI на клиенте (та же формула, что в Code.gs)
│   │   ├── i18n.ts  types.ts  constants.ts  utils.ts (сжатие фото через Canvas)
│   ├── public/
│   │   ├── manifest.json  sw.js  icons/ (192, 512, maskable, apple-touch-icon)
│   ├── .env.example
│   └── package.json …
└── prototype.html           ← первый однофайловый прототип
```

---

## 1. Бэкенд: Google Таблица + Apps Script

1. Откройте drive.google.com → «Создать» → «Google Таблицы». Назовите таблицу, например «Тармақ DB».
   Папка `College_Threads_Media` для фото появится рядом с таблицей, поэтому удобнее сразу положить таблицу в отдельную папку.
2. В таблице: **Расширения → Apps Script**.
3. Удалите содержимое `Код.gs` / `Code.gs` и вставьте весь файл `gas/Code.gs`. Нажмите 💾.
4. (Желательно) **Настройки проекта ⚙️** → включите «Показывать файл манифеста appsscript.json» → откройте `appsscript.json` в редакторе и замените его содержимое на `gas/appsscript.json`. Там часовой пояс `Asia/Almaty` и нужные доступы.
5. В списке функций сверху выберите `setup` → **Выполнить**. Google попросит доступ к Таблицам и Диску:
   «Проверить разрешения» → ваш аккаунт → «Дополнительно» → «Перейти к проекту (небезопасно)» → «Разрешить».
   Это ваш собственный скрипт, предупреждение стандартное.
   После выполнения в таблице появятся листы `Posts`, `Comments`, `Polls`, `Users`, `Notifications` с демо-данными, а на Диске — папка `College_Threads_Media`.
6. **Развертывание → Новое развертывание** → тип ⚙️ «Веб-приложение»:
   - Описание: `v1`
   - Запуск от имени: **Я** (скрипт пишет в вашу таблицу и на ваш Диск)
   - У кого есть доступ: **Все** (иначе браузер студента получит страницу входа Google вместо JSON)
   → «Развернуть» → скопируйте **URL веб-приложения** (оканчивается на `/exec`).
7. Проверьте в браузере: `https://script.google.com/macros/s/…/exec?action=ping` → `{"ok":true,…}`.

**Обновление кода.** Если вы поменяли `Code.gs`, откройте «Развертывание → Управление развертываниями» → ✏️ → Версия: «Новая версия» → «Развернуть». URL при этом не меняется. Если вместо этого создать новое развертывание, получится новый URL.

**Продакшен.** В начале `Code.gs` поставьте `DEMO_MODE: false`: демо-токены перестанут работать. Чтобы назначить администратора или преподавателя, в листе `Users` измените колонку `role` на `admin` или `teacher`.

### Как устроен API
| Запрос | Что делает |
|---|---|
| `GET ?action=bootstrap&token=…` | лента, комментарии, опросы (только счётчики), пользователи, мои уведомления, статистика. У анонимных постов `authorId = null` для всех, кроме самого автора |
| `GET ?action=stats` | KPI: total, solvedPct, avgHours (T), overdue, byCat, byStatus |
| `POST {action:'upload', token, data:'data:image/jpeg;base64,…'}` | файл → `College_Threads_Media`, доступ «по ссылке — просмотр», ответ `https://drive.google.com/thumbnail?id=…&sz=w1000` |
| `POST {action:'createPost', …segments:[…]}` | пост / ветка / заявка, сквозной номер `#0001…`, опросы, цитата |
| `like`, `repost`, `vote`, `confirm`, `comment`, `follow`, `markRead`, `deletePost`, `deleteComment` | взаимодействия |
| `setStatus`, `setDeadline`, `setOfficial` | только роль `admin` |
| `register` | имя + группа → токен (хранится в localStorage) |

Все изменяющие запросы выполняются под `LockService.getScriptLock()`. Одновременные лайки и посты встают в очередь, а не перезаписывают строки друг друга. Строки пишутся точечно, по отдельным ячейкам. Текст сохраняется с апострофом, поэтому Таблица не превращает «1/3» в дату и `=…` в формулу. Антиспам: не больше 16 постов и комментариев за 10 минут на автора, включая анонимные.

---

## 2. Фронтенд локально

```bash
cd web && npm install
```

```bash
cp .env.example .env.local
```

Вставьте в `.env.local` свой URL `/exec` и запустите:

```bash
npm run dev
```

Откройте http://localhost:3000. Чтобы работать без Google, запустите имитацию Apps Script (код тот же `Code.gs`, данные хранятся в `gas/.mock-db.json`) и укажите `NEXT_PUBLIC_GAS_API_URL=http://localhost:8787/exec`:

```bash
npm run mock
```

---

## 3. Бесплатный деплой на Vercel

```bash
git init && git add . && git commit -m "Tarmak"
```

```bash
gh repo create tarmak --private --source=. --push
```

1. vercel.com → **Add New → Project** → выберите репозиторий → **Root Directory: `web`**.
2. **Environment Variables**: `NEXT_PUBLIC_GAS_API_URL` = ваш `/exec`, `NEXT_PUBLIC_DEMO` = `1` (для защиты) или `0`.
3. **Deploy** → `https://<имя>.vercel.app`. Каждый `git push` пересобирает сайт сам.

## 4. Установка на телефон (PWA, без App Store)
- **iPhone:** Safari → откройте сайт → «Поделиться» ⬆️ → «На экран „Домой“».
- **Android:** Chrome → меню ⋮ → «Установить приложение» (или баннер внизу).

Приложение открывается без адресной строки, на весь экран, с отступами под «чёлку» и полоску «Домой» (`viewport-fit=cover` + `env(safe-area-inset-*)`).

## Ограничения бесплатного Apps Script
- Около 30 одновременных запросов на скрипт. Под общим замком запросы выполняются по очереди, примерно 0.3–1 с каждый. На колледж это нормально, интерфейс не ждёт благодаря Optimistic UI.
- Realtime нет: приложение опрашивает сервер каждые 20 с, а также при возврате на вкладку.
- Если колледж использует Google Workspace, администратор домена может запретить доступ «Все» для веб-приложений и доступ «по ссылке» для файлов. Тогда разверните скрипт с личного аккаунта Gmail.
