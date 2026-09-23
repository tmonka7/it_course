import { Col, DatePicker, Form, Input, Row, Select } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import { toOptions } from '../constants';
import { t } from '../i18n';

const TYPES = ['General', 'Event', 'Notice'];
const STATUSES = ['Published', 'Draft'];

const columns = [
  { title: 'Title', dataIndex: 'title' },
  { title: 'Type', dataIndex: 'type', render: (v) => <StatusTag value={v} /> },
  { title: 'Publish Date', dataIndex: 'publishDate', render: (v) => (v ? dayjs(v).format('YYYY-MM-DD') : '-') },
  { title: 'Author', dataIndex: 'author', responsive: ['lg'] },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const renderForm = () => (
  <Row gutter={16}>
    <Col xs={24}>
      <Form.Item name="title" label={t('Title')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="type" label={t('Type')}>
        <Select options={toOptions(TYPES)} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="publishDate" label={t('Publish Date')}>
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item name="status" label={t('Status')}>
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
    <Form.Item noStyle shouldUpdate={(a, b) => a.type !== b.type}>
      {({ getFieldValue }) =>
        getFieldValue('type') === 'Event' && (
          <>
            <Col xs={24} md={8}>
              <Form.Item name="eventDate" label={t('Event Date')} rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="eventTime" label={t('Event Time')}>
                <Input placeholder={t('e.g. {example}', { example: '09:00 - 12:00' })} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name="location" label={t('Location')}>
                <Input placeholder={t('e.g. Main Auditorium')} />
              </Form.Item>
            </Col>
          </>
        )
      }
    </Form.Item>
    <Col xs={24}>
      <Form.Item name="content" label={t('Content')}>
        <Input.TextArea rows={6} />
      </Form.Item>
    </Col>
  </Row>
);

export default function Announcements() {
  return (
    <CrudPage
      title="Announcements"
      resource="announcements"
      addText="New Announcement"
      modalTitle={(r) => (r ? 'Edit Announcement' : 'New Announcement')}
      searchPlaceholder="Search announcements..."
      columns={columns}
      filters={[
        { name: 'type', placeholder: 'All Types', options: toOptions(TYPES), width: 130 },
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({
        ...r,
        publishDate: r.publishDate ? dayjs(r.publishDate) : null,
        eventDate: r.eventDate ? dayjs(r.eventDate) : null,
      })}
      fromForm={(v) => ({
        ...v,
        publishDate: v.publishDate ? v.publishDate.toISOString() : undefined,
        eventDate: v.eventDate ? v.eventDate.startOf('day').toISOString() : undefined,
      })}
      initialValues={{ type: 'General', status: 'Published', publishDate: dayjs() }}
      modalWidth={720}
    />
  );
}
