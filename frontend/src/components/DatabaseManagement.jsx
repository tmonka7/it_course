import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert, App, Button, Col, Descriptions, Divider, Drawer, Empty, Input, Modal, Popconfirm, Radio, Row,
  Space, Statistic, Table, Tag, Tooltip, Typography, Upload,
} from 'antd';
import {
  CloudDownloadOutlined, CloudUploadOutlined, DatabaseOutlined, DeleteOutlined, EyeOutlined,
  ReloadOutlined, SearchOutlined, ThunderboltOutlined, WarningOutlined,
} from '@ant-design/icons';
import api, { TOKEN_KEY, errMsg } from '../api';
import { t } from '../i18n';

/** Bytes as a short human-readable size. */
function bytes(n) {
  if (!n) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** i).toFixed(i ? 1 : 0)} ${units[i]}`;
}

const saveJson = (text, filename) => {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * A modal that only enables its action once the operator has typed an exact phrase.
 * Used for every destructive database operation, matching what the API demands.
 */
function ConfirmTyped({ open, title, phrase, danger = true, description, okText, onCancel, onConfirm }) {
  const [value, setValue] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  const run = async () => {
    setLoading(true);
    try {
      await onConfirm(phrase);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      title={
        <Space>
          <WarningOutlined style={{ color: '#f04438' }} />
          {title}
        </Space>
      }
      onCancel={onCancel}
      okText={okText || t('Confirm')}
      cancelText={t('Cancel')}
      okButtonProps={{ danger, disabled: value !== phrase, loading }}
      onOk={run}
      destroyOnClose
    >
      {description}
      <Typography.Paragraph style={{ marginBottom: 6 }}>
        {t('Type {phrase} to confirm:', { phrase: phrase })}
      </Typography.Paragraph>
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={phrase} autoComplete="off" />
    </Modal>
  );
}

/** Paged, read-only document viewer for one collection. */
function CollectionViewer({ model, onClose }) {
  const { message } = App.useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!model) return;
    setLoading(true);
    api
      .get(`/database/collections/${model}`, { params: { page, pageSize: 20, q: query || undefined } })
      .then(({ data: d }) => setData(d))
      .catch((err) => message.error(errMsg(err)))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, page, query]);

  useEffect(() => {
    setPage(1);
    setSearch('');
    setQuery('');
  }, [model]);

  return (
    <Drawer open={!!model} onClose={onClose} width={860} title={model ? t('Documents in {model}', { model }) : ''} destroyOnClose>
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Input.Search
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onSearch={(v) => {
            setQuery(v.trim());
            setPage(1);
          }}
          placeholder={t('Search text fields, or paste an id')}
          allowClear
          enterButton={<SearchOutlined />}
        />
        {!!data?.redactedFields?.length && (
          <Alert
            type="info"
            showIcon
            message={t('Hidden fields: {fields}', { fields: data.redactedFields.join(', ') })}
            description={t('Passwords and face signatures never leave the server, so they show as [redacted] here and in exports.')}
          />
        )}
        <Table
          rowKey="_id"
          size="small"
          loading={loading}
          dataSource={data?.documents || []}
          pagination={{ current: page, pageSize: data?.pageSize || 20, total: data?.total || 0, onChange: setPage, showSizeChanger: false, showTotal: (total) => t('{count} documents', { count: total }) }}
          columns={[
            { title: t('_id'), dataIndex: '_id', width: 230, render: (v) => <Typography.Text code copyable style={{ fontSize: 12 }}>{String(v)}</Typography.Text> },
            {
              title: t('Document'),
              key: 'doc',
              render: (_, row) => (
                <Typography.Text type="secondary" ellipsis style={{ fontSize: 12, maxWidth: 480, display: 'block' }}>
                  {Object.entries(row)
                    .filter(([k]) => k !== '_id' && k !== '__v')
                    .slice(0, 6)
                    .map(([k, v]) => `${k}: ${typeof v === 'object' && v !== null ? Array.isArray(v) ? `[${v.length}]` : '{…}' : String(v)}`)
                    .join('   ')}
                </Typography.Text>
              ),
            },
          ]}
          expandable={{
            expandedRowRender: (row) => (
              <pre className="db-json">{JSON.stringify(row, null, 2)}</pre>
            ),
          }}
        />
      </Space>
    </Drawer>
  );
}

/**
 * Database Management: inspect the MongoDB behind the app, export and restore data, and run
 * maintenance. Administrators only; every destructive action needs a typed confirmation.
 */
export default function DatabaseManagement() {
  const { message, modal } = App.useApp();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [viewing, setViewing] = useState(null);
  const [clearing, setClearing] = useState(null); // model whose clear dialog is open
  const [restore, setRestore] = useState(null); // { file, data, mode, collections }
  const [replaceOpen, setReplaceOpen] = useState(false); // typed confirmation for a replacing restore
  const [reseedOpen, setReseedOpen] = useState(false);
  const mounted = useRef(true);

  useEffect(() => () => {
    mounted.current = false;
  }, []);

  const load = useCallback(
    (quiet) => {
      if (!quiet) setLoading(true);
      return api
        .get('/database')
        .then(({ data }) => mounted.current && setOverview(data))
        .catch((err) => message.error(errMsg(err)))
        .finally(() => mounted.current && setLoading(false));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    []
  );

  useEffect(() => {
    load();
  }, [load]);

  const downloadAll = async () => {
    setBusy('backup');
    try {
      const { data } = await api.get('/settings/backup');
      saveJson(JSON.stringify(data, null, 2), `sist-backup-${new Date().toISOString().slice(0, 10)}.json`);
      message.success(t('Backup downloaded'));
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const exportOne = async (model) => {
    setBusy(`export:${model}`);
    try {
      const { data } = await api.get(`/database/collections/${model}/export`);
      saveJson(JSON.stringify(data, null, 2), `${model}-${new Date().toISOString().slice(0, 10)}.json`);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const rebuildIndexes = async () => {
    setBusy('indexes');
    try {
      const { data } = await api.post('/database/indexes');
      const failed = data.results.filter((r) => r.error);
      const dropped = data.results.filter((r) => r.dropped?.length);
      modal.info({
        title: t('Indexes rebuilt'),
        content: (
          <Space direction="vertical">
            <span>{t('{count} collections checked', { count: data.results.length })}</span>
            {dropped.length ? (
              dropped.map((r) => <span key={r.model}>{`${r.model}: ${t('dropped')} ${r.dropped.join(', ')}`}</span>)
            ) : (
              <span>{t('Every index already matched the schema.')}</span>
            )}
            {failed.map((r) => (
              <Typography.Text type="danger" key={r.model}>{`${r.model}: ${r.error}`}</Typography.Text>
            ))}
          </Space>
        ),
      });
      load(true);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const clearCollection = async (phrase) => {
    try {
      const { data } = await api.post(`/database/collections/${clearing}/clear`, { confirm: phrase });
      message.success(t('Deleted {count} documents from {model}', { count: data.deletedCount, model: data.model }));
      setClearing(null);
      load(true);
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  /** Reads a chosen backup file locally so its collections can be listed before anything is sent. */
  const pickRestoreFile = (file) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const payload = parsed?.data && typeof parsed.data === 'object' ? parsed.data : parsed;
        const collections = Object.entries(payload)
          .filter(([, v]) => Array.isArray(v))
          .map(([name, v]) => ({ name, count: v.length }));
        if (!collections.length) {
          message.error(t('That file contains no collections to restore'));
          return;
        }
        setRestore({ file: file.name, data: payload, mode: 'merge', collections });
      } catch {
        message.error(t('That file is not valid JSON'));
      }
    };
    reader.readAsText(file);
    return false; // never let antd upload it; the restore request is sent explicitly below
  };

  const runRestore = async (phrase) => {
    setBusy('restore');
    try {
      const { data } = await api.post('/database/restore', {
        data: restore.data,
        mode: restore.mode,
        confirm: restore.mode === 'replace' ? phrase : undefined,
      });
      const failed = data.results.filter((r) => r.error);
      message.success(t('Restored {count} documents', { count: data.restored }));
      if (failed.length) {
        modal.warning({
          title: t('Some collections could not be restored'),
          content: (
            <Space direction="vertical">
              {failed.map((r) => (
                <Typography.Text key={r.model}>{`${r.model}: ${r.error}`}</Typography.Text>
              ))}
            </Space>
          ),
        });
      }
      setRestore(null);
      load(true);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setBusy('');
    }
  };

  const runReseed = async (phrase) => {
    setBusy('reseed');
    try {
      await api.post('/database/reseed', { confirm: phrase });
      setReseedOpen(false);
      // The seed recreates the admin account with a new id, so this session's token no longer resolves.
      modal.success({
        title: t('Demo data restored'),
        content: t('All accounts were recreated, so you have been signed out. Sign in again as admin / admin123.'),
        okText: t('Sign in'),
        onOk: () => {
          localStorage.removeItem(TOKEN_KEY);
          window.location.assign('/login');
        },
      });
    } catch (err) {
      message.error(errMsg(err));
      setBusy('');
    }
  };

  const columns = useMemo(
    () => [
      {
        title: t('Collection'),
        dataIndex: 'name',
        render: (name, row) => (
          <Space direction="vertical" size={0}>
            <Typography.Text strong>{name}</Typography.Text>
            <Typography.Text type="secondary" style={{ fontSize: 12 }}>
              {row.collection}
            </Typography.Text>
          </Space>
        ),
      },
      {
        title: t('Documents'),
        dataIndex: 'count',
        align: 'right',
        sorter: (a, b) => a.count - b.count,
        render: (v, row) => (
          <Space size={4}>
            <span>{v.toLocaleString()}</span>
            {row.statsUnavailable && (
              <Tooltip title={t('This deployment does not report storage statistics')}>
                <Tag bordered={false} style={{ fontSize: 10 }}>
                  ~
                </Tag>
              </Tooltip>
            )}
          </Space>
        ),
      },
      { title: t('Data'), dataIndex: 'size', align: 'right', sorter: (a, b) => a.size - b.size, render: bytes },
      { title: t('Indexes'), dataIndex: 'indexCount', align: 'right', render: (v, row) => `${v} (${bytes(row.indexSize)})` },
      {
        title: t('Actions'),
        key: 'actions',
        width: 150,
        render: (_, row) => (
          <Space size={2}>
            <Tooltip title={t('Browse documents')}>
              <Button type="text" size="small" icon={<EyeOutlined />} onClick={() => setViewing(row.name)} />
            </Tooltip>
            <Tooltip title={t('Export as JSON')}>
              <Button type="text" size="small" icon={<CloudDownloadOutlined />} loading={busy === `export:${row.name}`} onClick={() => exportOne(row.name)} />
            </Tooltip>
            <Tooltip title={t('Clear this collection')}>
              <Button type="text" size="small" danger icon={<DeleteOutlined />} disabled={!row.count} onClick={() => setClearing(row.name)} />
            </Tooltip>
          </Space>
        ),
      },
    ],
    [busy]
  );

  const c = overview?.connection;
  const s = overview?.storage;

  return (
    <>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }} wrap>
        <Typography.Title level={5} style={{ margin: 0 }}>
          <Space>
            <DatabaseOutlined />
            {t('Database Management')}
          </Space>
        </Typography.Title>
        <Button icon={<ReloadOutlined />} onClick={() => load()} loading={loading}>
          {t('Refresh')}
        </Button>
      </Space>

      {c && c.state !== 'connected' && (
        <Alert type="error" showIcon style={{ marginBottom: 16 }} message={t('The API is not connected to the database ({state})', { state: t(c.state) })} />
      )}

      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, lg: 3 }} style={{ marginBottom: 16 }}>
        <Descriptions.Item label={t('Database')}>{c?.database || '-'}</Descriptions.Item>
        <Descriptions.Item label={t('Host')}>{c ? `${c.host}${c.port ? `:${c.port}` : ''}` : '-'}</Descriptions.Item>
        <Descriptions.Item label={t('MongoDB version')}>{c?.mongoVersion || t('Not reported')}</Descriptions.Item>
      </Descriptions>

      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        <Col xs={12} md={6}>
          <Statistic title={t('Collections')} value={overview?.collections?.length ?? '-'} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title={t('Documents')} value={overview?.totalDocuments ?? '-'} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title={t('Data size')} value={s ? bytes(s.dataSize) : '-'} />
        </Col>
        <Col xs={12} md={6}>
          <Statistic title={t('Index size')} value={s ? bytes(s.indexSize) : '-'} />
        </Col>
      </Row>

      <Table
        rowKey="name"
        size="small"
        loading={loading}
        dataSource={overview?.collections || []}
        columns={columns}
        pagination={false}
        scroll={{ x: 640 }}
        locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No collections')} /> }}
      />

      <Divider orientation="left" orientationMargin={0} style={{ marginTop: 24 }}>
        <Typography.Text type="secondary" style={{ fontSize: 13 }}>
          {t('Backup and restore')}
        </Typography.Text>
      </Divider>
      <Space wrap style={{ marginBottom: 8 }}>
        <Button type="primary" icon={<CloudDownloadOutlined />} loading={busy === 'backup'} onClick={downloadAll}>
          {t('Download full backup')}
        </Button>
        <Upload accept="application/json,.json" showUploadList={false} beforeUpload={pickRestoreFile}>
          <Button icon={<CloudUploadOutlined />}>{t('Restore from a backup file')}</Button>
        </Upload>
        <Popconfirm
          title={t('Rebuild every index to match the current schemas?')}
          description={t('Safe to run; indexes that no longer exist in a schema are dropped.')}
          onConfirm={rebuildIndexes}
          okText={t('Rebuild')}
          cancelText={t('Cancel')}
        >
          <Button icon={<ThunderboltOutlined />} loading={busy === 'indexes'}>
            {t('Rebuild indexes')}
          </Button>
        </Popconfirm>
      </Space>
      <Typography.Paragraph type="secondary" style={{ fontSize: 12 }}>
        {t('A backup holds every collection as JSON, without passwords or face signatures - so restoring one will not bring those back. For a byte-exact copy of the database, use mongodump and mongorestore instead.')}
      </Typography.Paragraph>

      <Divider orientation="left" orientationMargin={0}>
        <Typography.Text type="danger" style={{ fontSize: 13 }}>
          {t('Danger zone')}
        </Typography.Text>
      </Divider>
      <Alert
        type="warning"
        showIcon
        style={{ marginBottom: 12 }}
        message={t('These actions delete data permanently and cannot be undone. Download a backup first.')}
      />
      <Button danger icon={<WarningOutlined />} onClick={() => setReseedOpen(true)}>
        {t('Replace all data with demo data')}
      </Button>

      <CollectionViewer model={viewing} onClose={() => setViewing(null)} />

      <ConfirmTyped
        open={!!clearing}
        title={t('Clear {model}?', { model: clearing || '' })}
        phrase={clearing || ''}
        okText={t('Delete all documents')}
        description={
          <Typography.Paragraph>
            {t('Every document in {model} will be deleted. Records in other collections that point at them will be left dangling.', { model: clearing || '' })}
          </Typography.Paragraph>
        }
        onCancel={() => setClearing(null)}
        onConfirm={clearCollection}
      />

      <ConfirmTyped
        open={reseedOpen}
        title={t('Replace all data with demo data?')}
        phrase="RESEED"
        okText={t('Replace everything')}
        description={
          <Typography.Paragraph>
            {t('Every collection is emptied and refilled with the demo data set, including user accounts. You will be signed out and will need to sign in again as admin / admin123.')}
          </Typography.Paragraph>
        }
        onCancel={() => setReseedOpen(false)}
        onConfirm={runReseed}
      />

      {/* Restore: the file is already parsed, so its contents can be reviewed before anything is sent. */}
      <Modal
        open={!!restore}
        title={t('Restore from backup')}
        onCancel={() => setRestore(null)}
        footer={null}
        destroyOnClose
        width={560}
      >
        {restore && (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <Descriptions size="small" column={1}>
              <Descriptions.Item label={t('File')}>{restore.file}</Descriptions.Item>
              <Descriptions.Item label={t('Collections in file')}>{restore.collections.length}</Descriptions.Item>
              <Descriptions.Item label={t('Documents in file')}>
                {restore.collections.reduce((sum, x) => sum + x.count, 0).toLocaleString()}
              </Descriptions.Item>
            </Descriptions>

            <div style={{ maxHeight: 160, overflowY: 'auto' }}>
              <Space size={[6, 6]} wrap>
                {restore.collections.map((x) => (
                  <Tag key={x.name} bordered={false}>
                    {x.name} × {x.count}
                  </Tag>
                ))}
              </Space>
            </div>

            <Radio.Group value={restore.mode} onChange={(e) => setRestore({ ...restore, mode: e.target.value })}>
              <Space direction="vertical">
                <Radio value="merge">
                  <strong>{t('Merge')}</strong> - {t('add or update the documents in the file, leave everything else alone')}
                </Radio>
                <Radio value="replace">
                  <strong>{t('Replace')}</strong> - {t('empty each collection named in the file first, then load it')}
                </Radio>
              </Space>
            </Radio.Group>

            {restore.mode === 'replace' && (
              <Alert type="error" showIcon message={t('Existing documents in those collections will be deleted.')} />
            )}

            {/* Merge runs straight away; replace has to be typed out first. */}
            <Button
              type="primary"
              danger={restore.mode === 'replace'}
              icon={<CloudUploadOutlined />}
              loading={busy === 'restore'}
              onClick={() => (restore.mode === 'replace' ? setReplaceOpen(true) : runRestore())}
            >
              {t(restore.mode === 'replace' ? 'Replace and load' : 'Merge into the database')}
            </Button>
          </Space>
        )}
      </Modal>

      <ConfirmTyped
        open={replaceOpen}
        title={t('Replace these collections?')}
        phrase="REPLACE"
        okText={t('Replace')}
        description={
          <Typography.Paragraph>
            {t('Every document in the collections named in the file will be deleted before the file is loaded.')}
          </Typography.Paragraph>
        }
        onCancel={() => setReplaceOpen(false)}
        onConfirm={async (phrase) => {
          setReplaceOpen(false);
          await runRestore(phrase);
        }}
      />
    </>
  );
}
