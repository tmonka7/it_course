import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Badge, Button, Col, DatePicker, Form, Input, Row, Space, Tooltip, Typography } from 'antd';
import { CopyOutlined, LoginOutlined, VideoCameraAddOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import api, { errMsg } from '../api';
import { toOptions } from '../constants';
import { t } from '../i18n';

const STATUSES = ['Scheduled', 'Live', 'Ended'];
const roomPath = (code) => `/meetings/room/${code}`;

const renderForm = () => (
  <Row gutter={16}>
    <Col xs={24}>
      <Form.Item name="title" label={t('Title')} rules={[{ required: true }]}>
        <Input placeholder={t('e.g. Weekly Staff Meeting')} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="scheduledAt" label={t('Scheduled For')}>
        <DatePicker showTime={{ format: 'HH:mm', minuteStep: 5 }} format="YYYY-MM-DD HH:mm" style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="description" label={t('Agenda / Description')}>
        <Input.TextArea rows={4} />
      </Form.Item>
    </Col>
  </Row>
);

function JoinByCode() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [code, setCode] = useState('');
  const join = async () => {
    // Accept a pasted invite link as well as a bare code.
    const value = code.trim().split('/').pop().toLowerCase();
    if (!value) return;
    try {
      await api.get(`/meetings/by-code/${encodeURIComponent(value)}`);
      navigate(roomPath(value));
    } catch (err) {
      message.error(errMsg(err));
    }
  };
  return (
    <Space.Compact>
      <Input placeholder={t('Enter a code or link')} value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={join} style={{ width: 200 }} />
      <Button icon={<LoginOutlined />} onClick={join}>
        {t('Join')}
      </Button>
    </Space.Compact>
  );
}

export default function Meetings() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [live, setLive] = useState({}); // code -> participants in the room right now

  useEffect(() => {
    const load = () =>
      api
        .get('/meetings/live')
        .then(({ data }) => setLive(data))
        .catch(() => {});
    load();
    const id = setInterval(load, 15000);
    return () => clearInterval(id);
  }, []);

  const copyLink = (code) =>
    navigator.clipboard
      ?.writeText(`${window.location.origin}${roomPath(code)}`)
      .then(() => message.success(t('Invite link copied')), () => message.error(t('Copy failed')));

  const columns = [
    { title: 'Title', dataIndex: 'title' },
    {
      title: 'Code',
      dataIndex: 'code',
      render: (v) => (
        <Space size={2}>
          <Typography.Text code>{v}</Typography.Text>
          <Tooltip title={t('Copy invite link')}>
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => copyLink(v)} />
          </Tooltip>
        </Space>
      ),
    },
    { title: 'Host', dataIndex: 'hostName', responsive: ['md'] },
    { title: 'Scheduled', dataIndex: 'scheduledAt', render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v, r) =>
        live[r.code] ? <Badge status="processing" text={t('Live · {count} in call', { count: live[r.code] })} /> : <StatusTag value={v === 'Live' ? 'Scheduled' : v} />,
    },
  ];

  return (
    <CrudPage
      title="Video Meetings"
      resource="meetings"
      addText="New Meeting"
      modalTitle={(r) => (r ? 'Edit Meeting' : 'New Meeting')}
      searchPlaceholder="Search title, code or host..."
      columns={columns}
      filters={[{ name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 }]}
      toolbarExtra={() => <JoinByCode />}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, scheduledAt: r.scheduledAt ? dayjs(r.scheduledAt) : null })}
      fromForm={(v) => ({ ...v, scheduledAt: v.scheduledAt ? v.scheduledAt.toISOString() : null })}
      initialValues={{ scheduledAt: dayjs().add(1, 'hour').startOf('hour') }}
      rowActions={(record) =>
        record.status !== 'Ended' && (
          <Tooltip title={t('Join meeting')}>
            <Button type="primary" size="small" icon={<VideoCameraAddOutlined />} onClick={() => navigate(roomPath(record.code))}>
              {t('Join')}
            </Button>
          </Tooltip>
        )
      }
    />
  );
}
