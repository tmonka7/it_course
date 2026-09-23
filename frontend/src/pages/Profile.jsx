import { useEffect, useState } from 'react';
import { App, Avatar, Button, Card, Col, Descriptions, Form, Input, Row, Space, Spin, Tag, Upload } from 'antd';
import { DeleteOutlined, LockOutlined, UploadOutlined, UserOutlined } from '@ant-design/icons';
import FaceRegistration from '../components/FaceRegistration';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { t } from '../i18n';

const AVATAR_PX = 160;

/** Center-crops an image file to a square and returns a small JPEG data URL. */
async function toAvatar(file) {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_PX;
  canvas.height = AVATAR_PX;
  canvas.getContext('2d').drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, AVATAR_PX, AVATAR_PX);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.85);
}

function PersonalInfo() {
  const { message } = App.useApp();
  const { updateUser } = useAuth();
  const [form] = Form.useForm();
  const [profile, setProfile] = useState(null);
  const [avatar, setAvatar] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api
      .get('/profile')
      .then(({ data }) => {
        setProfile(data);
        setAvatar(data.avatar || null);
        form.setFieldsValue(data);
      })
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickPhoto = async (file) => {
    if (!file.type.startsWith('image/')) {
      message.error(t('Please choose an image file'));
      return Upload.LIST_IGNORE;
    }
    try {
      setAvatar(await toAvatar(file));
    } catch {
      message.error(t('This image could not be read'));
    }
    return Upload.LIST_IGNORE; // handled locally, uploaded with the form
  };

  const save = async (values) => {
    setSaving(true);
    try {
      const { data } = await api.put('/profile', { ...values, avatar: avatar || null });
      setProfile((p) => ({ ...p, ...data }));
      updateUser(data);
      message.success(t('Profile saved'));
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  if (!profile) {
    return (
      <Card bordered={false} className="page-card">
        <Spin />
      </Card>
    );
  }

  return (
    <Card bordered={false} className="page-card" title={t('Personal Information')}>
      <div className="profile-head">
        <Avatar size={88} src={avatar || undefined} icon={<UserOutlined />} style={{ background: 'linear-gradient(135deg, #1664ff, #4f8bff)', flex: 'none' }} />
        <div style={{ minWidth: 0 }}>
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'username', label: t('Username'), children: profile.username },
              { key: 'role', label: t('Role'), children: <Tag color={profile.role === 'admin' ? 'geekblue' : 'default'}>{t(profile.role === 'admin' ? 'Administrator' : 'Staff')}</Tag> },
            ]}
          />
          <Space wrap style={{ marginTop: 8 }}>
            <Upload accept="image/png,image/jpeg,image/webp" showUploadList={false} beforeUpload={pickPhoto}>
              <Button size="small" icon={<UploadOutlined />}>
                {t('Change photo')}
              </Button>
            </Upload>
            {avatar && (
              <Button size="small" icon={<DeleteOutlined />} onClick={() => setAvatar(null)}>
                {t('Remove photo')}
              </Button>
            )}
          </Space>
        </div>
      </div>

      <Form form={form} layout="vertical" onFinish={save} requiredMark="optional">
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="name" label={t('Name')} rules={[{ required: true, whitespace: true }]}>
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="email" label={t('Email')} rules={[{ type: 'email' }]}>
              <Input maxLength={200} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="phone" label={t('Phone')}>
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="title" label={t('Job Title')}>
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="department" label={t('Department')}>
              <Input maxLength={100} />
            </Form.Item>
          </Col>
          <Col xs={24}>
            <Form.Item name="bio" label={t('About Me')}>
              <Input.TextArea rows={3} maxLength={1000} showCount />
            </Form.Item>
          </Col>
        </Row>
        <Button type="primary" htmlType="submit" loading={saving}>
          {t('Save')}
        </Button>
      </Form>
    </Card>
  );
}

function PasswordCard() {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [saving, setSaving] = useState(false);

  const save = async ({ currentPassword, newPassword }) => {
    setSaving(true);
    try {
      await api.put('/auth/password', { currentPassword, newPassword });
      message.success(t('Password changed'));
      form.resetFields();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card
      bordered={false}
      className="page-card"
      title={
        <Space>
          <LockOutlined />
          {t('Change Password')}
        </Space>
      }
    >
      <Form form={form} layout="vertical" onFinish={save}>
        <Form.Item name="currentPassword" label={t('Current password')} rules={[{ required: true }]}>
          <Input.Password autoComplete="current-password" />
        </Form.Item>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <Form.Item name="newPassword" label={t('New password')} rules={[{ required: true, min: 6 }]}>
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
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
              <Input.Password autoComplete="new-password" />
            </Form.Item>
          </Col>
        </Row>
        <Button htmlType="submit" loading={saving}>
          {t('Change password')}
        </Button>
      </Form>
    </Card>
  );
}

export default function Profile() {
  return (
    <>
      <h1 className="page-title">{t('My Profile')}</h1>
      <Row gutter={[16, 16]}>
        <Col xs={24} xl={14}>
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <PersonalInfo />
            <PasswordCard />
          </Space>
        </Col>
        <Col xs={24} xl={10}>
          <FaceRegistration />
        </Col>
      </Row>
    </>
  );
}
