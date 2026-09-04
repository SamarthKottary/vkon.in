# VKON Project — Local Setup Instructions for Senior

Welcome! This package contains the full **VKON Automation** project, including source code, image assets, and the complete database dump with all live products and specifications.

---

## ⚡ Quick 1-Step Setup

If PostgreSQL is running on your machine:

1. **Configure Database Connection**:
   Ensure `.env.local` exists (copied from `.env.example`) and set your local PostgreSQL connection string:
   ```env
   DATABASE_URL=postgresql://postgres:yourpassword@127.0.0.1:5432/vkon
   ADMIN_PASSWORD=dev-password
   AUTH_SECRET=dev-secret-at-least-16-chars
   ```

2. **Run Automated Setup**:
   ```bash
   npm run setup:local
   ```
   *This automatically installs dependencies, creates data/uploads, and restores all 12 products, subscribers, and schema from `database-dump.sql` into PostgreSQL.*

3. **Start Development Server**:
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🗄️ Database Management Commands

| Command | Purpose |
|---|---|
| `npm run setup:local` | Complete 1-click local setup (Install + Restore DB + Setup directories) |
| `npm run db:restore` | Import/Restore `database-dump.sql` into PostgreSQL |
| `npm run db:export` | Export local database state back to `database-dump.sql` |
| `npm run db:setup` | Apply schema only (`src/lib/db/schema.sql`) |

---

## 🔐 Admin Panel Access

- **URL**: `http://localhost:3000/admin`
- **Password**: Defined in `.env.local` (`ADMIN_PASSWORD=...`)

---

## 📁 Package Contents Included

- **`database-dump.sql`**: Complete database dump (12 products, categories, specs, prices, subscribers).
- **`data/uploads/`**: Uploaded product images.
- **`public/`**: Product photography, segment graphics, brochure, and logos.
- **`src/`**: Full Next.js source code (App Router, Tailwind v4, Postgres `pg`).
- **`scripts/`**: Automated DB export, restore, and setup utilities.
