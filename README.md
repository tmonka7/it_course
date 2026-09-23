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
| Daily Reports | Month calendar (today highlighted) showing each day's reports; the list below shows the selected day (today by default). Work done / issues / plan per day, Draft → Submitted → Reviewed. "Fill from activity log" pre-fills the day's recorded actions. Admins are notified on submit. |
| Commands (work orders) | Opens on today's work orders (issued, due or logged that day); pick any date or clear it for all. File attachments in the edit form and the log drawer (stored in `backend/uploads`, 20 MB per file). Directives assigned to a user with priority, due date and status. Every change is written to the command's log automatically, assignees add a daily progress entry, and the **Daily Log** view shows each day's entries plus open commands still missing one. Assignee and issuer are notified of every update; open commands without a log are reminded daily (`COMMAND_REMINDER_HOUR`). |
| Work Schedule | Create staff work schedules and records: date, time range, staff, category, location, plan and what was actually done. Month calendar plus a list for the selected day; people are notified when someone else schedules them. |
| Camera Management | Camera inventory (RTSP URL, credentials, live URL, status). **Discover Cameras** (admin) finds IP cameras on the LAN via ONVIF WS-Discovery and an RTSP port scan and adds them in bulk. |
| Camera View | NVR-style live wall with 1 / 4 / 8 (1+7) / 9 / 16-channel layouts, paging, auto tour, per-channel camera selection, double-click to enlarge, full screen. |
| AI Detection | Live **object detection** (YOLO26n, 80 COCO classes) and **face recognition** on a registered camera or this device's webcam. Boxes and labels over the video, confidence slider, object-type filter, counts per class, recognised people with match score, and the list of registered faces (admins can remove one). Runs in the browser; see [AI detection](#ai-detection). |
| My Profile | Every user edits their own name, email, phone, job title, department, about text and photo, changes their password, and registers their face (3–5 webcam samples) for recognition. Opened from the user menu in the header. |
| Video Meetings | Double-click a participant (or pin them) to show them large on the left with everyone else as thumbnails on the right. WebRTC video calls with screen sharing, a shared whiteboard, chat (saved) and a participant list. Join by code or invite link; the host can end the meeting for everyone. |
| Email | Compose to all students / faculty / users or a custom list. Search by subject, message, address or **sender name / username**, or filter by sender. Emails are **recorded only**, nothing is delivered. |
| Notifications | Header bell with unread count; inbox for every user; admins can send to everyone, a role or one user. |
| System Settings | School name and logo, academic year, notifications, user management (admin only), JSON backup |

Roles: **admin** has full access. **staff** users get per-page permissions (below). System Settings and User Management are admin-only.

### Permissions

In **System Settings → User Management**, the key button next to a user opens a matrix of pages × **View / Create / Edit / Delete** (presets: Full access, Read only, No access). Granting Create, Edit or Delete also grants View.

- Enforced by the API on every request (`GET` = view, `POST` = create, `PUT` = edit, `DELETE` = delete; adding logs or attachments to a work order counts as edit). The UI hides menu entries, pages and buttons the user can't use.
- New staff accounts start **read only**. Staff accounts created before permissions existed keep full access until an administrator changes them.
- Dropdowns that pick related records (instructor, student, course, user) use `GET /lookup/:kind`, which returns names only and is open to every signed-in user.
- Changes apply to the user's next request; their menu updates when they return to the browser window.

### Languages

The interface is available in **English**, **Simplified Chinese** and **Japanese** (globe menu in the header and on the login page; the browser language picks the default). The choice is saved in the browser and on the account (`PUT /auth/preferences`). Ant Design components and dates follow the language too.

All translations live in one file, `frontend/src/i18n.xml`, grouped into sections by area. Each entry is keyed by the English text, with one element per language; a missing entry falls back to English:

```xml
<text key="Reports for {date}"><zh>{date} 的日报</zh><ja>{date} の日報</ja></text>
```

To add a language, add a `<language code="ko" name="한국어" />` line and a `<ko>` element to each `<text>`; also add its antd locale in `main.jsx`, its dayjs locale in `i18n.jsx`, and the code to the `language` enum on the User model. Data entered by users, and notifications or activity entries generated by the server, stay in the language they were written in.

## Getting started

Requirements: Node **18.19+** (see `.nvmrc`) and MongoDB 6+ running locally. If you don't have MongoDB installed, start it with Docker: `docker compose up -d`.

```bash
nvm use                 # Node 18.19.0
npm run install:all     # installs root, backend and frontend dependencies
cp backend/.env.example backend/.env   # then set JWT_SECRET
npm run seed            # resets the DB and loads demo data
npm run dev             # API on :5000, web on https://localhost:7173 (HTTP if server.crt/server.key are absent)
```

