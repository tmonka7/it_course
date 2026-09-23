import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Col, DatePicker, Divider, Form, Input, Row, Select, Tag, Tooltip, Typography, Upload } from 'antd';
import { CalendarOutlined, CheckCircleOutlined, PaperClipOutlined, PlayCircleOutlined, ProfileOutlined, UploadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import CrudPage from '../components/CrudPage';
import StatusTag from '../components/StatusTag';
import RemoteSelect from '../components/RemoteSelect';
import { useAuth } from '../context/AuthContext';
import api, { errMsg } from '../api';
import { toOptions } from '../constants';
import { COMMAND_STATUSES, CommandLogDrawer, DailyCommandLogModal } from '../components/CommandLog';
import { AttachmentList, uploadAttachments } from '../components/Attachments';
import { t, useLanguage } from '../i18n';

const PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];
const STATUSES = COMMAND_STATUSES;
const isOpen = (status) => status === 'Issued' || status === 'In Progress';

// Column header icon; a component so its aria-label follows the active language.
function AttachmentsHeader() {
  useLanguage();
  return <PaperClipOutlined aria-label={t('Attachments')} />;
}

const columns = [
  { title: 'Command', dataIndex: 'title' },
  { title: 'Priority', dataIndex: 'priority', render: (v) => <StatusTag value={v} /> },
  { title: 'Assignee', dataIndex: ['assignee', 'name'], render: (v) => v || '-' },
  { title: 'Issued By', dataIndex: 'issuedBy', responsive: ['lg'] },
  {
    title: 'Due Date',
    dataIndex: 'dueDate',
    render: (v, r) => {
      if (!v) return '-';
      const overdue = isOpen(r.status) && dayjs(v).isBefore(dayjs(), 'day');
      return <Typography.Text type={overdue ? 'danger' : undefined}>{dayjs(v).format('YYYY-MM-DD')}{overdue ? ` ${t('(overdue)')}` : ''}</Typography.Text>;
    },
  },
  { title: 'Status', dataIndex: 'status', render: (v) => <StatusTag value={v} /> },
  {
    title: <AttachmentsHeader />,
    dataIndex: 'attachments',
    align: 'center',
    width: 56,
    render: (v) => (v?.length ? v.length : ''),
  },
];

const userLabel = (u) => `${u.name} (${u.username})`;

