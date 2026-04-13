# Замовити 3D-друк (Next.js)

Повноцінна сторінка з двома режимами: завантаження **STL/OBJ/3MF** з розрахунком на сервері та форма **без моделі** з відправкою email (або мок у консоль).

## Вимоги

- Node.js **18.18+** або **20+** (рекомендовано LTS)

## Запуск

```bash
cd order-3d-print
npm install
npm run dev
```

Відкрийте [http://localhost:3000](http://localhost:3000).

## Збірка для продакшену

```bash
npm run build
npm start
```

## Змінні середовища (опційно)

Скопіюйте `.env.example` у `.env` і заповніть SMTP, щоб форма «Немає моделі» надсилала листи. Якщо SMTP не задано, дані запиту виводяться в **консоль сервера** (`npm run dev`).

## API

| Маршрут | Опис |
|--------|------|
| `POST /api/analyze-model` | `multipart/form-data`: `file` (STL/OBJ), `material`, `strength`, `quality` → об'єм, вага, час, ціна |
| `POST /api/request` | Форма: `name`, `phone`, `email`, `description`, `link`, опційно `attachment` |

## Стек

- Next.js 14 (App Router), React18, TypeScript
- Tailwind CSS
- three.js + React Three Fiber + drei (перегляд STL/OBJ у браузері)
- nodemailer (опційно)

## Примітки

- Розмір файлу: до **50 МБ**.
- Серверний розрахунок об'єму: **STL** та **OBJ**. **3MF** можна завантажити в UI, але для автоціни сконвертуйте в STL/OBJ або скористайтесь другою вкладкою.
- Одиниця моделі в Three трактується як **мм**; об'єм переводиться в **см³** для формул з ТЗ.
