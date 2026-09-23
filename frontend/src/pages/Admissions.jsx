import { App, Button, Col, DatePicker, Form, Input, Row, Select, Tooltip } from 'antd';
import { CheckCircleOutlined, CloseCircleOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import { useAuth } from '../context/AuthContext';
import StatusTag from '../components/StatusTag';
import { PROGRAMS, toOptions } from '../constants';
import api, { errMsg } from '../api';
import { t } from '../i18n';

const STATUSES = ['Pending', 'Accepted', 'Rejected'];

const columns = [
  { title: 'Application ID', dataIndex: 'applicationId' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Program', dataIndex: 'program' },
  { title: 'Applied Date', dataIndex: 'appliedDate', render: (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-') },
  { title: 'Email', dataIndex: 'email', responsive: ['xl'] },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const renderForm = (record) => (
  <Row gutter={16}>
    {record && (
      <Col xs={24} md={12}>
        <Form.Item name="applicationId" label={t('Application ID')}>
          <Input disabled />
        </Form.Item>
      </Col>
    )}
    <Col xs={24} md={12}>
      <Form.Item name="name" label={t('Applicant Name')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="email" label={t('Email')} rules={[{ type: 'email' }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="phone" label={t('Phone')}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="program" label={t('Program')} rules={[{ required: true }]}>
        <Select options={toOptions(PROGRAMS)} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="appliedDate" label={t('Applied Date')}>
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="status" label={t('Status')}>
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="notes" label={t('Notes')}>
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
  </Row>
);

function Decision({ record, reload }) {
  const { message } = App.useApp();
  const { can } = useAuth();
  if (record.status !== 'Pending' || !can('admissions', 'edit')) return null;

  const decide = async (status) => {
    try {
      await api.put(`/admissions/${record._id}`, { status });
      message.success(status === 'Accepted' ? t('Application accepted') : t('Application rejected'));
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  return (
    <>
      <Tooltip title={t('Accept')}>
        <Button type="text" icon={<CheckCircleOutlined style={{ color: '#52c41a' }} />} onClick={() => decide('Accepted')} />
      </Tooltip>
      <Tooltip title={t('Reject')}>
        <Button type="text" icon={<CloseCircleOutlined style={{ color: '#ff4d4f' }} />} onClick={() => decide('Rejected')} />
      </Tooltip>
    </>
  );
}

export default function Admissions() {
  return (
    <CrudPage
      title="Admissions Management"
      resource="admissions"
      addText="New Application"
      modalTitle={(r) => (r ? 'Edit Application' : 'New Application')}
      searchPlaceholder="Search by name or application ID..."
      columns={columns}
      filters={[
        { name: 'program', placeholder: 'All Programs', options: toOptions(PROGRAMS) },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, appliedDate: r.appliedDate ? dayjs(r.appliedDate) : null })}
      fromForm={(v) => {
        const { applicationId, ...rest } = v; // server-assigned, never edited
        return { ...rest, appliedDate: v.appliedDate ? v.appliedDate.toISOString() : undefined };
      }}
      initialValues={{ status: 'Pending', appliedDate: dayjs() }}
      rowActions={(record, reload) => <Decision record={record} reload={reload} />}
    />
  );
}
