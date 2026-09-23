# SIST Administrative Management System

Admin platform for the School of Information Science and Technology.

- **Frontend:** React 18, Ant Design 5, Vite 5, Recharts (`frontend/`)
- **Backend:** Node.js 18.19, Express 4, Mongoose 8, JWT auth (`backend/`)
- **Database:** MongoDB

## Features

| Module | What it does |
| --- | --- |
| Login | JWT sign-in, "remember me" (7-day vs 12-hour session) |
| Dashboard | Stat cards, enrollment trend, distribution by major, recent activity log |
| Student / Faculty / Course Management | Search, filters, pagination, add/edit/delete, student photos |
| Class Schedule | Weekly timetable with Day / Week / Month views. Click an empty cell to add a class. Double-booking a room is rejected. |
| Admissions | Applications with one-click Accept / Reject |
| Grades & Records | Score entry with automatic letter grade and pass/fail, filters, CSV export |
| Announcements | General / Event / Notice posts with draft or published status. Latest ones show under the header bell. |
| System Settings | School name and logo, academic year, notifications, user management (admin only), JSON backup |

Roles: **admin** has full access. **staff** can manage all records but can't change system settings or users.

## Getting started

Requirements: Node **18.19+** (see `.nvmrc`) and MongoDB 6+ running locally. If you don't have MongoDB installed, start it with Docker: `docker compose up -d`.

```bash
nvm use                 # Node 18.19.0
npm run install:all     # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env   # then set JWT_SECRET
npm run seed            # resets the DB and loads demo data
npm run dev             # API on :5000, web on http://localhost:5173
```

Demo accounts: `admin / admin123` and `staff / staff123`.

### Production

```bash
npm run build   # builds frontend/dist
npm start       # Express serves the API and the built frontend on PORT (default 5000)
```

## Project structure

```
backend/src
  app.js, server.js        Express app and bootstrap
  config/                  env config, Mongo connection
  middleware/              JWT auth + role guard, error handler
  models/                  Student, Faculty, Course, Schedule, Admission, Grade, Announcement, User, Setting, Activity
  routes/crud.js           generic list/get/create/update/delete router (search, filters, paging, activity log)
  routes/index.js          wires each resource to the CRUD router
  routes/{auth,dashboard,settings}.js
  seed.js                  demo data
frontend/src
  api/                     axios instance (token + 401 handling)
  context/                 auth and branding/settings providers
  layouts/MainLayout.jsx   sidebar, header, mobile drawer
  components/CrudPage.jsx  generic table + filters + modal form used by most pages
  pages/                   one file per module
```

## API

All endpoints are under `/api` and need `Authorization: Bearer <token>`, except `POST /auth/login` and `GET /settings/public`.

Every resource (`students`, `faculty`, `courses`, `schedules`, `admissions`, `grades`, `announcements`, `users`) supports:

- `GET /<resource>?q=&page=&pageSize=&<filter>=`
- `GET /<resource>/:id`
- `POST /<resource>`
- `PUT /<resource>/:id`
- `DELETE /<resource>/:id`

Other endpoints: `GET /dashboard`, `GET|PUT /settings`, `GET /settings/backup`, `GET /auth/me`, `PUT /auth/password`.
