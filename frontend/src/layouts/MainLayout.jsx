import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Badge, Button, Drawer, Dropdown, Form, Grid, Input, Layout, List, Menu, Modal, Popover, Space, Typography } from 'antd';
import {
  AppstoreOutlined,
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  DownOutlined,
  FileAddOutlined,
  FileDoneOutlined,
  FileTextOutlined,
  FlagOutlined,
  HomeOutlined,
  LockOutlined,
  LogoutOutlined,
  MailOutlined,
  MenuOutlined,
  MessageOutlined,
  NotificationOutlined,
  ScheduleOutlined,
  SearchOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserOutlined,
  VideoCameraAddOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import Logo from '../components/Logo';
import CampusArt from '../components/CampusArt';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import NotificationItem from '../components/NotificationItem';
import { fetchMyNotifications, markAllRead, markRead, onNotificationsChanged } from '../notifications';
import LanguageSwitcher from '../components/LanguageSwitcher';
import { currentLanguage, t } from '../i18n';

const { Header, Sider, Content } = Layout;

const MENU = [
  { key: '/dashboard', page: 'dashboard', icon: <HomeOutlined />, label: 'Home' },
  { key: '/students', page: 'students', icon: <TeamOutlined />, label: 'Student Management' },
  { key: '/faculty', page: 'faculty', icon: <SolutionOutlined />, label: 'Faculty Management' },
  { key: '/courses', page: 'courses', icon: <BookOutlined />, label: 'Course Management' },
  { key: '/schedule', page: 'schedule', icon: <CalendarOutlined />, label: 'Class Schedule' },
  { key: '/admissions', page: 'admissions', icon: <FileAddOutlined />, label: 'Admissions' },
  { key: '/grades', page: 'grades', icon: <FileTextOutlined />, label: 'Grades & Records' },
  { key: '/announcements', page: 'announcements', icon: <NotificationOutlined />, label: 'Announcements' },
  {
    key: 'operations',
    icon: <FlagOutlined />,
    label: 'Operations',
    children: [
      { key: '/daily-reports', page: 'dailyReports', icon: <FileDoneOutlined />, label: 'Daily Reports' },
      { key: '/commands', page: 'commands', icon: <FlagOutlined />, label: 'Commands' },
      { key: '/work-schedule', page: 'workSchedule', icon: <ScheduleOutlined />, label: 'Work Schedule' },
    ],
  },
  {
    key: 'security',
    icon: <VideoCameraOutlined />,
    label: 'Security',
    children: [
      { key: '/cameras', page: 'cameras', icon: <VideoCameraOutlined />, label: 'Camera Management' },
      { key: '/camera-view', page: 'cameraView', icon: <AppstoreOutlined />, label: 'Camera View' },
    ],
  },
  {
    key: 'communication',
    icon: <MessageOutlined />,
    label: 'Communication',
    children: [
      { key: '/meetings', page: 'meetings', icon: <VideoCameraAddOutlined />, label: 'Video Meetings' },
      { key: '/emails', page: 'emails', icon: <MailOutlined />, label: 'Email' },
      { key: '/notifications', icon: <BellOutlined />, label: 'Notifications' },
    ],
  },
  { key: '/settings', icon: <SettingOutlined />, label: 'System Settings' },
];

// Leaf items with the submenu they belong to, for route highlighting.
const MENU_LEAVES = MENU.flatMap((m) => (m.children ? m.children.map((c) => ({ ...c, parent: m.key })) : [m]));

/** Menu items the user may view, with translated labels; groups with no visible items are dropped. */
function visibleMenu(can) {
  const leaf = ({ page, label, ...item }) => ({ ...item, label: t(label) });
  return MENU.map((m) => {
    if (!m.children) return !m.page || can(m.page) ? leaf(m) : null;
    const children = m.children.filter((c) => !c.page || can(c.page)).map(leaf);
    return children.length ? { ...m, label: t(m.label), children } : null;
  }).filter(Boolean);
}

function NotificationBell() {
  const [data, setData] = useState({ unread: 0, items: [] });
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const load = () =>
      fetchMyNotifications(6)
        .then(setData)
        .catch(() => {});
    load();
    const id = setInterval(load, 60000);
    const off = onNotificationsChanged(load);
    return () => {
      clearInterval(id);
      off();
    };
  }, []);

  const openItem = (n) => {
    setOpen(false);
    if (!n.read) markRead(n._id).catch(() => {});
    navigate(n.link || '/notifications');
  };

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      open={open}
      onOpenChange={setOpen}
      title={
        <div className="notif-pop-head">
          <span>{t('Notifications')}</span>
          {data.unread > 0 && (
            <Button type="link" size="small" onClick={() => markAllRead().catch(() => {})}>
              {t('Mark all read')}
            </Button>
          )}
        </div>
      }
      content={
        <div style={{ width: 340 }}>
          <List
            size="small"
            dataSource={data.items}
            locale={{ emptyText: t('No notifications') }}
            renderItem={(n) => <NotificationItem item={n} onOpen={openItem} />}
          />
          <Button
            type="link"
            block
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
          >
            {t('View all notifications')}
          </Button>
        </div>
      }
    >
      <Badge count={data.unread} size="small">
        <Button type="text" shape="circle" aria-label={t('Notifications')} icon={<BellOutlined style={{ fontSize: 18 }} />} />
      </Badge>
    </Popover>
  );
}

