import { useEffect, useState } from 'react';
import { Alert, App, Button, Card, Col, Form, Input, Menu, Row, Select, Skeleton, Switch, Tooltip, Typography } from 'antd';
import { CloudDownloadOutlined, KeyOutlined, SettingOutlined, UserOutlined } from '@ant-design/icons';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import ImageUpload from '../components/ImageUpload';
import { ShieldIcon } from '../components/Logo';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { academicYears, toOptions } from '../constants';
import api, { errMsg } from '../api';
import PermissionEditor, { permissionSummary } from '../components/PermissionEditor';
import { t } from '../i18n';

const TIME_ZONES = [
  '(UTC+00:00) London',
  '(UTC+01:00) Paris',
  '(UTC+05:30) New Delhi',
  '(UTC+07:00) Bangkok',
  '(UTC+08:00) Beijing',
  '(UTC+08:00) Singapore',
  '(UTC+09:00) Tokyo',
  '(UTC+10:00) Sydney',
  '(UTC-05:00) New York',
  '(UTC-08:00) Los Angeles',
];

function GeneralSettings({ readOnly }) {
  const { message } = App.useApp();
  const { refresh } = useSettings();
  const [form] = Form.useForm();
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/settings')
      .then(({ data }) => {
        form.setFieldsValue(data);
        setLoaded(true);
      })
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFinish = async (values) => {
    setSaving(true);
    try {
      await api.put('/settings', { ...values, logo: values.logo || null });
      message.success(t('Settings saved'));
      refresh();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t('General Settings')}
      </Typography.Title>
      {readOnly && <Alert type="info" showIcon message={t('Only administrators can change system settings.')} style={{ marginBottom: 16 }} />}
      {!loaded && <Skeleton active />}
      <Form form={form} layout="vertical" onFinish={onFinish} disabled={readOnly} style={{ display: loaded ? undefined : 'none' }}>
        <Row gutter={24}>
          <Col xs={24} md={14}>
            <Form.Item name="schoolName" label={t('System Name')} rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            <Form.Item name="academicYear" label={t('Academic Year')} rules={[{ required: true }]}>
              <Select options={toOptions(academicYears(6))} />
            </Form.Item>
            <Form.Item name="timeZone" label={t('Time Zone')}>
              <Select options={toOptions(TIME_ZONES)} />
            </Form.Item>
            <Form.Item name="emailNotification" label={t('Enable Email Notification')} valuePropName="checked">
              <Switch />
            </Form.Item>
            <Form.Item name="smsNotification" label={t('Enable SMS Notification')} valuePropName="checked">
              <Switch />
            </Form.Item>
          </Col>
          <Col xs={24} md={10}>
            <Form.Item name="logo" label={t('School Logo')}>
              <ImageUpload shape="square" buttonText={t('Change Logo')} placeholder={<ShieldIcon size={64} />} />
            </Form.Item>
          </Col>
        </Row>
        {!readOnly && (
          <Button type="primary" htmlType="submit" loading={saving}>
            {t('Save Changes')}
          </Button>
        )}
      </Form>
    </>
  );
}

const userColumns = [
  { title: 'Username', dataIndex: 'username' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Role', dataIndex: 'role', render: (v) => <StatusTag value={v} /> },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
  { title: 'Access', key: 'access', render: (_, r) => permissionSummary(r) },
];

function UserManagement() {
  const [editing, setEditing] = useState(null); // user whose permissions are open
  const [version, setVersion] = useState(0);
  return (
    <>
      <CrudPage
        title="User Management"
        resource="users"
        addText="Add User"
        modalTitle={(r) => (r ? 'Edit User' : 'Add User')}
        searchPlaceholder="Search users..."
        columns={userColumns}
        filters={[
          { name: 'role', placeholder: 'All Roles', options: [{ label: 'Administrator', value: 'admin' }, { label: 'Staff', value: 'staff' }], width: 140 },
        ]}
        initialValues={{ role: 'staff', status: 'Active' }}
        refreshKey={version}
        rowActions={(record) => (
          <Tooltip title={t('Permissions')}>
            <Button type="text" icon={<KeyOutlined />} style={{ color: '#1664ff' }} onClick={() => setEditing(record)} />
          </Tooltip>
        )}
        toForm={(r) => ({ ...r, password: '' })}
        renderForm={(record) => (
          <Row gutter={16}>
            <Col xs={24} md={12}>
              <Form.Item name="username" label={t('Username')} rules={[{ required: true }]}>
                <Input autoComplete="off" />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name="name" label={t('Full Name')} rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item
                name="password"
                label={t('Password')}
                extra={record ? t('Leave blank to keep the current password') : t('New staff accounts start with read-only access. Adjust it with the key button.')}
                rules={[{ required: !record }, { min: 6 }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="role" label={t('Role')}>
                <Select options={[{ label: t('Administrator'), value: 'admin' }, { label: t('Staff'), value: 'staff' }]} />
              </Form.Item>
            </Col>
            <Col xs={12}>
              <Form.Item name="status" label={t('Status')}>
                <Select options={toOptions(['Active', 'Inactive'])} />
              </Form.Item>
            </Col>
          </Row>
        )}
      />
      <PermissionEditor user={editing} onClose={() => setEditing(null)} onSaved={() => setVersion((v) => v + 1)} />
    </>
  );
}

function Backup() {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const download = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/settings/backup', { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sist-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Typography.Title level={5} style={{ marginTop: 0 }}>
        {t('Backup')}
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        {t('Download a JSON snapshot of all records (students, faculty, courses, schedules, admissions, grades, announcements, settings and users without passwords). For full database backups and restores, use mongodump / mongorestore.')}
      </Typography.Paragraph>
      <Button type="primary" icon={<CloudDownloadOutlined />} loading={loading} onClick={download}>
        {t('Download Backup')}
      </Button>
    </>
  );
}

export default function Settings() {
  const { isAdmin } = useAuth();
  const [section, setSection] = useState('general');

  const items = [
    { key: 'general', icon: <SettingOutlined />, label: t('General Settings') },
    ...(isAdmin
      ? [
          { key: 'users', icon: <UserOutlined />, label: t('User Management') },
          { key: 'backup', icon: <CloudDownloadOutlined />, label: t('Backup') },
        ]
      : []),
  ];

  return (
    <>
      <h1 className="page-title">{t('System Settings')}</h1>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={6} xl={5}>
          <Card bordered={false} className="page-card" styles={{ body: { padding: 8 } }}>
            <Menu mode="inline" selectedKeys={[section]} items={items} onClick={({ key }) => setSection(key)} style={{ borderInlineEnd: 'none' }} />
          </Card>
        </Col>
        <Col xs={24} md={18} xl={19}>
          {section === 'users' ? (
            <UserManagement />
          ) : (
            <Card bordered={false} className="page-card">
              {section === 'general' && <GeneralSettings readOnly={!isAdmin} />}
              {section === 'backup' && <Backup />}
            </Card>
          )}
        </Col>
      </Row>
    </>
  );
}
