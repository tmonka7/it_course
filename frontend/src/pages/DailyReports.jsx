import { useState } from 'react';
import { App, Button, Col, DatePicker, Form, Input, Row, Select, Tooltip } from 'antd';
import { CheckOutlined, HistoryOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { DEPARTMENTS, toOptions } from '../constants';

const STATUSES = ['Draft', 'Submitted', 'Reviewed'];
const REPORT_DEPARTMENTS = ['Administration', ...DEPARTMENTS];

const columns = [
  { title: 'Date', dataIndex: 'date', render: (v) => dayjs(v).format('YYYY-MM-DD'), width: 120 },
  { title: 'Reporter', dataIndex: 'reporter' },
  { title: 'Department', dataIndex: 'department', responsive: ['md'] },
  {
    title: 'Work Done',
    dataIndex: 'workDone',
    ellipsis: true,
    width: 320,
    render: (v) => (
      <Tooltip title={<span style={{ whiteSpace: 'pre-line' }}>{v}</span>}>
        <span>{v?.split('\n')[0]}</span>
      </Tooltip>
    ),
  },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

// Pre-fills "Work Done" with the activity log entries for the selected date.
function FillFromActivity() {
  const { message } = App.useApp();
  const { getFieldValue, setFieldsValue } = Form.useFormInstance();
  const [loading, setLoading] = useState(false);

  const fill = async () => {
    const date = getFieldValue('date') || dayjs();
    setLoading(true);
    try {
      const { data } = await api.get('/dashboard/activities', { params: { date: date.format('YYYY-MM-DD') } });
      if (!data.length) {
        message.info('No activity recorded on that day');
        return;
      }
      const lines = data
        .slice()
        .reverse()
        .map((a) => `- ${dayjs(a.createdAt).format('HH:mm')} ${a.action}${a.details ? `: ${a.details}` : ''} (${a.user})`);
      const current = getFieldValue('workDone');
      setFieldsValue({ workDone: [current, ...lines].filter(Boolean).join('\n') });
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button size="small" icon={<HistoryOutlined />} loading={loading} onClick={fill}>
      Fill from activity log
    </Button>
  );
}

const renderForm = () => (
  <Row gutter={16}>
    <Col xs={24} md={8}>
      <Form.Item name="date" label="Date" rules={[{ required: true }]}>
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="department" label="Department">
        <Select options={toOptions(REPORT_DEPARTMENTS)} allowClear />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="status" label="Status">
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item
        name="workDone"
        label={
          <span style={{ display: 'inline-flex', gap: 12, alignItems: 'center' }}>
            Work Done <FillFromActivity />
          </span>
        }
        rules={[{ required: true }]}
      >
        <Input.TextArea rows={6} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="issues" label="Issues / Problems">
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="planTomorrow" label="Plan for Tomorrow">
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
  </Row>
);

export default function DailyReports() {
  const { message } = App.useApp();
  const { isAdmin } = useAuth();

  const markReviewed = async (record, reload) => {
    try {
      await api.put(`/daily-reports/${record._id}`, { status: 'Reviewed' });
      message.success('Report marked as reviewed');
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  return (
    <CrudPage
      title="Daily Reports"
      resource="daily-reports"
      addText="New Report"
      modalTitle={(r) => (r ? 'Edit Daily Report' : 'New Daily Report')}
      searchPlaceholder="Search reporter or content..."
      columns={columns}
      filters={[
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
        { name: 'department', placeholder: 'All Departments', options: toOptions(REPORT_DEPARTMENTS) },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, date: r.date ? dayjs(r.date) : null })}
      fromForm={(v) => ({ ...v, date: v.date.startOf('day').toISOString() })}
      initialValues={{ date: dayjs(), status: 'Draft', department: 'Administration' }}
      modalWidth={760}
      rowActions={(record, reload) =>
        isAdmin &&
        record.status === 'Submitted' && (
          <Tooltip title="Mark as reviewed">
            <Button type="text" icon={<CheckOutlined />} style={{ color: '#16a34a' }} onClick={() => markReviewed(record, reload)} />
          </Tooltip>
        )
      }
    />
  );
}
