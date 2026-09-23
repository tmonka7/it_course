import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App, Avatar, Badge, Button, Drawer, Dropdown, Form, Grid, Input, Layout, List, Menu, Modal, Popover, Space, Typography } from 'antd';
import {
  BellOutlined,
  BookOutlined,
  CalendarOutlined,
  DownOutlined,
  FileAddOutlined,
  FileTextOutlined,
  HomeOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuOutlined,
  NotificationOutlined,
  SearchOutlined,
  SettingOutlined,
  SolutionOutlined,
  TeamOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import Logo from '../components/Logo';
import CampusArt from '../components/CampusArt';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';

const { Header, Sider, Content } = Layout;

const MENU = [
  { key: '/dashboard', icon: <HomeOutlined />, label: 'Home' },
  { key: '/students', icon: <TeamOutlined />, label: 'Student Management' },
  { key: '/faculty', icon: <SolutionOutlined />, label: 'Faculty Management' },
  { key: '/courses', icon: <BookOutlined />, label: 'Course Management' },
  { key: '/schedule', icon: <CalendarOutlined />, label: 'Class Schedule' },
  { key: '/admissions', icon: <FileAddOutlined />, label: 'Admissions' },
  { key: '/grades', icon: <FileTextOutlined />, label: 'Grades & Records' },
  { key: '/announcements', icon: <NotificationOutlined />, label: 'Announcements' },
  { key: '/settings', icon: <SettingOutlined />, label: 'System Settings' },
];

function Notifications() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    api
      .get('/announcements', { params: { status: 'Published', pageSize: 5 } })
      .then(({ data }) => setItems(data.items))
      .catch(() => {});
  }, []);

  const recent = items.filter((a) => dayjs().diff(a.publishDate, 'day') <= 14).length;

  return (
    <Popover
      placement="bottomRight"
      trigger="click"
      title="Latest announcements"
      content={
        <List
          style={{ width: 300 }}
          size="small"
          dataSource={items}
          locale={{ emptyText: 'No announcements' }}
          renderItem={(a) => (
            <List.Item style={{ cursor: 'pointer' }} onClick={() => navigate('/announcements')}>
              <List.Item.Meta title={a.title} description={dayjs(a.publishDate).format('YYYY-MM-DD')} />
            </List.Item>
          )}
        />
      }
    >
      <Badge count={recent} size="small">
        <Button type="text" shape="circle" icon={<BellOutlined style={{ fontSize: 18 }} />} />
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
      <strong>{now.format('hh:mm A')}</strong>
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
      message.success('Password changed');
      onClose();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Change Password" open={open} onOk={submit} onCancel={onClose} confirmLoading={saving} destroyOnClose>
      {open && (
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="currentPassword" label="Current password" rules={[{ required: true }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item name="newPassword" label="New password" rules={[{ required: true, min: 6 }]}>
            <Input.Password />
          </Form.Item>
          <Form.Item
            name="confirm"
            label="Confirm new password"
            dependencies={['newPassword']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, v) =>
                  !v || v === getFieldValue('newPassword') ? Promise.resolve() : Promise.reject(new Error('Passwords do not match')),
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
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const selected = MENU.find((m) => location.pathname.startsWith(m.key))?.key;

  const menu = (
    <Menu
      mode="inline"
      selectedKeys={selected ? [selected] : []}
      items={MENU}
      onClick={({ key }) => {
        navigate(key);
        setDrawerOpen(false);
      }}
      style={{ borderInlineEnd: 'none', padding: '0 12px' }}
    />
  );

  const userMenu = {
    items: [
      { key: 'password', icon: <LockOutlined />, label: 'Change password' },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Log out', danger: true },
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
              <Logo size={46} subtitle="Administrative Management System" />
            </div>
            {menu}
            <div className="sider-footer">
              <CampusArt className="sider-campus" />
              <div className="sider-tagline">Knowledge &middot; Innovation &middot; Future</div>
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
            {screens.sm && (
              <Input
                allowClear
                prefix={<SearchOutlined style={{ color: '#98a2b3' }} />}
                placeholder="Search..."
                className="header-search"
                onPressEnter={(e) => {
                  const q = e.currentTarget.value.trim();
                  navigate(q ? `/students?q=${encodeURIComponent(q)}` : '/students');
                }}
              />
            )}
          </Space>
          <Space size={24}>
            <Notifications />
            <Dropdown menu={userMenu} trigger={['click']}>
              <Space style={{ cursor: 'pointer' }}>
                <Avatar size={38} style={{ background: '#1664ff' }} icon={<UserOutlined />} />
                {screens.md && (
                  <div className="header-user">
                    <Typography.Text strong>{user?.username}</Typography.Text>
                    <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                      {user?.role === 'admin' ? 'Administrator' : 'Staff'}
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
