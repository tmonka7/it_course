import { useEffect, useState } from 'react';
import { App, Button, Col, Form, InputNumber, Row, Select } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { SEMESTERS, academicYears, toOptions } from '../constants';
import api, { errMsg } from '../api';

const YEARS = academicYears();

const columns = [
  { title: 'Student ID', dataIndex: ['student', 'studentId'] },
  { title: 'Name', dataIndex: ['student', 'name'] },
  { title: 'Course', dataIndex: 'course', render: (c) => (c ? `${c.code} ${c.name}` : '-') },
  { title: 'Year', dataIndex: 'academicYear' },
  { title: 'Semester', dataIndex: 'semester' },
  { title: 'Score', dataIndex: 'score', align: 'center' },
  { title: 'Grade', dataIndex: 'grade', align: 'center', render: (g) => <strong>{g}</strong> },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const csvCell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

function ExportButton({ query }) {
  const { message } = App.useApp();
  const [loading, setLoading] = useState(false);

  const exportCsv = async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/grades', { params: { ...query, pageSize: 1000 } });
      const header = ['Student ID', 'Name', 'Course Code', 'Course', 'Academic Year', 'Semester', 'Score', 'Grade', 'Status'];
      const rows = data.items.map((g) => [
        g.student?.studentId,
        g.student?.name,
        g.course?.code,
        g.course?.name,
        g.academicYear,
        g.semester,
        g.score,
        g.grade,
        g.status,
      ]);
      const csv = [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = `grades-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      if (data.total > data.items.length) message.warning(`Exported the first ${data.items.length} of ${data.total} records`);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button icon={<DownloadOutlined />} loading={loading} onClick={exportCsv}>
      Export
    </Button>
  );
}

export default function Grades() {
  const [courseOptions, setCourseOptions] = useState([]);

  useEffect(() => {
    api
      .get('/courses', { params: { pageSize: 1000 } })
      .then(({ data }) => setCourseOptions(data.items.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))))
      .catch(() => {});
  }, []);

  const renderForm = (record) => (
    <Row gutter={16}>
      <Col xs={24}>
        <Form.Item name="student" label="Student" rules={[{ required: true }]}>
          <RemoteSelect
            resource="students"
            labelOf={(s) => `${s.studentId} - ${s.name}`}
            placeholder="Search by name or student ID"
            initialOptions={record?.student ? [{ value: record.student._id, label: `${record.student.studentId} - ${record.student.name}` }] : []}
          />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="course" label="Course" rules={[{ required: true }]}>
          <Select showSearch optionFilterProp="label" options={courseOptions} placeholder="Select course" />
        </Form.Item>
      </Col>
      <Col xs={24} md={8}>
        <Form.Item name="academicYear" label="Academic Year" rules={[{ required: true }]}>
          <Select options={toOptions(YEARS)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="semester" label="Semester" rules={[{ required: true }]}>
          <Select options={toOptions(SEMESTERS)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={8}>
        <Form.Item name="score" label="Score" rules={[{ required: true }]} extra="Letter grade is calculated automatically">
          <InputNumber min={0} max={100} style={{ width: '100%' }} />
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <CrudPage
      title="Grades & Records"
      resource="grades"
      addText="Add Record"
      modalTitle={(r) => (r ? 'Edit Grade Record' : 'Add Grade Record')}
      searchPlaceholder="Search by student name or ID..."
      columns={columns}
      filters={[
        { name: 'academicYear', placeholder: 'All Years', options: toOptions(YEARS), width: 130 },
        { name: 'semester', placeholder: 'All Semesters', options: toOptions(SEMESTERS), width: 140 },
        { name: 'course', placeholder: 'All Courses', options: courseOptions, width: 200 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, student: r.student?._id, course: r.course?._id })}
      fromForm={(v) => ({ student: v.student, course: v.course, academicYear: v.academicYear, semester: v.semester, score: v.score })}
      initialValues={{ academicYear: YEARS[0], semester: 'Fall' }}
      toolbarExtra={({ query }) => <ExportButton query={query} />}
    />
  );
}
