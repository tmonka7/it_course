import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
import PageGuard from './components/PageGuard';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Faculty from './pages/Faculty';
import Courses from './pages/Courses';
import Schedule from './pages/Schedule';
import Admissions from './pages/Admissions';
import Grades from './pages/Grades';
import Announcements from './pages/Announcements';
import Settings from './pages/Settings';
import DailyReports from './pages/DailyReports';
import Commands from './pages/Commands';
import Cameras from './pages/Cameras';
import Emails from './pages/Emails';
import Notifications from './pages/Notifications';
import CameraView from './pages/CameraView';
import WorkSchedule from './pages/WorkSchedule';
import Meetings from './pages/Meetings';
import MeetingRoom from './pages/MeetingRoom';
import Profile from './pages/Profile';
import Detection from './pages/Detection';

// First page (in sidebar order) the user may open; everyone can open Notifications.
const LANDING = [
  ['/dashboard', 'dashboard'],
  ['/students', 'students'],
  ['/faculty', 'faculty'],
  ['/courses', 'courses'],
  ['/schedule', 'schedule'],
  ['/admissions', 'admissions'],
  ['/grades', 'grades'],
  ['/announcements', 'announcements'],
  ['/daily-reports', 'dailyReports'],
  ['/commands', 'commands'],
  ['/work-schedule', 'workSchedule'],
  ['/cameras', 'cameras'],
  ['/camera-view', 'cameraView'],
  ['/detection', 'detection'],
  ['/meetings', 'meetings'],
  ['/emails', 'emails'],
];

function HomeRedirect() {
  const { can } = useAuth();
  const first = LANDING.find(([, page]) => can(page, 'view'));
  return <Navigate to={first ? first[0] : '/notifications'} replace />;
}

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Spin fullscreen />;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      {/* The meeting room uses the whole window, outside the sidebar layout. */}
      <Route
        path="/meetings/room/:code"
        element={
          <RequireAuth>
            <PageGuard page="meetings">
              <MeetingRoom />
            </PageGuard>
          </RequireAuth>
        }
      />
      <Route
        element={
          <RequireAuth>
            <MainLayout />
          </RequireAuth>
        }
      >
        <Route index element={<HomeRedirect />} />
        <Route path="dashboard" element={<PageGuard page="dashboard"><Dashboard /></PageGuard>} />
        <Route path="students" element={<PageGuard page="students"><Students /></PageGuard>} />
        <Route path="faculty" element={<PageGuard page="faculty"><Faculty /></PageGuard>} />
        <Route path="courses" element={<PageGuard page="courses"><Courses /></PageGuard>} />
        <Route path="schedule" element={<PageGuard page="schedule"><Schedule /></PageGuard>} />
        <Route path="admissions" element={<PageGuard page="admissions"><Admissions /></PageGuard>} />
        <Route path="grades" element={<PageGuard page="grades"><Grades /></PageGuard>} />
        <Route path="announcements" element={<PageGuard page="announcements"><Announcements /></PageGuard>} />
        <Route path="daily-reports" element={<PageGuard page="dailyReports"><DailyReports /></PageGuard>} />
        <Route path="commands" element={<PageGuard page="commands"><Commands /></PageGuard>} />
        <Route path="work-schedule" element={<PageGuard page="workSchedule"><WorkSchedule /></PageGuard>} />
        <Route path="cameras" element={<PageGuard page="cameras"><Cameras /></PageGuard>} />
        <Route path="camera-view" element={<PageGuard page="cameraView"><CameraView /></PageGuard>} />
        <Route path="detection" element={<PageGuard page="detection"><Detection /></PageGuard>} />
        <Route path="meetings" element={<PageGuard page="meetings"><Meetings /></PageGuard>} />
        <Route path="emails" element={<PageGuard page="emails"><Emails /></PageGuard>} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
