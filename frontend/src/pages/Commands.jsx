import { App, Button, Col, DatePicker, Form, Input, Row, Select, Tooltip, Typography } from 'antd';
import { CheckCircleOutlined, PlayCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { toOptions } from '../constants';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const STATUSES = ['Issued', 'In Progress', 'Completed', 'Cancelled'];
const isOpen = (status) => status === 'Issued' || status === 'In Progress';

const columns = [
  { title: 'Command', dataIndex: 'title' },
  { title: 'Priority', dataIndex: 'priority', render: (v) => <StatusTag value={v} /> },
  { title: 'Assignee', dataIndex: ['assignee', 'name'], render: (v) => v || '-' },
  { title: 'Issued By', dataIndex: 'issuedBy', responsive: ['lg'] },
  {
    title: 'Due Date',
    dataIndex: 'dueDate',
    render: (v, r) => {
      if (!v) return '-';
      const overdue = isOpen(r.status) && dayjs(v).isBefore(dayjs(), 'day');
      return <Typography.Text type={overdue ? 'danger' : undefined}>{dayjs(v).format('YYYY-MM-DD')}{overdue ? ' (overdue)' : ''}</Typography.Text>;
    },
  },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const userLabel = (u) => `${u.name} (${u.username})`;

export default function Commands() {
  const { message } = App.useApp();
  const { user, isAdmin } = useAuth();

  const setStatus = async (record, status, reload) => {
    try {
      await api.put(`/commands/${record._id}`, { status });
      message.success(`Command marked as ${status.toLowerCase()}`);
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const renderForm = (record) => (
    <Row gutter={16}>
      <Col xs={24}>
        <Form.Item name="title" label="Command" rules={[{ required: true }]}>
          <Input placeholder="e.g. Prepare midterm exam rooms" />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="assignee" label="Assign To" rules={[{ required: true }]}>
          {isAdmin ? (
            <RemoteSelect
              resource="users"
              labelOf={userLabel}
              params={{ status: 'Active' }}
              placeholder="Search users"
              initialOptions={record?.assignee ? [{ value: record.assignee._id, label: userLabel(record.assignee) }] : []}
            />
          ) : (
            // Only admins can list users; staff can issue commands to themselves.
            <Select options={[{ value: user._id, label: userLabel(user) }]} />
          )}
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="priority" label="Priority">
          <Select options={toOptions(PRIORITIES)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="dueDate" label="Due Date">
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="status" label="Status">
          <Select options={toOptions(STATUSES)} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="content" label="Details / Instructions">
          <Input.TextArea rows={5} />
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <CrudPage
      title="Commands"
      resource="commands"
      addText="Issue Command"
      modalTitle={(r) => (r ? 'Edit Command' : 'Issue Command')}
      searchPlaceholder="Search commands..."
      columns={columns}
      filters={[
        { name: 'assignee', placeholder: 'All Assignees', options: [{ value: user._id, label: 'Assigned to me' }], width: 150 },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 140 },
        { name: 'priority', placeholder: 'All Priorities', options: toOptions(PRIORITIES), width: 140 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, assignee: r.assignee?._id, dueDate: r.dueDate ? dayjs(r.dueDate) : null })}
      fromForm={(v) => ({ ...v, dueDate: v.dueDate ? v.dueDate.endOf('day').toISOString() : null })}
      initialValues={{ priority: 'Normal', status: 'Issued', assignee: isAdmin ? undefined : user._id }}
      modalWidth={720}
      rowActions={(record, reload) => (
        <>
          {record.status === 'Issued' && (
            <Tooltip title="Start">
              <Button type="text" icon={<PlayCircleOutlined />} style={{ color: '#d97706' }} onClick={() => setStatus(record, 'In Progress', reload)} />
            </Tooltip>
          )}
          {isOpen(record.status) && (
            <Tooltip title="Mark completed">
              <Button type="text" icon={<CheckCircleOutlined />} style={{ color: '#16a34a' }} onClick={() => setStatus(record, 'Completed', reload)} />
            </Tooltip>
          )}
        </>
      )}
    />
  );
}
