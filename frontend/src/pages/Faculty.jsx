import { Col, Form, Input, Row, Select } from 'antd';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import { DEPARTMENTS, POSITIONS, toOptions } from '../constants';
import { t } from '../i18n';

const STATUSES = ['Active', 'On Leave', 'Inactive'];

const columns = [
  { title: 'ID', dataIndex: 'facultyId' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Department', dataIndex: 'department' },
  { title: 'Position', dataIndex: 'position' },
  { title: 'Email', dataIndex: 'email' },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const renderForm = () => (
  <Row gutter={16}>
    <Col xs={24} md={12}>
      <Form.Item name="facultyId" label={t('Faculty ID')} rules={[{ required: true }]}>
        <Input placeholder={t('e.g. {example}', { example: 'F001' })} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="department" label={t('Department')} rules={[{ required: true }]}>
        <Select options={toOptions(DEPARTMENTS)} />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="position" label={t('Position')} rules={[{ required: true }]}>
        <Select options={toOptions(POSITIONS)} />
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
      <Form.Item name="status" label={t('Status')}>
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
  </Row>
);

export default function Faculty() {
  return (
    <CrudPage
      title="Faculty Management"
      resource="faculty"
      addText="Add Faculty"
      modalTitle={(r) => (r ? 'Edit Faculty' : 'Add Faculty')}
      searchPlaceholder="Search by name, department, or email..."
      columns={columns}
      filters={[
        { name: 'department', placeholder: 'All Departments', options: toOptions(DEPARTMENTS) },
        { name: 'position', placeholder: 'All Positions', options: toOptions(POSITIONS) },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
      ]}
      renderForm={renderForm}
      initialValues={{ status: 'Active', position: 'Lecturer' }}
    />
  );
}