export default function Commands() {
  const { message } = App.useApp();
  const { user, can } = useAuth();
  const canEdit = can('commands', 'edit');
  const [searchParams, setSearchParams] = useSearchParams();
  const [logFor, setLogFor] = useState(null); // command id shown in the log drawer
  const [dailyOpen, setDailyOpen] = useState(false);
  const [loggedToday, setLoggedToday] = useState(new Set());
  const [version, setVersion] = useState(0); // reloads the table and the "Today's Log" column

  // Notification links open a command's log with /commands?open=<id>.
  useEffect(() => {
    const id = searchParams.get('open');
    if (!id) return;
    setLogFor(id);
    setSearchParams(
      (p) => {
        p.delete('open');
        return p;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    api
      .get('/command-logs', {
        params: { dateFrom: dayjs().startOf('day').toISOString(), dateTo: dayjs().add(1, 'day').startOf('day').toISOString(), type: 'Progress' },
      })
      .then(({ data }) => setLoggedToday(new Set(data.loggedCommandIds.map(String))))
      .catch(() => {});
  }, [version]);

  const allColumns = [
    ...columns,
    {
      title: "Today's Log",
      key: 'today',
      render: (_, r) => {
        if (!isOpen(r.status)) return <Typography.Text type="secondary">-</Typography.Text>;
        return loggedToday.has(String(r._id)) ? (
          <Tag bordered={false} color="green">{t('Logged')}</Tag>
        ) : (
          <Tag bordered={false} color="orange">{t('Missing')}</Tag>
        );
      },
    },
  ];

  const setStatus = async (record, status, reload) => {
    try {
      await api.put(`/commands/${record._id}`, { status });
      message.success(t('Command marked as {status}', { status: t(status).toLowerCase() }));
      reload();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const renderForm = (record) => (
    <Row gutter={16}>
      <Col xs={24}>
        <Form.Item name="title" label={t('Command')} rules={[{ required: true }]}>
          <Input placeholder={t('e.g. Prepare midterm exam rooms')} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="assignee" label={t('Assign To')} rules={[{ required: true }]}>
          <RemoteSelect
            resource="users"
            labelOf={userLabel}
            placeholder={t('Search users')}
            initialOptions={record?.assignee ? [{ value: record.assignee._id, label: userLabel(record.assignee) }] : []}
          />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="priority" label={t('Priority')}>
          <Select options={toOptions(PRIORITIES)} />
        </Form.Item>
      </Col>
      <Col xs={12} md={6}>
        <Form.Item name="dueDate" label={t('Due Date')}>
          <DatePicker style={{ width: '100%' }} />
        </Form.Item>
      </Col>
      <Col xs={24} md={12}>
        <Form.Item name="status" label={t('Status')}>
          <Select options={toOptions(STATUSES)} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Form.Item name="content" label={t('Details / Instructions')}>
          <Input.TextArea rows={5} />
        </Form.Item>
      </Col>
      <Col xs={24}>
        <Divider orientation="left" plain style={{ margin: '0 0 12px' }}>
          {t('Attachments')}
        </Divider>
        {record && (
          <div style={{ marginBottom: 12 }}>
            <AttachmentList commandId={record._id} attachments={record.attachments} onChange={() => setVersion((v) => v + 1)} />
          </div>
        )}
        {/* New files are kept in the form and uploaded after the work order is saved. */}
        <Form.Item name="newFiles" valuePropName="fileList" getValueFromEvent={(e) => e?.fileList} extra={t('Up to 10 files per save, 20 MB each.')}>
          <Upload multiple beforeUpload={() => false}>
            <Button icon={<UploadOutlined />}>{t('Add files')}</Button>
          </Upload>
        </Form.Item>
      </Col>
    </Row>
  );

  return (
    <>
      <CrudPage
        title="Commands"
        resource="commands"
        addText="Issue Command"
        modalTitle={(r) => (r ? 'Edit Command' : 'Issue Command')}
        searchPlaceholder="Search commands..."
        columns={allColumns}
        refreshKey={version}
        dateFilter={{ label: 'Work order date' }}
        onSaved={async (saved, values) => {
          const files = (values.newFiles || []).map((f) => f.originFileObj).filter(Boolean);
          if (!files.length) return;
          try {
            await uploadAttachments(saved._id, files);
          } catch (err) {
            // The work order itself is saved; only the upload failed.
            message.warning(t('Saved, but the attachments could not be uploaded: {error}', { error: errMsg(err) }));
          }
        }}
        onMutate={() => setVersion((v) => v + 1)}
        toolbarExtra={() => (
          <Button icon={<CalendarOutlined />} onClick={() => setDailyOpen(true)}>
            {t('Daily Log')}
          </Button>
        )}
        filters={[
          { name: 'assignee', placeholder: 'All Assignees', options: [{ value: user._id, label: 'Assigned to me' }], width: 150 },
          { name: 'status', placeholder: 'All Status', options: toOptions(STATUSES), width: 140 },
          { name: 'priority', placeholder: 'All Priorities', options: toOptions(PRIORITIES), width: 140 },
        ]}
        renderForm={renderForm}
        toForm={(r) => ({ ...r, assignee: r.assignee?._id, dueDate: r.dueDate ? dayjs(r.dueDate) : null })}
        fromForm={({ newFiles, ...v }) => ({ ...v, dueDate: v.dueDate ? v.dueDate.endOf('day').toISOString() : null })}
        initialValues={{ priority: 'Normal', status: 'Issued' }}
        modalWidth={720}
        rowActions={(record, reload) => (
          <>
            <Tooltip title={t('Log / history')}>
              <Button type="text" icon={<ProfileOutlined />} style={{ color: '#1664ff' }} onClick={() => setLogFor(record._id)} />
            </Tooltip>
            {canEdit && record.status === 'Issued' && (
              <Tooltip title={t('Start')}>
                <Button type="text" icon={<PlayCircleOutlined />} style={{ color: '#d97706' }} onClick={() => setStatus(record, 'In Progress', reload)} />
              </Tooltip>
            )}
            {canEdit && isOpen(record.status) && (
              <Tooltip title={t('Mark completed')}>
                <Button type="text" icon={<CheckCircleOutlined />} style={{ color: '#16a34a' }} onClick={() => setStatus(record, 'Completed', reload)} />
              </Tooltip>
            )}
          </>
        )}
      />
      <CommandLogDrawer
        commandId={logFor}
        canEdit={canEdit}
        onClose={() => setLogFor(null)}
        onChanged={() => setVersion((v) => v + 1)}
      />
      <DailyCommandLogModal
        open={dailyOpen}
        onClose={() => setDailyOpen(false)}
        onOpenCommand={(id) => {
          setDailyOpen(false);
          setLogFor(id);
        }}
      />
    </>
  );
}
