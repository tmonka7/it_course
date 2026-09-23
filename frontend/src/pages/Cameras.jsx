import { App, Badge, Button, Col, DatePicker, Form, Input, Row, Select, Tooltip, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import { toOptions } from '../constants';

const TYPES = ['Indoor', 'Outdoor', 'PTZ'];
const RESOLUTIONS = ['720p', '1080p', '2K', '4K'];
const STATUSES = ['Online', 'Offline', 'Maintenance'];
const STATUS_BADGE = { Online: 'success', Offline: 'error', Maintenance: 'warning' };

function StreamUrl({ url }) {
  const { message } = App.useApp();
  if (!url) return '-';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <Typography.Text code style={{ maxWidth: 220 }} ellipsis={{ tooltip: url }}>
        {url}
      </Typography.Text>
      <Tooltip title="Copy stream URL">
        <Button
          type="text"
          size="small"
          icon={<CopyOutlined />}
          onClick={() => navigator.clipboard?.writeText(url).then(() => message.success('Copied'), () => message.error('Copy failed'))}
        />
      </Tooltip>
    </span>
  );
}

const columns = [
  { title: 'Camera ID', dataIndex: 'cameraId' },
  { title: 'Name', dataIndex: 'name' },
  { title: 'Location', dataIndex: 'location' },
  { title: 'Type', dataIndex: 'type', responsive: ['md'] },
  { title: 'Resolution', dataIndex: 'resolution', responsive: ['lg'] },
  { title: 'IP Address', dataIndex: 'ipAddress', responsive: ['lg'] },
  { title: 'Stream', dataIndex: 'streamUrl', responsive: ['xl'], render: (v) => <StreamUrl url={v} /> },
  { title: 'Status', dataIndex: 'status', render: (v) => <Badge status={STATUS_BADGE[v] || 'default'} text={v} /> },
];

const renderForm = () => (
  <Row gutter={16}>
    <Col xs={24} md={8}>
      <Form.Item name="cameraId" label="Camera ID" rules={[{ required: true }]}>
        <Input placeholder="e.g. CAM-009" />
      </Form.Item>
    </Col>
    <Col xs={24} md={16}>
      <Form.Item name="name" label="Name" rules={[{ required: true }]}>
        <Input />
      </Form.Item>
    </Col>
    <Col xs={24} md={12}>
      <Form.Item name="location" label="Location" rules={[{ required: true }]}>
        <Input placeholder="e.g. Building A, Lobby" />
      </Form.Item>
    </Col>
    <Col xs={12} md={6}>
      <Form.Item name="type" label="Type">
        <Select options={toOptions(TYPES)} />
      </Form.Item>
    </Col>
    <Col xs={12} md={6}>
      <Form.Item name="resolution" label="Resolution">
        <Select options={toOptions(RESOLUTIONS)} />
      </Form.Item>
    </Col>
    <Col xs={24} md={8}>
      <Form.Item
        name="ipAddress"
        label="IP Address"
        rules={[{ pattern: /^(\d{1,3}\.){3}\d{1,3}$/, message: 'Enter a valid IPv4 address' }]}
      >
        <Input placeholder="192.168.10.101" />
      </Form.Item>
    </Col>
    <Col xs={24} md={16}>
      <Form.Item name="streamUrl" label="Stream URL">
        <Input placeholder="rtsp://192.168.10.101:554/stream1" />
      </Form.Item>
    </Col>
    <Col xs={12} md={8}>
      <Form.Item name="status" label="Status">
        <Select options={toOptions(STATUSES)} />
      </Form.Item>
    </Col>
    <Col xs={12} md={8}>
      <Form.Item name="installedDate" label="Installed Date">
        <DatePicker style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col xs={24}>
      <Form.Item name="notes" label="Notes">
        <Input.TextArea rows={3} />
      </Form.Item>
    </Col>
  </Row>
);

export default function Cameras() {
  return (
    <CrudPage
      title="Camera Management"
      resource="cameras"
      addText="Add Camera"
      modalTitle={(r) => (r ? 'Edit Camera' : 'Add Camera')}
      searchPlaceholder="Search camera ID, name, location or IP..."
      columns={columns}
      filters={[
        { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 140 },
        { name: 'type', placeholder: 'All Types', options: toOptions(TYPES), width: 130 },
      ]}
      renderForm={renderForm}
      toForm={(r) => ({ ...r, installedDate: r.installedDate ? dayjs(r.installedDate) : null })}
      fromForm={(v) => ({ ...v, installedDate: v.installedDate ? v.installedDate.toISOString() : null })}
      initialValues={{ type: 'Indoor', resolution: '1080p', status: 'Online' }}
      modalWidth={720}
    />
  );
}
