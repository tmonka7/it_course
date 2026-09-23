import { useState } from 'react';
import { App, Badge, Button, Col, DatePicker, Form, Input, Row, Select, Space, TimePicker, Tooltip, Typography } from 'antd';
import { CheckOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import CalendarBoard from '../components/CalendarBoard';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { toOptions } from '../constants';
import { t, T } from '../i18n';

const CATEGORIES = ['Duty', 'Meeting', 'Inspection', 'Maintenance', 'Teaching Support', 'Other'];
const STATUSES = ['Planned', 'In Progress', 'Done', 'Cancelled'];
const STATUS_BADGE = { Planned: 'processing', 'In Progress': 'warning', Done: 'success', Cancelled: 'default' };
const userLabel = (u) => `${u.name} (${u.username})`;
// "HH:mm" -> dayjs today at that time (avoids needing the customParseFormat plugin).
const fromHHmm = (s) => {
  const [h, m] = s.split(':').map(Number);
  return dayjs().hour(h).minute(m).second(0);
};
const timeRange = (r) => (r.startTime ? `${r.startTime}${r.endTime ? `–${r.endTime}` : ''}` : t('All day'));

const columns = [
  { title: 'Time', key: 'time', width: 110, render: (_, r) => timeRange(r) },
  { title: 'Work', dataIndex: 'title' },
  { title: 'Category', dataIndex: 'category', responsive: ['md'] },
  { title: 'Staff', dataIndex: ['assignee', 'name'], render: (v) => v || '-' },
  { title: 'Location', dataIndex: 'location', responsive: ['lg'], render: (v) => v || '-' },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
  {
    title: 'Work Record',
    dataIndex: 'record',
    ellipsis: true,
    width: 240,
    responsive: ['xl'],
    render: (v) => (v ? <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{v}</span>}>{v.split('\n')[0]}</Tooltip> : <Typography.Text type="secondary">-</Typography.Text>),
  },
];

function renderDay(entries) {
  const sorted = [...entries].sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  const shown = sorted.slice(0, 3);
  return (
    <>
      {shown.map((e) => (
        <Badge key={e._id} status={STATUS_BADGE[e.status]} text={`${e.startTime || ''} ${e.title}`.trim()} className="cal-item" />
      ))}
      {sorted.length > shown.length && <div className="cal-more">{t('+{count} more', { count: sorted.length - shown.length })}</div>}
    </>
  );
}

const legend = (
  <Space size={12} className="cal-legend">
    {STATUSES.map((s) => (
      <Badge key={s} status={STATUS_BADGE[s]} text={<T>{s}</T>} />
    ))}
  </Space>
);

export default function WorkSchedule() {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const canEdit = can('workSchedule', 'edit');
  const [day, setDay] = useState(() => dayjs());
  const [version, setVersion] = useState(0);

  const markDone = async (record, reload) => {
    try {
      await api.put(`/work-schedules/${record._id}`, { status: 'Done' });
      message.success(t('Marked as done'));
      reload();
      setVersion((v) => v + 1);
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const renderForm = (record) => (
    <Row gutter={16}>
      <Col xs={24}>
        <Form.Item name="title" label={t('Work')} rules={[{ required: true }]}>
          <Input placeholder={t('e.g. Front desk duty')} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="date" label={t('Date')} rules={[{ required: true }]}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="time" label={t('Time')} tooltip={t('Leave empty for all-day work')}>
          <TimePicker.RangePicker format="HH:mm" minuteStep={5} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="assignee" label={t('Staff')} rules={[{ required: true }]}>
          <RemoteSelect
            resource="users"
            labelOf={userLabel}
            placeholder={t('Search users')}
            initialOptions={
              record?.assignee
                ? [{ value: record.assignee._id, label: userLabel(record.assignee) }]
                : [{ value: user._id, label: userLabel(user) }]
            }
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="category" label={t('Category')}>
          <Select options={toOptions(CATEGORIES)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="status" label={t('Status')}>
          <Select options={toOptions(STATUSES)} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="location" label={t('Location')}>
          <Input />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="plan" label={t('Plan')}>
          <Input.TextArea rows={4} placeholder={t('What should be done')} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="record" label={t('Work Record')}>
          <Input.TextArea rows={4} placeholder={t('What was actually done, results, issues')} />
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <CalendarBoard title="Work Schedule" resource="work-schedules" value={day} onSelect={setDay} renderDay={renderDay} refreshKey={version} legend={legend} />
      <CrudPage
        title={day ? t('Schedule for {date}', { date: day.format('YYYY-MM-DD (dddd)') }) : 'All Scheduled Work'}
        resource="work-schedules"
        addText="Schedule Work"
        modalTitle={(r) => (r ? 'Edit Work Schedule / Record' : 'Schedule Work')}
        searchPlaceholder="Search work, location or records..."
        columns={columns}
        pageSize={20}
        dateFilter={{ label: 'Work date', value: day, onChange: setDay }}
        filters={[
          { name: 'assignee', placeholder: 'All Staff', options: [{ value: user._id, label: 'My schedule' }], width: 130 },
          { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
          { name: 'category', placeholder: 'All Categories', options: toOptions(CATEGORIES), width: 150 },
        ]}
        renderForm={renderForm}
        toForm={(r) => ({
          ...r,
          assignee: r.assignee?._id,
          date: dayjs(r.date),
          time: r.startTime ? [fromHHmm(r.startTime), r.endTime ? fromHHmm(r.endTime) : null] : null,
        })}
        fromForm={({ time, ...v }) => ({
          ...v,
          date: v.date.startOf('day').toISOString(),
          startTime: time?.[0] ? time[0].format('HH:mm') : null,
          endTime: time?.[1] ? time[1].format('HH:mm') : null,
        })}
        initialValues={{ date: day || dayjs(), category: 'Duty', status: 'Planned', assignee: user._id }}
        modalWidth={760}
        onMutate={() => setVersion((v) => v + 1)}
        rowActions={(record, reload) =>
          canEdit &&
          (record.status === 'Planned' || record.status === 'In Progress') && (
            <Tooltip title={t('Mark as done')}>
              <Button type="text" icon={<CheckOutlined />} style={{ color: '#16a34a' }} onClick={() => markDone(record, reload)} />
            </Tooltip>
          )
        }
      />
    </Space>
  );
}
