import { Avatar, Col, DatePicker, Form, Input, Radio, Row, Select, Space } from 'antd';
import { UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import ImageUpload from '../components/ImageUpload';
import { DEPARTMENTS, toOptions } from '../constants';

const STATUSES = ['Active', 'Inactive', 'Graduated', 'Suspended'];
const LEVELS = [1, 2, 3, 4].map((v) => ({ label: `Grade ${v}`, value: v }));

const columns = [
  { title: 'ID', dataIndex: 'studentId' },
  {
    title: 'Name',
    dataIndex: 'name',
    render: (name, r) => (
      <Space>
        <Avatar size="small" src={r.photo || undefined} icon={!r.photo && <UserOutlined />} />
        {name}
      </Space>
    ),
  },
  { title: 'Gender', dataIndex: 'gender' },
  { title: 'Major', dataIndex: 'major' },
  { title: 'Grade', dataIndex: 'level', align: 'center' },
  { title: 'Email', dataIndex: 'email', responsive: ['xl'] },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const renderForm = () => (
  <Row gutter={24}>
    <Col xs={24} sm={7} style={{ textAlign: 'center', marginBottom: 16 }}>
      <Form.Item name="photo" noStyle>
        <ImageUpload />
      </Form.Item>
    </Col>
    <Col xs={24} sm={17}>
      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Enter student name" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="gender" label="Gender" rules={[{ required: true }]}>
            <Radio.Group options={['Male', 'Female']} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="studentId" label="ID" rules={[{ required: true }]}>
            <Input placeholder="e.g. CS20250001" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="major" label="Major" rules={[{ required: true }]}>
            <Select placeholder="Select major" options={toOptions(DEPARTMENTS)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="level" label="Grade" rules={[{ required: true }]}>
            <Select placeholder="Select grade" options={LEVELS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="email" label="Email" rules={[{ type: 'email' }]}>
            <Input placeholder="Enter email address" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="phone" label="Phone">
            <Input placeholder="Phone number" />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="status" label="Status">
            <Select options={toOptions(STATUSES)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="birthDate" label="Date of birth">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="enrollDate" label="Enrollment date">
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
    </Col>
  </Row>
);

const toForm = (r) => ({
  ...r,
  birthDate: r.birthDate ? dayjs(r.birthDate) : null,
  enrollDate: r.enrollDate ? dayjs(r.enrollDate) : null,
});

const fromForm = (v) => ({
  ...v,
  photo: v.photo || null,
  birthDate: v.birthDate ? v.birthDate.toISOString() : null,
  enrollDate: v.enrollDate ? v.enrollDate.toISOString() : undefined,
});

export default function Students() {
  return (
    <CrudPage
      title="Student Management"
      resource="students"
      addText="Add Student"
      modalTitle={(r) => (r ? 'Edit Student' : 'Add Student')}
      searchPlaceholder="Search by name, ID, or major..."
      columns={columns}
      filters={[
        { name: 'major', placeholder: 'All Majors', options: toOptions(DEPARTMENTS) },
        { name: 'level', placeholder: 'All Grades', options: LEVELS, width: 130 },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
      ]}
      renderForm={renderForm}
      toForm={toForm}
      fromForm={fromForm}
      initialValues={{ gender: 'Male', level: 1, status: 'Active', enrollDate: dayjs() }}
      modalWidth={820}
    />
  );
}
