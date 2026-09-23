import { Col, Form, Input, InputNumber, Row, Select } from 'antd';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { DEPARTMENTS, toOptions } from '../constants';

const STATUSES = ['Active', 'Inactive'];

const columns = [
  { title: 'Code', dataIndex: 'code' },
  { title: 'Course Name', dataIndex: 'name' },
  { title: 'Department', dataIndex: 'department' },
  { title: 'Credits', dataIndex: 'credits', align: 'center' },
  { title: 'Instructor', dataIndex: ['instructor', 'name'], render: (v) => v || '-' },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const facultyLabel = (f) => `${f.name} (${f.facultyId})`;

const renderForm = (record) => (
  <Row gutter={16}>
    <Col xs={24} md={8}>
      <Form.Item name="code" label="Code" rules={[{ required: true }]}>
        <Input placeholder="e.g. CS101" />
      </Form.Item>
    </Col>
    <Col xs={24} md={16}>
      <Form.Item name="name" label="Course Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="department" label="Department" rules={[{ required: true }]}>
        <Select options={toOptions(DEPARTMENTS)} />
      </Form.Item>
    </Col>
    <Col xs={12} md={6}>
      <Form.Item name="credits" label="Credits" rules={[{ required: true }]}>
        <InputNumber min={0} max={10} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={12} md={6}>
      <Form.Item name="status" label="Status">
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="instructor" label="Instructor">
        <RemoteSelect
          resource="faculty"
          labelOf={facultyLabel}
          allowClear
          placeholder="Search faculty"
          initialOptions={record?.instructor ? [{ value: record.instructor._id, label: record.instructor.name }] : []}
        />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="description" label="Description">
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
  </Row>
);

export default function Courses() {
  return (
    <CrudPage
      title="Course Management"
      resource="courses"
      addText="Add Course"
      modalTitle={(r) => (r ? 'Edit Course' : 'Add Course')}
      searchPlaceholder="Search course name or code..."
      columns={columns}
      filters={[
        { name: 'department', placeholder: 'All Departments', options: toOptions(DEPARTMENTS) },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, instructor: r.instructor?._id })}
      fromForm={(v) => ({ ...v, instructor: v.instructor || null })}
      initialValues={{ credits: 3, status: 'Active' }}
    />
  );
}
