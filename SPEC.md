# LightTeX — Техническое задание

> Легковесный самохостимый веб-редактор LaTeX.
> Цель: **~50-100MB RAM**, минимальная зависимость от тяжёлых компонентов.

---

## 1. Общее описание

Веб-приложение для написания и компиляции LaTeX-документов.
Минималистичный аналог Overleaf/ShareLaTeX для одного пользователя или небольшой команды.

### Ключевые отличия от Overleaf
- RAM: ~50-100MB vs 1.2GB
- Без реал-тайм совместного редактирования (опционально в v2)
- Минималистичный UI, фокус на скорости
- PostgreSQL для надёжного хранения

---

## 2. Стек технологий

| Слой | Технология | Обоснование |
|------|-----------|-------------|
| **Backend** | Node.js + Express | Быстрый, знакомый, легковесный |
| **База данных** | PostgreSQL 16 | Надёжность, ACID, масштабируемость |
| **ORM** | Drizzle ORM | Легковесный, типобезопасный, без магии |
| **Миграции** | Drizzle Kit | Встроенный, простой |
| **Аутентификация** | JWT + bcrypt | Без лишних зависимостей (no Passport) |
| **Редактор** | Monaco Editor (vs code engine) | Лучшая подсветка LaTeX, автодополнение |
| **PDF превью** | PDF.js | Рендер PDF прямо в браузере |
| **Компилятор** | TeX Live (pdflatex / xelatex / lualatex) | Стандартная LaTeX-цепочка |
| **Хранение файлов** | Файловая система (projects/<id>/) | Простота, не грузим DB бинарниками |
| **Frontend** | Vanilla JS + Monaco | Без React/Vue — меньше бандл, быстрее |
| **Контейнер** | Docker + docker-compose | Деплой одной командой |

---

## 3. Архитектура

```
┌─────────────────────────────────────────────┐
│                 Browser                       │
│  ┌───────────────┐   ┌────────────────────┐  │
│  │ Monaco Editor  │   │ PDF.js Preview    │  │
│  │ (split view)   │   │                   │  │
│  └───────┬───────┘   └───────▲────────────┘  │
│          │  REST + SSE          │             │
└──────────▼─────────────────────┴──────────────┘
┌─────────────────────────────────────────────┐
│              Node.js Server                   │
│  ┌──────────────┐  ┌────────────────────┐   │
│  │ REST API      │  │ Compile Engine     │   │
│  │ - auth        │  │ - spawn pdflatex   │   │
│  │ - projects    │  │ - sandbox /tmp     │   │
│  │ - files CRUD  │  │ - log parsing      │   │
│  └──────┬───────┘  └────────────────────┘   │
│         │                                     │
│  ┌──────▼───────┐                            │
│  │ PostgreSQL   │                            │
│  └──────────────┘                            │
└─────────────────────────────────────────────┘
```

---

## 4. Схема базы данных (PostgreSQL)

```sql
-- Пользователи
CREATE TABLE users (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email       VARCHAR(255) UNIQUE NOT NULL,
    password    VARCHAR(255) NOT NULL,          -- bcrypt hash
    name        VARCHAR(100),
    created_at  TIMESTAMPTZ DEFAULT now(),
    last_login  TIMESTAMPTZ
);

-- Проекты
CREATE TABLE projects (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    description     TEXT,
    compiler        VARCHAR(20) DEFAULT 'pdflatex',  -- pdflatex|xelatex|lualatex
    main_file       VARCHAR(255) DEFAULT 'main.tex', -- точка входа компиляции
    created_at      TIMESTAMPTZ DEFAULT now(),
    updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX idx_projects_user ON projects(user_id);

-- Файлы проекта (метаданные, контент на диске)
CREATE TABLE files (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    path        VARCHAR(500) NOT NULL,         -- относительный путь: "chapters/intro.tex"
    created_at  TIMESTAMPTZ DEFAULT now(),
    updated_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, path)
);
CREATE INDEX idx_files_project ON files(project_id);

-- Сессии (JWT refresh tokens)
CREATE TABLE sessions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## 5. API endpoints

### Аутентификация
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/auth/register` | Регистрация (email, password, name) |
| POST | `/api/auth/login` | Логин → JWT access + refresh |
| POST | `/api/auth/refresh` | Обновить access token |
| POST | `/api/auth/logout` | Удалить refresh token |

