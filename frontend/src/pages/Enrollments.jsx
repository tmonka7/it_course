import { useEffect, useState } from 'react';
import { App, Button, Col, Form, Modal, Row, Select, Space, Tag, Typography } from 'antd';
import { TeamOutlined } from '@ant-design/icons';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { DEPARTMENTS, SEMESTERS, academicYears, toOptions } from '../constants';
import api, { errMsg } from '../api';
import { t } from '../i18n';

const YEARS = academicYears();

const columns = [
  { title: 'Student ID', dataIndex: ['student', 'studentId'] },
  { title: 'Name', dataIndex: ['student', 'name'] },
  { title: 'Course', dataIndex: 'course', render: (c) => (c ? `${c.code} ${c.name}` : '-') },
  { title: 'Year', dataIndex: 'academicYear' },
  { title: 'Semester', dataIndex: 'semester', render: (v) => t(v) },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

/**
 * Enrols a whole group of students on one course in a single step, so a class roster does not have
 * to be entered student by student. Existing enrolments are left alone.
 */
function EnrolClassButton({ courseOptions, onDone }) {
  const { message } = App.useApp();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const [preview, setPreview] = useState(null);

  const loadPreview = async (values) => {
    if (!values.major && !values.level) {
      setPreview(null);
      return;
    }
    try {
      const { data } = await api.get('/students', {
        params: { pageSize: 1000, status: 'Active', ...(values.major ? { major: values.major } : {}), ...(values.level ? { level: values.level } : {}) },
      });
      setPreview(data.items);
    } catch {
      setPreview(null);
    }
  };

  const submit = async (values) => {
    if (!preview?.length) {
      message.warning(t('No students match that group'));
      return;
    }
    setSaving(true);
    let created = 0;
    let skipped = 0;
    // One request per student: the API refuses duplicates, which is exactly the "leave existing
    // enrolments alone" rule, so a rejected row is a skip rather than a failure.
    for (const student of preview) {
      try {
        await api.post('/enrollments', {
          student: student._id,
          course: values.course,
          academicYear: values.academicYear,
          semester: values.semester,
          status: 'Enrolled',
        });
        created += 1;
      } catch {
        skipped += 1;
      }
    }
    setSaving(false);
    setOpen(false);
    message.success(t('Enrolled {count} student(s); {skipped} already enrolled', { count: created, skipped }));
    onDone?.();
  };

  return (
    <>
      <Button icon={<TeamOutlined />} onClick={() => setOpen(true)}>
        {t('Enrol a group')}
      </Button>
      <Modal
        open={open}
        title={t('Enrol a group of students')}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        okText={t('Enrol')}
        cancelText={t('Cancel')}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ academicYear: YEARS[0], semester: 'Fall' }}
          onFinish={submit}
          onValuesChange={(_, values) => loadPreview(values)}
        >
          <Form.Item name="course" label={t('Course')} rules={[{ required: true }]}>
            <Select showSearch optionFilterProp="label" options={courseOptions} placeholder={t('Select course')} />
          </Form.Item>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="academicYear" label={t('Academic Year')} rules={[{ required: true }]}>
                <Select options={toOptions(YEARS)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="semester" label={t('Semester')} rules={[{ required: true }]}>
                <Select options={toOptions(SEMESTERS)} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col span={12}>
              <Form.Item name="major" label={t('Major')}>
                <Select allowClear placeholder={t('Any major')} options={toOptions(DEPARTMENTS)} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="level" label={t('Grade')}>
                <Select allowClear placeholder={t('Any grade')} options={[1, 2, 3, 4].map((v) => ({ value: String(v), label: t('Grade {level}', { level: v }) }))} />
              </Form.Item>
            </Col>
          </Row>
          {preview && (
            <Tag color={preview.length ? 'blue' : 'default'} bordered={false}>
              {t('{count} student(s) match', { count: preview.length })}
            </Tag>
          )}
          <Typography.Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0, fontSize: 12 }}>
            {t('Pick a major and/or grade to choose who to enrol. Students already enrolled on this course are left unchanged.')}
          </Typography.Paragraph>
        </Form>
      </Modal>
    </>
  );
}

/** Course enrolments: the roster automated attendance is taken against. */
export default function Enrollments() {
  const [courseOptions, setCourseOptions] = useState([]);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    api
      .get('/courses', { params: { pageSize: 1000 } })
      .then(({ data }) => setCourseOptions(data.items.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))))
      .catch(() => {});
  }, []);

  const renderForm = (record) => (
    <Row gutter={16}>
      <Col xs={24}>
        <Form.Item name="student" label={t('Student')} rules={[{ required: true }]}>
          <RemoteSelect
            resource="students"
            labelOf={(s) => `${s.studentId} - ${s.name}`}
            placeholder={t('Search by name or student ID')}
            initialOptions={record?.student ? [{ value: record.student._id, label: `${record.student.studentId} - ${record.student.name}` }] : []}
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="course" label={t('Course')} rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={courseOptions} placeholder={t('Select course')} />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="academicYear" label={t('Academic Year')} rules={[{ required: true }]}>
          <Select options={toOptions(YEARS)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="semester" label={t('Semester')} rules={[{ required: true }]}>
          <Select options={toOptions(SEMESTERS)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="status" label={t('Status')}>
          <Select options={toOptions(['Enrolled', 'Withdrawn', 'Completed'])} />
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <CrudPage
      title="Course Enrollments"
      resource="enrollments"
      addText="Add Enrollment"
      modalTitle={(r) => (r ? 'Edit Enrollment' : 'Add Enrollment')}
      searchPlaceholder="Search by student name or ID..."
      columns={columns}
      refreshKey={refreshKey}
      filters={[
        { name: 'academicYear', placeholder: 'All Years', options: toOptions(YEARS), width: 130 },
        { name: 'semester', placeholder: 'All Semesters', options: toOptions(SEMESTERS), width: 140 },
        { name: 'course', placeholder: 'All Courses', options: courseOptions, width: 200 },
        { name: 'status', placeholder: 'All Statuses', options: toOptions(['Enrolled', 'Withdrawn', 'Completed']), width: 150 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, student: r.student?._id, course: r.course?._id })}
      fromForm={(v) => ({ student: v.student, course: v.course, academicYear: v.academicYear, semester: v.semester, status: v.status })}
      initialValues={{ academicYear: YEARS[0], semester: 'Fall', status: 'Enrolled' }}
      toolbarExtra={() => (
        <Space>
          <EnrolClassButton courseOptions={courseOptions} onDone={() => setRefreshKey((k) => k + 1)} />
        </Space>
      )}
    />
  );
}
