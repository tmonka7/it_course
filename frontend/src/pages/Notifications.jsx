import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Empty, Form, Input, List, Row, Select, Tabs, Typography } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import NotificationItem from '../components/NotificationItem';
import RemoteSelect from '../components/RemoteSelect';
import { useAuth } from '../context/AuthContext';
import { errMsg } from '../api';
import { fetchMyNotifications, markAllRead, markRead, onNotificationsChanged } from '../notifications';
import { toOptions } from '../constants';
import { t } from '../i18n';

const TYPES = ['Info', 'Success', 'Warning', 'Alert'];
const AUDIENCE_LABEL = { admin: 'Admins', staff: 'Staff' };
const userLabel = (u) => `${u.name} (${u.username})`;

function MyNotifications() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  const load = useCallback(() => {
    fetchMyNotifications(100)
      .then(setData)
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    return onNotificationsChanged(load);
  }, [load]);

  const open = (n) => {
    if (!n.read) markRead(n._id).catch(() => {});
    if (n.link) navigate(n.link);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Typography.Text type="secondary">{data ? t('{count} unread', { count: data.unread }) : ''}</Typography.Text>
        <Button icon={<CheckOutlined />} disabled={!data?.unread} onClick={() => markAllRead().catch((err) => message.error(errMsg(err)))}>
          {t('Mark all as read')}
        </Button>
      </div>
      <List
        loading={!data}
        dataSource={data?.items || []}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No notifications')} /> }}
        renderItem={(n) => <NotificationItem item={n} onOpen={open} />}
      />
    </>
  );
}

const manageColumns = [
  { title: 'Title', dataIndex: 'title' },
  { title: 'Type', dataIndex: 'type', render: (v) => <StatusTag value={v} /> },
  {
    title: 'Audience',
    render: (_, r) => (r.recipient ? r.recipient.name : t(AUDIENCE_LABEL[r.role] || 'Everyone')),
  },
  { title: 'Read By', dataIndex: 'readBy', align: 'center', render: (v) => v?.length || 0, responsive: ['md'] },
  { title: 'Sent', dataIndex: 'createdAt', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm') },
];

const renderManageForm = (record) => (
  <Row gutter={16}>
    <Col xs={24} md={16}>
      <Form.Item name="title" label={t('Title')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="type" label={t('Type')}>
        <Select options={toOptions(TYPES)} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="message" label={t('Message')}>
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="audience" label={t('Send To')}>
        <Select
          options={[
            { value: 'all', label: t('Everyone') },
            { value: 'admin', label: t('All admins') },
            { value: 'staff', label: t('All staff') },
            { value: 'user', label: t('A specific user') },
          ]}
        />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item noStyle shouldUpdate={(a, b) => a.audience !== b.audience}>
        {({ getFieldValue }) =>
          getFieldValue('audience') === 'user' && (
            <Form.Item name="recipient" label={t('User')} rules={[{ required: true }]}>
              <RemoteSelect
                resource="users"
                labelOf={userLabel}
                placeholder={t('Search users')}
                initialOptions={record?.recipient ? [{ value: record.recipient._id, label: userLabel(record.recipient) }] : []}
              />
            </Form.Item>
          )
        }
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="link" label={t('Link (optional)')} tooltip={t('Page opened when the notification is clicked, e.g. /commands')}>
        <Input placeholder="/commands" />
      </Form.Item>
    </Col>
  </Row>
);

// The form's single "audience" choice maps onto the model's recipient/role fields.
const toManageForm = (r) => ({
  ...r,
  recipient: r.recipient?._id,
  audience: r.recipient ? 'user' : r.role || 'all',
});

const fromManageForm = ({ audience, recipient, ...v }) => ({
  ...v,
  recipient: audience === 'user' ? recipient : null,
  role: audience === 'admin' || audience === 'staff' ? audience : null,
});

export default function Notifications() {
  const { isAdmin } = useAuth();

  const inbox = (
    <Card className="page-card" bordered={false}>
      <h1 className="page-title">{t('Notifications')}</h1>
      <MyNotifications />
    </Card>
  );

  if (!isAdmin) return inbox;

  return (
    <Tabs
      defaultActiveKey="mine"
      items={[
        { key: 'mine', label: t('My Notifications'), children: inbox },
        {
          key: 'manage',
          label: t('Send & Manage'),
          children: (
            <CrudPage
              title="Sent Notifications"
              resource="notifications"
              addText="Send Notification"
              modalTitle={(r) => (r ? 'Edit Notification' : 'Send Notification')}
              searchPlaceholder="Search notifications..."
              columns={manageColumns}
              filters={[{ name: 'type', placeholder: 'All Types', options: toOptions(TYPES), width: 130 }]}
              renderForm={renderManageForm}
              toForm={toManageForm}
              fromForm={fromManageForm}
              initialValues={{ type: 'Info', audience: 'all' }}
              modalWidth={680}
            />
          ),
        },
      ]}
    />
  );
}
