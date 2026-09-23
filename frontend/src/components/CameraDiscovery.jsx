import { useEffect, useState } from 'react';
import { Alert, App, Button, Checkbox, Empty, Input, Modal, Space, Table, Tag, Typography } from 'antd';
import { RadarChartOutlined } from '@ant-design/icons';
import api, { errMsg } from '../api';

/**
 * Scans the LAN for IP cameras (ONVIF WS-Discovery + RTSP port scan on the server) and adds the selected ones.
 */
export default function CameraDiscovery({ open, onClose, onAdded }) {
  const { message } = App.useApp();
  const [subnets, setSubnets] = useState([]);
  const [subnet, setSubnet] = useState('');
  const [methods, setMethods] = useState(['onvif', 'rtsp']);
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState(null);
  const [rows, setRows] = useState({}); // ip -> editable fields
  const [selected, setSelected] = useState([]);
  const [creds, setCreds] = useState({ rtspUser: '', rtspPassword: '' });
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setSelected([]);
    api
      .get('/camera-discovery')
      .then(({ data }) => setSubnets(data.subnets))
      .catch(() => {});
  }, [open]);

  const scan = async () => {
    setScanning(true);
    setResult(null);
    setSelected([]);
    try {
      const { data } = await api.post(
        '/camera-discovery/scan',
        { subnet: subnet.trim() || undefined, onvif: methods.includes('onvif'), rtsp: methods.includes('rtsp') },
        { timeout: 120000 }
      );
      setResult(data);
      setRows(
        Object.fromEntries(
          data.devices.map((d, i) => [
            d.ip,
            {
              name: d.name || `${d.manufacturer || 'IP'} Camera ${i + 1}`,
              location: d.location || '',
              streamUrl: d.suggestedStreamUrl,
            },
          ])
        )
      );
      setSelected(data.devices.filter((d) => !d.existingCameraId).map((d) => d.ip));
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setScanning(false);
    }
  };

  const edit = (ip, field, value) => setRows((r) => ({ ...r, [ip]: { ...r[ip], [field]: value } }));

  const add = async () => {
    const devices = result.devices.filter((d) => selected.includes(d.ip));
    const missing = devices.filter((d) => !rows[d.ip].name.trim() || !rows[d.ip].location.trim());
    if (missing.length) {
      message.warning(`Enter a name and location for ${missing.map((d) => d.ip).join(', ')}`);
      return;
    }
    setAdding(true);
    try {
      const { data } = await api.post('/camera-discovery/add', {
        cameras: devices.map((d) => ({
          ...rows[d.ip],
          ipAddress: d.ip,
          manufacturer: d.manufacturer,
          model: d.model,
          discoveredVia: d.via,
          type: 'Indoor',
          ...(creds.rtspUser ? creds : {}),
        })),
      });
      message.success(`Added ${data.created.length} camera(s)`);
      if (data.errors.length) message.warning(`${data.errors.length} could not be added: ${data.errors.map((e) => e.message).join('; ')}`);
      onAdded?.();
      onClose();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setAdding(false);
    }
  };

  const columns = [
    { title: 'IP Address', dataIndex: 'ip', width: 130 },
    {
      title: 'Found via',
      dataIndex: 'via',
      width: 110,
      render: (v, d) => (
        <Space size={2} direction="vertical">
          <Tag bordered={false} color={v === 'ONVIF' ? 'blue' : 'default'}>{v}</Tag>
          {d.existingCameraId && <Tag bordered={false} color="green">Added as {d.existingCameraId}</Tag>}
        </Space>
      ),
    },
    {
      title: 'Device',
      width: 170,
      render: (_, d) => (
        <div style={{ lineHeight: 1.35 }}>
          <div>{d.manufacturer || 'Unknown brand'}</div>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {[d.model, d.server].filter(Boolean).join(' · ') || '-'}
          </Typography.Text>
        </div>
      ),
    },
    { title: 'Name', width: 180, render: (_, d) => <Input size="small" value={rows[d.ip]?.name} onChange={(e) => edit(d.ip, 'name', e.target.value)} /> },
    {
      title: 'Location',
      width: 170,
      render: (_, d) => <Input size="small" placeholder="Required" value={rows[d.ip]?.location} onChange={(e) => edit(d.ip, 'location', e.target.value)} />,
    },
    {
      title: 'RTSP Stream URL',
      render: (_, d) => <Input size="small" value={rows[d.ip]?.streamUrl} onChange={(e) => edit(d.ip, 'streamUrl', e.target.value)} />,
    },
  ];

  return (
    <Modal
      title="Discover IP Cameras"
      open={open}
      onCancel={onClose}
      width={1100}
      destroyOnClose
      maskClosable={false}
      footer={[
        <Button key="cancel" onClick={onClose}>
          Close
        </Button>,
        <Button key="add" type="primary" disabled={!selected.length} loading={adding} onClick={add}>
          Add {selected.length || ''} camera{selected.length === 1 ? '' : 's'}
        </Button>,
      ]}
    >
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          allowClear
          style={{ width: 260 }}
          value={subnet}
          onChange={(e) => setSubnet(e.target.value)}
          placeholder={subnets.length ? `Auto: ${subnets.join(', ')}` : 'Subnet, e.g. 192.168.1.0/24'}
          addonBefore="Subnet"
        />
        <Checkbox.Group
          value={methods}
          onChange={setMethods}
          options={[
            { value: 'onvif', label: 'ONVIF discovery' },
            { value: 'rtsp', label: 'RTSP port scan' },
          ]}
        />
        <Button type="primary" icon={<RadarChartOutlined />} loading={scanning} disabled={!methods.length} onClick={scan}>
          {scanning ? 'Scanning...' : 'Start scan'}
        </Button>
      </Space>

      <Typography.Paragraph type="secondary" style={{ fontSize: 12, marginBottom: 12 }}>
        The scan runs on the server, so it finds cameras on the server&apos;s network. When the API runs in Docker it needs host networking for
        discovery to reach the LAN.
      </Typography.Paragraph>

      {result && (
        <>
          <Alert
            type={result.devices.length ? 'success' : 'info'}
            showIcon
            style={{ marginBottom: 12 }}
            message={`Found ${result.devices.length} device(s) on ${result.subnets.join(', ') || 'the local network'} in ${(result.durationMs / 1000).toFixed(1)}s`}
          />
          {result.devices.length > 0 && (
            <>
              <Space wrap style={{ marginBottom: 12 }}>
                <Typography.Text>RTSP login for the selected cameras (optional):</Typography.Text>
                <Input size="small" style={{ width: 150 }} placeholder="Username" value={creds.rtspUser} onChange={(e) => setCreds((c) => ({ ...c, rtspUser: e.target.value }))} />
                <Input.Password size="small" style={{ width: 150 }} placeholder="Password" value={creds.rtspPassword} onChange={(e) => setCreds((c) => ({ ...c, rtspPassword: e.target.value }))} />
              </Space>
              <Table
                rowKey="ip"
                size="small"
                columns={columns}
                dataSource={result.devices}
                pagination={false}
                scroll={{ x: 1000, y: 380 }}
                rowSelection={{
                  selectedRowKeys: selected,
                  onChange: setSelected,
                  getCheckboxProps: (d) => ({ disabled: !!d.existingCameraId }),
                }}
              />
            </>
          )}
        </>
      )}
      {!result && !scanning && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Start a scan to look for cameras" />}
    </Modal>
  );
}
