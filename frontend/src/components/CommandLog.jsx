import { useCallback, useEffect, useState } from 'react';
import { Alert, App, Button, DatePicker, Descriptions, Drawer, Empty, Form, Input, List, Modal, Select, Skeleton, Space, Table, Tag, Timeline, Typography } from 'antd';
import dayjs from 'dayjs';
import StatusTag from './StatusTag';
import { AttachmentList, AttachmentUploadButton } from './Attachments';
import api, { errMsg } from '../api';
import { t } from '../i18n';

export const COMMAND_STATUSES = ['Issued', 'In Progress', 'Completed', 'Cancelled'];
const LOG_COLORS = { Created: 'blue', Update: 'gray', Progress: 'green', Reminder: 'orange' };
const LOG_LABELS = { Created: 'Issued', Update: 'Changed', Progress: 'Daily log', Reminder: 'Reminder' };

function LogTimeline({ logs }) {
  if (!logs.length) return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No log entries yet')} />;
  return (
    <Timeline
      items={logs.map((l) => ({
        color: LOG_COLORS[l.type],
        children: (
          <div>
            <Space size={6} wrap>
              <Tag bordered={false} color={LOG_COLORS[l.type] === 'gray' ? 'default' : LOG_COLORS[l.type]}>
                {t(LOG_LABELS[l.type])}
              </Tag>
              <Typography.Text strong>{l.author}</Typography.Text>
              <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                {dayjs(l.createdAt).format('YYYY-MM-DD HH:mm')}
              </Typography.Text>
            </Space>
            {l.note && <div className="log-note">{l.note}</div>}
          </div>
        ),
      }))}
    />
  );
}

/** Drawer with a command's details, the daily progress form and its full log timeline. */
export function CommandLogDrawer({ commandId, onClose, onChanged, canEdit = true }) {
  const { message } = App.useApp();
  const [form] = Form.useForm();
  const [command, setCommand] = useState(null);
  const [logs, setLogs] = useState([]);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!commandId) return;
    try {
      const [c, l] = await Promise.all([api.get(`/commands/${commandId}`), api.get(`/commands/${commandId}/logs`)]);
      setCommand(c.data);
      setLogs(l.data);
    } catch (err) {
      message.error(errMsg(err));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commandId]);

  useEffect(() => {
    setCommand(null);
    setLogs([]);
    form.resetFields();
    load();
  }, [load, form]);

  const loggedToday = logs.some((l) => l.type === 'Progress' && dayjs(l.createdAt).isSame(dayjs(), 'day'));
  const open = command && (command.status === 'Issued' || command.status === 'In Progress');

  const submit = async ({ note, status }) => {
    setSaving(true);
    try {
      await api.post(`/commands/${commandId}/logs`, { note, status });
      message.success(t('Progress logged'));
      form.resetFields();
      await load();
      onChanged?.();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer title={command?.title || t('Command')} open={!!commandId} onClose={onClose} width={560} destroyOnClose>
      {!command ? (
        <Skeleton active />
      ) : (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 16 }}>
            <Descriptions.Item label={t('Status')}>
              <StatusTag value={command.status} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Priority')}>
              <StatusTag value={command.priority} />
            </Descriptions.Item>
            <Descriptions.Item label={t('Assignee')}>{command.assignee?.name || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Issued by')}>{command.issuedBy || '-'}</Descriptions.Item>
            <Descriptions.Item label={t('Due date')} span={2}>
              {command.dueDate ? dayjs(command.dueDate).format('YYYY-MM-DD') : '-'}
            </Descriptions.Item>
            {command.content && (
              <Descriptions.Item label={t('Details')} span={2}>
                <span style={{ whiteSpace: 'pre-line' }}>{command.content}</span>
              </Descriptions.Item>
            )}
          </Descriptions>

          <div className="drawer-section">
            <div className="drawer-section-head">
              <Typography.Text strong>{t('Attachments')}</Typography.Text>
              {canEdit && (
                <AttachmentUploadButton
                  commandId={commandId}
                  onUploaded={() => {
                    load();
                    onChanged?.();
                  }}
                />
              )}
            </div>
            <AttachmentList
              commandId={commandId}
              attachments={command.attachments}
              canDelete={canEdit}
              onChange={() => {
                load();
                onChanged?.();
              }}
            />
          </div>

          {open && !loggedToday && <Alert type="warning" showIcon style={{ marginBottom: 12 }} message={t('No progress has been logged for this command today.')} />}

          {canEdit && (
            <Form form={form} layout="vertical" onFinish={submit} className="log-form">
              <Form.Item name="note" label={t("Today's progress")} rules={[{ required: true, message: t('Describe what was done today') }]}>
                <Input.TextArea rows={3} placeholder={t('What was done today, blockers, next steps...')} />
              </Form.Item>
              <Space align="start" wrap>
                <Form.Item name="status" style={{ marginBottom: 0 }}>
                  <Select
                    allowClear
                    placeholder={t('Change status (optional)')}
                    style={{ width: 220 }}
                    options={COMMAND_STATUSES.filter((s) => s !== command.status).map((s) => ({ value: s, label: t('Set to {status}', { status: t(s) }) }))}
                  />
                </Form.Item>
                <Button type="primary" htmlType="submit" loading={saving}>
                  {t('Add log entry')}
                </Button>
              </Space>
            </Form>
          )}

          <Typography.Title level={5} style={{ marginTop: 24 }}>
            {t('Log history')}
          </Typography.Title>
          <LogTimeline logs={logs} />
        </>
      )}
    </Drawer>
  );
}

