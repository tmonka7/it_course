import { Navigate, Route, Routes } from 'react-router-dom';
import { Spin } from 'antd';
import { useAuth } from './context/AuthContext';
import MainLayout from './layouts/MainLayout';
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
import Meetings from './pages/Meetings';
import MeetingRoom from './pages/MeetingRoom';

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
            <MeetingRoom />
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
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="faculty" element={<Faculty />} />
        <Route path="courses" element={<Courses />} />
        <Route path="schedule" element={<Schedule />} />
        <Route path="admissions" element={<Admissions />} />
        <Route path="grades" element={<Grades />} />
        <Route path="announcements" element={<Announcements />} />
        <Route path="daily-reports" element={<DailyReports />} />
        <Route path="commands" element={<Commands />} />
        <Route path="cameras" element={<Cameras />} />
        <Route path="camera-view" element={<CameraView />} />
        <Route path="meetings" element={<Meetings />} />
        <Route path="emails" element={<Emails />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