function Clock() {
  const [now, setNow] = useState(dayjs());
  useEffect(() => {
    const id = setInterval(() => setNow(dayjs()), 15000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="header-clock">
      <span>
        {now.format('YYYY-MM-DD')}&nbsp;&nbsp;{now.format('dddd')}
      </span>
      <strong>{now.format(currentLanguage() === 'ja' ? 'HH:mm' : 'hh:mm A')}</strong>
    </div>
  );
}

function ChangePasswordModal({ open, onClose }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await api.put('/auth/password', values);
      message.success(t('Password changed'));
      onClose();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={t('Change Password')}
      open={open}
      onOk={submit}
      onCancel={onClose}
      okText={t('Save')}
      cancelText={t('Cancel')}
      confirmLoading={saving}
      destroyOnClose
    >
      {open && (
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="currentPassword" label={t('Current password')} rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label={t('New password')} rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label={t('Confirm new password')}
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, v) =>
                  !v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error(t('Passwords do not match'))),
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      )}
    </Modal>
  );
}

export default function MainLayout() {
  const screens = Grid.useBreakpoint();
  const isMobile = screens.lg === false; // breakpoints are unknown ({}) on the very first render
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [pwdOpen, setPwdOpen] = useState(false);
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const current = MENU_LEAVES.find((m) => location.pathname.startsWith(m.key));
  const selected = current?.key;
  const [openKeys, setOpenKeys] = useState(current?.parent ? [current.parent] : []);

  // Open the submenu of the current page when navigating (e.g. from a notification link).
  useEffect(() => {
    if (current?.parent) setOpenKeys((keys) => (keys.includes(current.parent) ? keys : [...keys, current.parent]));
  }, [current?.parent]);

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={selected ? [selected] : []}
      openKeys={openKeys}
      onOpenChange={setOpenKeys}
      items={visibleMenu(can)}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 'none', padding: '0 12px' }}
    />
  );

  const userMenu = {
    items: [
      { key: 'password', icon: <LockOutlined />, label: t('Change password') },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: t('Log out'), danger: true },
    ],
    onClick: ({ key }) => {
      if (key === 'password') setPwdOpen(true);
      if (key === 'logout') {
        logout();
        navigate('/login');
      }
    },
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      {!isMobile && (
        <Sider width={256} className="app-sider" style={{ position: 'sticky', top: 0, height: '100vh', overflow: 'auto' }}>
          <div className="sider-inner">
            <div className="sider-logo">
              <Logo size={46} subtitle={t('Administrative Management System')} />
            </div>
            {menu}
            <div className="sider-footer">
              <CampusArt className="sider-campus" />
              <div className="sider-tagline">
                {t('Knowledge')} &middot; {t('Innovation')} &middot; {t('Future')}
              </div>
            </div>
          </div>
        </Sider>
      )}
      <Drawer
        placement="left"
        open={isMobile && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={260}
        styles={{ body: { padding: 0 } }}
        title={<Logo size={30} />}
      >
        {menu}
      </Drawer>

      <Layout>
        <Header className="app-header">
          <Space size={12} style={{ flex: 1, minWidth: 0 }}>
            {isMobile && <Button type="text" icon={<MenuOutlined />} onClick={() => setDrawerOpen(true)} />}
            {screens.sm && can('students') && (
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: '#98a2b3' }} />}
                placeholder={t('Search students...')}
                className="header-search"
                onPressEnter={(e) => {
                  const q = e.currentTarget.value.trim();
                  navigate(q ? `/students?q=${encodeURIComponent(q)}` : '/students');
                }}
              />
            )}
          </Space>
          <Space size={screens.md ? 20 : 8}>
            <LanguageSwitcher />
            <NotificationBell />
            <Dropdown menu={userMenu} trigger={['click']}>
              <Space className="header-user-trigger" style={{ cursor: 'pointer' }}>
                <Avatar size={38} style={{ background: 'linear-gradient(135deg, #1664ff, #4f8bff)' }} icon={<UserOutlined />} />
                {screens.md && (
                  <div className="header-user">
                    <Typography.Text strong>{user?.username}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {t(user?.role === 'admin' ? 'Administrator' : 'Staff')}
                    </Typography.Text>
                  </div>
                )}
                <DownOutlined style={{ fontSize: 10, color: '#98a2b3' }} />
              </Space>
            </Dropdown>
            {screens.lg && <Clock />}
          </Space>
        </Header>
        <Content className="app-content">
          <Outlet />
        </Content>
      </Layout>

      <ChangePasswordModal open={pwdOpen} onClose={() => setPwdOpen(false)} />
    </Layout>
  );
}