### Проекты
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/projects` | Список проектов пользователя |
| POST | `/api/projects` | Создать проект (name, compiler, template?) |
| GET | `/api/projects/:id` | Данные проекта + список файлов |
| PUT | `/api/projects/:id` | Обновить (name, description, compiler, main_file) |
| DELETE | `/api/projects/:id` | Удалить проект и все файлы |

### Файлы
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/projects/:id/files` | Список файлов (tree view) |
| POST | `/api/projects/:id/files` | Создать файл (path, content) |
| GET | `/api/projects/:id/files/*path` | Содержимое файла |
| PUT | `/api/projects/:id/files/*path` | Обновить содержимое |
| DELETE | `/api/projects/:id/files/*path` | Удалить файл |
| POST | `/api/projects/:id/upload` | Загрузить .zip → распаковать |

### Компиляция
| Метод | Endpoint | Описание |
|-------|----------|----------|
| POST | `/api/projects/:id/compile` | Скомпилировать проект → PDF |
| GET | `/api/projects/:id/compile/status` | SSE — статус компиляции |
| GET | `/api/projects/:id/output.pdf` | Скачать последний PDF |
| GET | `/api/projects/:id/download` | Скачать весь проект как .zip |

### Шаблоны
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/templates` | Список доступных шаблонов |
| GET | `/api/templates/:name` | Получить шаблон (файлы) |

---

## 6. Процесс компиляции

```
1. POST /api/projects/:id/compile
2. Server:
   a. Собрать все файлы проекта из FS
   b. Создать sandbox директорию (/tmp/lightlatex-<uuid>/)
   c. Записать файлы
   d. spawn: pdflatex -interaction=nonstopmode -halt-on-error main.tex
   e. Парсить лог на ошибки → вернуть line:col:message
   f. PDF → сохранить в projects/<id>/output.pdf
   g. Удалить sandbox
   h. SSE уведомление клиенту
3. Client:
   a. Получить PDF или список ошибок
   b. PDF → обновить PDF.js
   c. Ошибки → подсветить в Monaco (red squiggles)
```

### Безопасность компиляции
- Timeout: 30 секунд на компиляцию
- Max output size: 50MB
- sandbox в /tmp с ограничениями
- Нет доступа к файлам вне проекта

---

## 7. Frontend

### Layout (split view)
```
┌────────────────────────────────────────────┐
│  LightTeX  │  main.tex  │  [Compile ▶]   │
├────────────┼─────────────┴────────────────┤
│ 📁 tree    │  Monaco Editor               │
│  main.tex  │                               │
│  preamble  │  \documentclass{article}      │
│  chapters/ │  \begin{document}             │
│    intro   │  Hello world                  │
│    conc    │  \end{document}               │
│            │                               │
│            ├───────────────────────────────┤
│            │  PDF Preview (PDF.js)          │
│            │                               │
└────────────┴───────────────────────────────┘
```

### Страницы
1. **Login / Register** — минималистичные формы
2. **Dashboard** — список проектов, кнопка "New project"
3. **Editor** — split view (tree + editor + preview)
4. **Settings** — тема, компилятор по умолчанию

### Интерактивность
- Autosave: debounce 2 секунды после последнего ввода
- Compile: Ctrl+S или кнопка (также Ctrl+Shift+S для принудительной)
- Toggle preview: fullscreen editor / fullscreen PDF / split
- Keyboard shortcuts: стандартные VS Code

---

## 8. Структура проекта

```
lightlatex/
├── Dockerfile
├── docker-compose.yml          # Node.js app + PostgreSQL
├── .env.example
├── package.json
├── drizzle.config.ts
├── src/
│   ├── index.ts                # Entry point
│   ├── db/
│   │   ├── index.ts            # PostgreSQL connection (pg / drizzle)
│   │   ├── schema.ts          # Drizzle schema
│   │   └── migrations/         # Drizzle Kit миграции
│   ├── auth/
│   │   ├── service.ts         # login, register, verify, refresh
│   │   └── middleware.ts       # JWT validation middleware
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── projects.ts
│   │   ├── files.ts
│   │   ├── compile.ts
│   │   └── templates.ts
│   ├── compiler/
│   │   └── engine.ts           # pdflatex/xelatex wrapper
│   ├── storage/
│   │   └── fs.ts               # Проекты на диске (CRUD files)
│   └── templates/              # Встроенные шаблоны .zip
│       ├── article/
│       ├── book/
│       └── beamer/
├── public/
│   ├── index.html              # SPA entry
│   ├── css/
│   │   └── style.css
│   └── js/
│       ├── app.js              # Router (hash-based)
│       ├── api.js              # Fetch wrapper + auth
│       ├── editor.js            # Monaco init + autosave
│       ├── preview.js           # PDF.js viewer
│       ├── tree.js              # File tree component
│       └── auth.js              # Login/Register forms
└── data/                        # Docker volume mount
    └── projects/                # Хранение файлов проектов