After pulling new features, run `npm run install:all` again: meetings use `socket.io` / `socket.io-client`, the camera view uses `hls.js`, and AI detection uses `onnxruntime-web`.

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

### AI detection

- The models run **in the viewer's browser** with onnxruntime-web (WebAssembly) in a Web Worker: YOLO26n for objects, YuNet to find faces and SFace to compare them. The model files are in `frontend/public/models/` (about 48 MB in total, downloaded once and cached by the browser). Nothing is sent to an outside service. Sources, checksums and licenses: `frontend/public/models/README.md`.
- Speed depends on the viewer's computer: on a typical desktop, about 0.35 s per frame for objects and 0.1 s per face, so expect roughly 1–3 frames per second. Only the person watching the page runs detection; nothing is recorded.
- The webcam (for detection and face registration) needs **HTTPS or localhost**, like meetings. Cameras are analysed from their live stream: streams played through the media gateway work; a camera Live URL on another host only works if that camera allows cross-origin reads (CORS).
- Face registration stores a 128-number face signature and a small thumbnail per sample on the user record (`faces`, never included in user lists). A face counts as recognised when its similarity to a registered sample is at least 0.42 (`DEFAULT_MATCH_THRESHOLD` in `frontend/src/vision/index.js`). Each user can delete their own samples; admins can clear anyone's from the AI Detection page.
- The **AI Detection** page has its own permission (View). It can also list cameras, as can Camera View, without the Camera Management permission.
- **License:** YOLO26n is published by Ultralytics under **AGPL-3.0**. Using it in a product you distribute or offer over a network means following AGPL terms, or buying an Ultralytics Enterprise license. YuNet (MIT) and SFace (Apache-2.0) have no such condition.
- Face recognition processes biometric data, which privacy laws treat as sensitive (for example GDPR, PIPL and APPI). Get consent from the people you register and tell people when cameras use recognition.

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
  routes/profile.js        the signed-in user's profile and face samples; routes/faces.js: registry for AI Detection
  services/                command log + notifications, daily reminder, MediaMTX gateway, LAN camera discovery
  realtime/meetings.js     socket.io: WebRTC signalling, chat, whiteboard
  seed.js                  demo data
frontend/src
  api/                     axios instance (token + 401 handling)
  context/                 auth and branding/settings providers
  layouts/MainLayout.jsx   sidebar, header, mobile drawer
  components/CrudPage.jsx  generic table + filters + modal form used by most pages
  pages/                   one file per module
  i18n.jsx                 t() / <T> helpers and language switching; reads i18n.xml
  i18n.xml                 Chinese / Japanese translations keyed by English text
  permissions.js           page permission keys (mirrors backend/src/utils/permissions.js)
  meeting/                 useMeeting (WebRTC mesh) and the shared whiteboard
  vision/                  AI detection: worker.js runs the ONNX models, index.js matches faces and draws boxes
frontend/public/models     YOLO26n, YuNet and SFace ONNX models (see its README for sources and licenses)
```

## API

All endpoints are under `/api` and need `Authorization: Bearer <token>`, except `POST /auth/login` and `GET /settings/public`.

List endpoints of dated resources (`daily-reports`, `work-schedules`, `commands`) also accept `dateFrom` / `dateTo` (ISO timestamps).

Every resource (`students`, `faculty`, `courses`, `schedules`, `admissions`, `grades`, `announcements`, `daily-reports`, `work-schedules`, `commands`, `cameras`, `emails`, `meetings`, `notifications` (admin), `users` (admin)) supports:

- `GET /<resource>?q=&page=&pageSize=&<filter>=`
- `GET /<resource>/:id`
- `POST /<resource>`
- `PUT /<resource>/:id`
- `DELETE /<resource>/:id`

Other endpoints: `GET /lookup/:kind` (students, faculty, courses, users), `PUT /auth/preferences`, `GET /dashboard`, `GET /dashboard/activities?date=`, `GET|PUT /settings`, `GET /settings/backup`, `GET /auth/me`, `PUT /auth/password`,
`GET|POST /commands/:id/logs`, `POST /commands/:id/attachments` (multipart `files`), `GET|DELETE /commands/:id/attachments/:attachmentId`, `GET /command-logs?date=`, `GET /notifications/mine`, `POST /notifications/:id/read`, `POST /notifications/read-all`,
`GET /live`, `GET /live/:cameraId/*`, `GET /camera-discovery`, `POST /camera-discovery/scan`, `POST /camera-discovery/add` (admin),
`GET /meetings/live`, `GET /meetings/by-code/:code`,
`GET|PUT /profile`, `GET|POST|DELETE /profile/faces`, `DELETE /profile/faces/:faceId`, `GET /faces` and `DELETE /faces/:userId` (admin). Real-time meeting traffic uses socket.io on the `/meetings` namespace.