/** Everything logged on one day across all commands, plus open commands still missing a daily entry. */
export function DailyCommandLogModal({ open, onClose, onOpenCommand }) {
  const { message } = App.useApp();
  const [date, setDate] = useState(dayjs());
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open) return;
    setData(null);
    api
      .get('/command-logs', {
        params: { dateFrom: date.startOf('day').toISOString(), dateTo: date.add(1, 'day').startOf('day').toISOString() },
      })
      .then(({ data: res }) => setData(res))
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, date]);

  const columns = [
    { title: t('Time'), dataIndex: 'createdAt', width: 70, render: (v) => dayjs(v).format('HH:mm') },
    {
      title: t('Command'),
      dataIndex: ['command', 'title'],
      render: (v, r) =>
        r.command ? (
          <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onOpenCommand(r.command._id)}>
            {v}
          </Button>
        ) : (
          <Typography.Text type="secondary">{t('(deleted)')}</Typography.Text>
        ),
    },
    { title: t('Entry'), dataIndex: 'type', width: 100, render: (v) => <Tag bordered={false} color={LOG_COLORS[v] === 'gray' ? 'default' : LOG_COLORS[v]}>{t(LOG_LABELS[v])}</Tag> },
    { title: t('By'), dataIndex: 'author', width: 120 },
    { title: t('Note'), dataIndex: 'note', render: (v) => <span style={{ whiteSpace: 'pre-line' }}>{v}</span> },
  ];

  return (
    <Modal title={t('Daily Command Log')} open={open} onCancel={onClose} footer={null} width={960} destroyOnClose>
      <Space style={{ marginBottom: 16 }} wrap>
        <DatePicker value={date} onChange={(d) => d && setDate(d)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        <Button onClick={() => setDate(date.subtract(1, 'day'))}>{t('Previous day')}</Button>
        <Button onClick={() => setDate(dayjs())} disabled={date.isSame(dayjs(), 'day')}>
          {t('Today')}
        </Button>
      </Space>

      {data?.missing?.length > 0 && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={t('{count} open command(s) without a progress log on {date}', { count: data.missing.length, date: date.format('YYYY-MM-DD') })}
          description={
            <List
              size="small"
              dataSource={data.missing}
              renderItem={(c) => (
                <List.Item style={{ padding: '4px 0' }}>
                  <Button type="link" size="small" style={{ padding: 0 }} onClick={() => onOpenCommand(c._id)}>
                    {c.title}
                  </Button>
                  <Space size={4}>
                    <StatusTag value={c.priority} />
                    <Typography.Text type="secondary">{c.assignee?.name || t('Unassigned')}</Typography.Text>
                  </Space>
                </List.Item>
              )}
            />
          }
        />
      )}

      <Table rowKey="_id" size="small" loading={!data} columns={columns} dataSource={data?.items || []} pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
    </Modal>
  );
}
