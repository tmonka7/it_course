import { useState } from 'react';
import { Avatar, Button, Col, DatePicker, Form, Input, Modal, Radio, Row, Select, Space, Tag, Tooltip } from 'antd';
import { ScanOutlined, UserOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import ImageUpload from '../components/ImageUpload';
import StudentFaces from '../components/StudentFaces';
import { useAuth } from '../context/AuthContext';
import { DEPARTMENTS, toOptions } from '../constants';
import { t } from '../i18n';

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
  { title: 'Grade Level', dataIndex: 'level', align: 'center' },
  { title: 'Email', dataIndex: 'email', responsive: ['xl'] },
  {
    title: 'Face',
    dataIndex: 'faceCount',
    align: 'center',
    width: 90,
    render: (count) => (
      <Tag color={count ? 'green' : 'default'} bordered={false}>
        {count ? t('{count} samples', { count }) : t('None')}
      </Tag>
    ),
  },
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
          <Form.Item name="name" label={t('Name')} rules={[{ required: true }]}>
            <Input placeholder={t('Enter student name')} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="gender" label={t('Gender')} rules={[{ required: true }]}>
            <Radio.Group options={toOptions(['Male', 'Female'])} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="studentId" label={t('ID')} rules={[{ required: true }]}>
            <Input placeholder={t('e.g. {example}', { example: 'CS20250001' })} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="major" label={t('Major')} rules={[{ required: true }]}>
            <Select placeholder={t('Select major')} options={toOptions(DEPARTMENTS)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="level" label={t('Grade Level')} rules={[{ required: true }]}>
            <Select placeholder={t('Select grade')} options={LEVELS.map((o) => ({ ...o, label: t(o.label) }))} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="email" label={t('Email')} rules={[{ type: 'email' }]}>
            <Input placeholder={t('Enter email address')} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="phone" label={t('Phone')}>
            <Input placeholder={t('Phone number')} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="status" label={t('Status')}>
            <Select options={toOptions(STATUSES)} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="birthDate" label={t('Date of birth')}>
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="enrollDate" label={t('Enrollment date')}>
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
  const { can } = useAuth();
  const [faces, setFaces] = useState(null); // the student whose face samples are open
  const [refreshKey, setRefreshKey] = useState(0);
  const canRegisterFaces = can('attendance', 'edit');

  return (
    <>
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
      refreshKey={refreshKey}
      rowActions={
        canRegisterFaces
          ? (record) => [
              <Tooltip key="faces" title={t('Face registration for automated attendance')}>
                <Button type="text" size="small" icon={<ScanOutlined />} onClick={() => setFaces(record)} aria-label={t('Face registration')} />
              </Tooltip>,
            ]
          : undefined
      }
    />
    <Modal
      open={!!faces}
      title={faces ? t('Face registration: {name}', { name: faces.name }) : ''}
      onCancel={() => {
        setFaces(null);
        setRefreshKey((k) => k + 1); // pick up the new sample count in the table
      }}
      footer={null}
      width={620}
      destroyOnClose
    >
      {faces && <StudentFaces student={faces} />}
    </Modal>
    </>
  );
}