```

---

## 9. Docker Compose

```yaml
version: "3.8"

services:
  lightlatex:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://lightlatex:lighttex@postgres:5432/lightlatex
      - JWT_SECRET=change-me-in-production
      - NODE_ENV=production
    volumes:
      - ./data/projects:/app/data/projects
    depends_on:
      postgres:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=lightlatex
      - POSTGRES_PASSWORD=lighttex
      - POSTGRES_DB=lightlatex
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U lightlatex"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped

volumes:
  postgres_data:
```

### Dockerfile
```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx drizzle-kit generate

FROM node:20-alpine
RUN apk add --no-cache texlive-latex-base texlive-latex-extra texlive-fonts-recommended
WORKDIR /app
COPY --from=builder /app ./
RUN npx drizzle-kit migrate
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

### RAM Breakdown
| Компонент | RAM |
|-----------|-----|
| Node.js (app) | ~30-50MB |
| PostgreSQL 16 Alpine | ~30-50MB |
| TeX Live binary | 0 (только при компиляции) |
| Monaco / PDF.js | 0 (браузер клиента) |
| **Итого** | **~60-100MB** |

---

## 10. Roadmap

### v0.1 — MVP (3-4 дня)
- [ ] Скелет проекта (Express + TypeScript)
- [ ] PostgreSQL + Drizzle ORM + миграции
- [ ] Регистрация / логин (JWT)
- [ ] CRUD проектов
- [ ] CRUD файлов (на диске)
- [ ] Monaco Editor в браузере
- [ ] Компиляция pdflatex → PDF
- [ ] PDF.js превью
- [ ] Docker Compose (app + postgres)
- [ ] Базовый UI (login, dashboard, editor)

### v0.2 — Удобство (1-2 дня)
- [ ] Autosave
- [ ] Файловое дерево в sidebar
- [ ] Шаблоны (article, book, beamer)
- [ ] Скачать/загрузить .zip
- [ ] Парсинг ошибок компиляции → подсветка в Monaco
- [ ] Тёмная/светлая тема
- [ ] Выбор компилятора (pdflatex / xelatex / lualatex)

### v0.3 — Полировка (1 день)
- [ ] Файловый менеджер (drag & drop загрузка)
- [ ] Библиография (.bib) поддержка
- [ ] Встроенные сниппеты LaTeX
- [ ] Уведомления компиляции (SSE)
- [ ] PDF пагинация и навигация (sync scroll)

### v0.4 — CLI Node + Sync (2-3 дня)
- [ ] `lightlatex` npm-пакет (CLI + API client)
- [ ] `npx lightlatex init` — создать/подключить проект к веб-версии
- [ ] `npx lightlatex pull` — скачать файлы проекта из веба в локальную папку
- [ ] `npx lightlatex push` — загрузить локальную папку в веб
- [ ] `npx lightlatex watch` — автосинхронизация (watch FS → push, API poll → pull)
- [ ] `npx lightlatex login` — получить и сохранить токен
- [ ] `npx lightlatex compile` — локальная компиляция через системный texlive
- [ ] Конфликт-резолюция: last-write-wins + .lightlatex/ хуки

### v0.5 — Collab (опционально, 3-5 дней)
- [ ] Yjs + y-monaco для real-time editing
- [ ] WebSocket транспорт
- [ ] Онлайн-индикаторы пользователей
- [ ] Share by link (read-only)

---

## 11. CLI пакет и синхронизация

### Концепция
LightTeX — это npm-пакет. Устанавливаешь, работаешь с .tex файлами в своём редакторе (VS Code, Neovim, любой), а веб-версия — это визуальный превью + совместный доступ.

