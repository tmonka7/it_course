import { Alert, Col, Form, Input, Radio, Row, Select } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import { toOptions } from '../constants';
import { t } from '../i18n';

const AUDIENCES = ['All Students', 'All Faculty', 'All Users', 'Custom'];
const STATUSES = ['Draft', 'Sent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const columns = [
  { title: 'Subject', dataIndex: 'subject' },
  {
    title: 'To',
    dataIndex: 'audience',
    render: (v, r) => (v === 'Custom' ? r.recipients.join(', ') || '-' : t(v)),
    ellipsis: true,
    width: 240,
  },
  { title: 'Recipients', dataIndex: 'recipientCount', align: 'center', responsive: ['md'] },
  {
    title: 'Sender',
    dataIndex: 'sender',
    responsive: ['lg'],
    // Older records only have the name stamped when they were sent.
    render: (v, r) => (v ? `${v.name} (${v.username})` : r.sentBy || '-'),
  },
  { title: 'Sent At', dataIndex: 'sentAt', render: (v) => (v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-') },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
];

const renderForm = (record) => (
  <Row gutter={16}>
    <Col xs={24}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        message={t('Emails are recorded in the system only. Nothing is delivered to a mail server.')}
      />
    </Col>
    <Col xs={24}>
      <Form.Item name="audience" label={t('To')} rules={[{ required: true }]}>
        <Select options={toOptions(AUDIENCES)} disabled={record?.status === 'Sent'} />
      </Form.Item>
    </Col>
    <Form.Item noStyle shouldUpdate={(a, b) => a.audience !== b.audience}>
      {({ getFieldValue }) =>
        getFieldValue('audience') === 'Custom' && (
          <Col xs={24}>
            <Form.Item
              name="recipients"
              label={t('Email Addresses')}
              rules={[
                { required: true, message: t('Add at least one address') },
                {
                  validator: (_, list = []) => {
                    const bad = list.filter((e) => !EMAIL_RE.test(e));
                    return bad.length ? Promise.reject(new Error(t('Invalid address: {list}', { list: bad.join(', ') }))) : Promise.resolve();
                  },
                },
              ]}
            >
              <Select mode="tags" tokenSeparators={[',', ';', ' ']} placeholder={t('Type an address and press Enter')} open={false} />
            </Form.Item>
          </Col>
        )
      }
    </Form.Item>
    <Col xs={24}>
      <Form.Item name="subject" label={t('Subject')} rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="body" label={t('Message')}>
        <Input.TextArea rows={8} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="status" label={t('Action')}>
        <Radio.Group
          disabled={record?.status === 'Sent'}
          options={[
            { value: 'Draft', label: t('Save as draft') },
            { value: 'Sent', label: t('Send') },
          ]}
        />
      </Form.Item>
    </Col>
  </Row>
);

export default function Emails() {
  return (
    <CrudPage
      title="Email"
      resource="emails"
      addText="Compose"
      modalTitle={(r) => (r ? (r.status === 'Sent' ? 'Sent Email' : 'Edit Draft') : 'Compose Email')}
      searchPlaceholder="Search subject, message, address or sender..."
      columns={columns}
      filters={[
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
        { name: 'audience', placeholder: 'All Audiences', options: toOptions(AUDIENCES), width: 150 },
        { name: 'sender', placeholder: 'All Senders', resource: 'users', labelOf: (u) => `${u.name} (${u.username})`, width: 190 },
      ]}
      renderForm={renderForm}
      fromForm={(v) => ({ ...v, recipients: v.audience === 'Custom' ? v.recipients : [] })}
      initialValues={{ audience: 'All Students', status: 'Draft' }}
      modalWidth={720}
    />
  );
}
