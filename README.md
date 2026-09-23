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
| Announcements | General / Event / Notice posts with draft or published status. Events with a date appear under Upcoming Events on the home screen. |
| Daily Reports | Work done / issues / plan per day, Draft → Submitted → Reviewed. "Fill from activity log" pre-fills the day's recorded actions. Admins are notified on submit. |
| Commands | Directives assigned to a user with priority, due date and status. Every change is written to the command's log automatically, assignees add a daily progress entry, and the **Daily Log** view shows each day's entries plus open commands still missing one. Assignee and issuer are notified of every update; open commands without a log are reminded daily (`COMMAND_REMINDER_HOUR`). |
| Camera Management | Camera inventory (RTSP URL, credentials, live URL, status). **Discover Cameras** (admin) finds IP cameras on the LAN via ONVIF WS-Discovery and an RTSP port scan and adds them in bulk. |
| Camera View | NVR-style live wall with 1 / 4 / 8 (1+7) / 9 / 16-channel layouts, paging, auto tour, per-channel camera selection, double-click to enlarge, full screen. |
| Video Meetings | WebRTC video calls with screen sharing, a shared whiteboard, chat (saved) and a participant list. Join by code or invite link; the host can end the meeting for everyone. |
| Email | Compose to all students / faculty / users or a custom list. Emails are **recorded only**, nothing is delivered. |
| Notifications | Header bell with unread count; inbox for every user; admins can send to everyone, a role or one user. |
| System Settings | School name and logo, academic year, notifications, user management (admin only), JSON backup |

Roles: **admin** has full access. **staff** can manage all records but can't change system settings or users.

## Getting started

Requirements: Node **18.19+** (see `.nvmrc`) and MongoDB 6+ running locally. If you don't have MongoDB installed, start it with Docker: `docker compose up -d`.

```bash
nvm use                 # Node 18.19.0
npm run install:all     # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env   # then set JWT_SECRET
npm run seed            # resets the DB and loads demo data
npm run dev             # API on :5000, web on https://localhost:7173 (HTTP if server.crt/server.key are absent)
```

After pulling new features, run `npm run install:all` again: meetings use `socket.io` / `socket.io-client`, and the camera view uses `hls.js`.

Demo accounts: `admin / admin123` and `staff / staff123`.

### Live camera view (MediaMTX)

Browsers cannot play RTSP, so camera streams go through [MediaMTX](https://github.com/bluenviron/mediamtx), which converts them to HLS:

```bash
docker compose up -d mediamtx        # uses ./mediamtx.yml; ports bound to 127.0.0.1 only
```

Then set `MEDIAMTX_API_URL=http://127.0.0.1:9997` and `MEDIAMTX_HLS_URL=http://127.0.0.1:8888` in `backend/.env` and restart the API. The API registers every camera's RTSP URL (with its stored credentials) in MediaMTX and streams the result to logged-in users under `/api/live/<cameraId>/`. A camera can instead have its own browser-playable **Live URL** (HLS `.m3u8`, MJPEG or MP4).

### Camera discovery

Discovery runs on the API server: ONVIF WS-Discovery (UDP multicast 239.255.255.250:3702) and a TCP scan of port 554 on the server's /24 subnet(s), or a subnet you enter (/22 to /30). It only sees the server's own network; if the API runs in Docker, use host networking.

### Video meetings

- Camera, microphone and screen sharing only work on **HTTPS or localhost**. The Vite dev server uses `server.crt` / `server.key` from the repo root when present; for production put the app behind TLS or set `SSL_KEY_FILE` / `SSL_CERT_FILE`.
- Media flows peer-to-peer (mesh), which suits up to about 6 participants. Users behind strict firewalls need a TURN server in `ICE_SERVERS`.

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
  models/                  Student, Faculty, Course, Schedule, Admission, Grade, Announcement, User, Setting, Activity,
                           DailyReport, Command, CommandLog, Camera, Email, Notification, Meeting, MeetingMessage
  routes/crud.js           generic list/get/create/update/delete router (search, filters, paging, activity log)
  routes/index.js          wires each resource to the CRUD router
  routes/{auth,dashboard,settings,notifications,commandLogs,cameraDiscovery,live}.js
  services/                command log + notifications, daily reminder, MediaMTX gateway, LAN camera discovery
  realtime/meetings.js     socket.io: WebRTC signalling, chat, whiteboard
  seed.js                  demo data
frontend/src
  api/                     axios instance (token + 401 handling)
  context/                 auth and branding/settings providers
  layouts/MainLayout.jsx   sidebar, header, mobile drawer
  components/CrudPage.jsx  generic table + filters + modal form used by most pages
  pages/                   one file per module
  meeting/                 useMeeting (WebRTC mesh) and the shared whiteboard
```

## API

All endpoints are under `/api` and need `Authorization: Bearer <token>`, except `POST /auth/login` and `GET /settings/public`.

Every resource (`students`, `faculty`, `courses`, `schedules`, `admissions`, `grades`, `announcements`, `daily-reports`, `commands`, `cameras`, `emails`, `meetings`, `notifications` (admin), `users` (admin)) supports:

- `GET /<resource>?q=&page=&pageSize=&<filter>=`
- `GET /<resource>/:id`
- `POST /<resource>`
- `PUT /<resource>/:id`
- `DELETE /<resource>/:id`

Other endpoints: `GET /dashboard`, `GET /dashboard/activities?date=`, `GET|PUT /settings`, `GET /settings/backup`, `GET /auth/me`, `PUT /auth/password`,
`GET|POST /commands/:id/logs`, `GET /command-logs?date=`, `GET /notifications/mine`, `POST /notifications/:id/read`, `POST /notifications/read-all`,
`GET /live`, `GET /live/:cameraId/*`, `GET /camera-discovery`, `POST /camera-discovery/scan`, `POST /camera-discovery/add` (admin),
`GET /meetings/live`, `GET /meetings/by-code/:code`. Real-time meeting traffic uses socket.io on the `/meetings` namespace.