```bash
# Установка
global:   npm install -g lightlatex
один раз:  npx lightlatex

# Подключение к веб-серверу
lightlatex login https://lightlatex.example.com
# → email, password → JWT сохраняется в ~/.lightlatex/auth.json

# Новый проект
mkdir my-paper && cd my-paper
lightlatex init
# → .lightlatex/config.json (project_id, server_url)
# → создаёт проект на сервере, pull пустой структуры

# Синхронизация
lightlatex pull          # сервер → локальная папка
lightlatex push          # локальная папка → сервер
lightlatex sync          # двусторонняя (pull + push)
lightlatex watch         # watch-режим (автосинхронизация)

# Локальная компиляция
lightlatex compile       # pdflatex main.tex → main.pdf

# Статус
lightlatex status       # показать diff: локальные vs серверные изменения
```

### .lightlatex/config.json
```json
{
  "project_id": "uuid-от-сервера",
  "server_url": "https://lightlatex.example.com",
  "main_file": "main.tex",
  "compiler": "pdflatex",
  "ignore": ["*.aux", "*.log", "*.out", "*.synctex.gz", ".git"]
}
```

### ~/.lightlatex/auth.json
```json
{
  "server_url": "https://lightlatex.example.com",
  "token": "eyJ..."
}
```

### API endpoints для CLI
| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/projects/:id/files` | Список файлов + хеши (mtime/content hash) |
| GET | `/api/projects/:id/bundle` | Скачать весь проект как .tar.gz |
| POST | `/api/projects/:id/bundle` | Загрузить .tar.gz (merge/overwrite) |
| POST | `/api/projects/:id/sync` | Двусторонний sync (отправить diff + получить diff) |

### Sync protocol
```
1. CLI считает SHA256 всех локальных файлов
2. GET /api/projects/:id/files → получает список файлов + SHA256 с сервера
3. Diff:
   - Клиент имеет, сервер нет → upload (new files)
   - Сервер имеет, клиент нет → download (new files)
   - Оба имеют, хеши разные → conflict
4. Конфликт:
   - Если mtime локального > mtime серверного → local wins, push
   - Иначе → server wins, pull
   - Или .lightlatex/conflicts/ с обеими версиями (автоматически)
5. Push/Pull по diff → быстрая синхронизация без полного .tar.gz
```

### Архитектура CLI

```
lightlatex/
├── src/
│   ├── cli/                    # CLI-часть (executable)
│   │   ├── index.ts            # Entry point (bin/lightlatex)
│   │   ├── commands/
│   │   │   ├── login.ts
│   │   │   ├── init.ts
│   │   │   ├── pull.ts
│   │   │   ├── push.ts
│n │   │   │   ├── sync.ts
│   │   │   ├── watch.ts        # chokidar
│   │   │   ├── compile.ts
│   │   │   └── status.ts
│   │   ├── client.ts           # API client (fetch-based)
│   │   └── config.ts           # .lightlatex/config management
│   ├── server/                 # Web-часть (Express)
│   │   ├── index.ts
│   │   ├── routes/
│   │   │   ├── sync.ts         # Sync API endpoints
│   │   │   └── ...
│   │   └── ...
│   └── shared/
│       ├── hash.ts             # SHA256 content hashing
│       └── diff.ts             # Diff calculation
├── package.json
│   ├── "bin": { "lightlatex": "dist/cli/index.js" }
│   └── ...
└── tsconfig.json
```

### Зачем это круто
- Пишешь в VS Code / Neovim / Emacs — своём любимом редакторе
- PDF-превью в браузере в реальном времени
- Maria видит тот же проект в браузере
- Git-подобный UX: init, push, pull, status, watch
- Работает офлайн — компилируешь локально, пушниш когда есть сеть
- Нет зависимости от тяжёлого веб-редактора — Monaco только для тех кто хочет

---

## 12. Нефункциональные требования

- **Производительность:** Компиляция < 5 сек для 10-страничного документа
- **Безопасность:** JWT с httpOnly cookies, CSRF protection, sandboxed compilation
- **Резервное копирование:** pg_dump для БД, tar для /data/projects
- **Логирование:** structured JSON logs
- **Конфигурация:** всё через .env

---

## 13. Что НЕ делаем

- ❌ Real-time collaborative editing (по умолчанию)
- ❌ Git интеграция
- ❌ Dropbox/Google Drive синхронизация
- ❌ Track changes
- ❌ Chat в проекте
- ❌ Мобильная адаптация (desktop-first)
