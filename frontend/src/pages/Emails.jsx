import { Alert, Col, Form, Input, Radio, Row, Select } from 'antd';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import { toOptions } from '../constants';

const AUDIENCES = ['All Students', 'All Faculty', 'All Users', 'Custom'];
const STATUSES = ['Draft', 'Sent'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const columns = [
  { title: 'Subject', dataIndex: 'subject' },
  {
    title: 'To',
    dataIndex: 'audience',
    render: (v, r) => (v === 'Custom' ? r.recipients.join(', ') || '-' : v),
    ellipsis: true,
    width: 240,
  },
  { title: 'Recipients', dataIndex: 'recipientCount', align: 'center', responsive: ['md'] },
  { title: 'Sent By', dataIndex: 'sentBy', responsive: ['lg'], render: (v) => v || '-' },
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
        message="Emails are recorded in the system only. Nothing is delivered to a mail server."
      />
    </Col>
    <Col xs={24}>
      <Form.Item name="audience" label="To" rules={[{ required: true }]}>
        <Select options={toOptions(AUDIENCES)} disabled={record?.status === 'Sent'} />
      </Form.Item>
    </Col>
    <Form.Item noStyle shouldUpdate={(a, b) => a.audience !== b.audience}>
      {({ getFieldValue }) =>
        getFieldValue('audience') === 'Custom' && (
          <Col xs={24}>
            <Form.Item
              name="recipients"
              label="Email Addresses"
              rules={[
                { required: true, message: 'Add at least one address' },
                {
                  validator: (_, list = []) => {
                    const bad = list.filter((e) => !EMAIL_RE.test(e));
                    return bad.length ? Promise.reject(new Error(`Invalid address: ${bad.join(', ')}`)) : Promise.resolve();
                  },
                },
              ]}
            >
              <Select mode="tags" tokenSeparators={[',', ';', ' ']} placeholder="Type an address and press Enter" open={false} />
            </Form.Item>
          </Col>
        )
      }
    </Form.Item>
    <Col xs={24}>
      <Form.Item name="subject" label="Subject" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="body" label="Message">
        <Input.TextArea rows={8} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="status" label="Action">
        <Radio.Group
          disabled={record?.status === 'Sent'}
          options={[
            { value: 'Draft', label: 'Save as draft' },
            { value: 'Sent', label: 'Send' },
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
      searchPlaceholder="Search subject, message or address..."
      columns={columns}
      filters={[
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 130 },
        { name: 'audience', placeholder: 'All Audiences', options: toOptions(AUDIENCES), width: 150 },
      ]}
      renderForm={renderForm}
      fromForm={(v) => ({ ...v, recipients: v.audience === 'Custom' ? v.recipients : [] })}
      initialValues={{ audience: 'All Students', status: 'Draft' }}
      modalWidth={720}
    />
  );
}
