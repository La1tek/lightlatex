# LightTeX v0.1

Lightweight self-hosted LaTeX web editor. ~60-100MB RAM.

## Quick Start

```bash
docker-compose up -d
# Open http://localhost:3000
```

## Features

- Monaco Editor with LaTeX syntax highlighting
- PDF.js preview
- pdflatex / xelatex / lualatex compilation
- Autosave (2s debounce)
- File tree sidebar
- Compile error markers in Monaco
- Dark / Light theme
- Templates: article, book, beamer
- Download project as .zip
- JWT authentication

## Stack

- Node.js + Express + TypeScript
- PostgreSQL 16 + Drizzle ORM
- Monaco Editor (CDN)
- PDF.js (CDN)
- Vanilla JS frontend

## Development

```bash
npm install
npm run build
npm start
```

## Environment

See `.env.example` for configuration options.
