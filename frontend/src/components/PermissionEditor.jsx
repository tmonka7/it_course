import { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Checkbox, Modal, Space, Table, Tag, Typography } from 'antd';
import api, { errMsg } from '../api';
import { ACTIONS, PERMISSION_PAGES, PRESETS } from '../permissions';
import { t } from '../i18n';

const ACTION_LABELS = { view: 'View', create: 'Create', edit: 'Edit', delete: 'Delete' };

// Fill in every page/action (older accounts have no permission set, which means full access).
function normalize(perms) {
  if (!perms) return PRESETS.full();
  const base = PRESETS.none();
  PERMISSION_PAGES.forEach((p) => {
    p.actions.forEach((a) => {
      base[p.key][a] = perms[p.key]?.[a] === true;
    });
  });
  return base;
}

/** Short summary for the user list, e.g. "12 / 15 pages". */
export function permissionSummary(user) {
  if (user.role === 'admin') return <Tag color="geekblue" bordered={false}>{t('Full access (administrator)')}</Tag>;
  if (!user.permissions) return <Tag color="green" bordered={false}>{t('Full access')}</Tag>;
  const visible = PERMISSION_PAGES.filter((p) => user.permissions[p.key]?.view).length;
  return (
    <Typography.Text type="secondary">
      {t('{count} / {total} pages', { count: visible, total: PERMISSION_PAGES.length })}
    </Typography.Text>
  );
}

/** Modal with a page x action matrix for one user. */
export default function PermissionEditor({ user, onClose, onSaved }) {
  const { message } = App.useApp();
  const [perms, setPerms] = useState(() => normalize(user?.permissions));
  const [saving, setSaving] = useState(false);
  const isAdminUser = user?.role === 'admin';

  useEffect(() => setPerms(normalize(user?.permissions)), [user]);

  // Granting any action implies view; removing view removes everything else on that page.
  const setOne = (page, action, value) =>
    setPerms((p) => {
      const next = { ...p, [page]: { ...p[page], [action]: value } };
      if (action === 'view' && !value) ACTIONS.forEach((a) => (next[page][a] = false));
      if (action !== 'view' && value) next[page].view = true;
      return next;
    });

  const setRow = (page, value) =>
    setPerms((p) => {
      const def = PERMISSION_PAGES.find((x) => x.key === page);
      return { ...p, [page]: Object.fromEntries(ACTIONS.map((a) => [a, def.actions.includes(a) && value])) };
    });

  const setColumn = (action, value) =>
    setPerms((p) => {
      const next = { ...p };
      PERMISSION_PAGES.forEach((def) => {
        if (!def.actions.includes(action)) return;
        next[def.key] = { ...next[def.key], [action]: value };
        if (action === 'view' && !value) ACTIONS.forEach((a) => (next[def.key][a] = false));
        if (action !== 'view' && value) next[def.key].view = true;
      });
      return next;
    });

  const columnState = (action) => {
    const pages = PERMISSION_PAGES.filter((d) => d.actions.includes(action));
    const on = pages.filter((d) => perms[d.key][action]).length;
    return { checked: on === pages.length, indeterminate: on > 0 && on < pages.length };
  };

  const rows = useMemo(() => {
    const out = [];
    let group = null;
    PERMISSION_PAGES.forEach((p) => {
      if (p.group !== group) {
        group = p.group;
        out.push({ key: `group-${group}`, isGroup: true, label: group });
      }
      out.push({ ...p, isGroup: false });
    });
    return out;
  }, []);

  const columns = [
    {
      title: t('Page'),
      dataIndex: 'label',
      render: (v, r) => (r.isGroup ? <Typography.Text strong type="secondary">{t(v)}</Typography.Text> : t(v)),
      onCell: (r) => (r.isGroup ? { colSpan: ACTIONS.length + 2 } : {}),
    },
    ...ACTIONS.map((action) => {
      const state = columnState(action);
      return {
        key: action,
        align: 'center',
        width: 90,
        title: (
          <Space direction="vertical" size={2} align="center">
            <span>{t(ACTION_LABELS[action])}</span>
            <Checkbox
              checked={state.checked}
              indeterminate={state.indeterminate}
              disabled={isAdminUser}
              onChange={(e) => setColumn(action, e.target.checked)}
              aria-label={t('All: {action}', { action: t(ACTION_LABELS[action]) })}
            />
          </Space>
        ),
        onCell: (r) => (r.isGroup ? { colSpan: 0 } : {}),
        render: (_, r) =>
          r.actions.includes(action) ? (
            <Checkbox
              checked={isAdminUser || perms[r.key][action]}
              disabled={isAdminUser}
              onChange={(e) => setOne(r.key, action, e.target.checked)}
              aria-label={`${t(r.label)}: ${t(ACTION_LABELS[action])}`}
            />
          ) : (
            <Typography.Text type="secondary">—</Typography.Text>
          ),
      };
    }),
    {
      key: 'all',
      title: t('All'),
      align: 'center',
      width: 70,
      onCell: (r) => (r.isGroup ? { colSpan: 0 } : {}),
      render: (_, r) => {
        const on = r.actions.filter((a) => perms[r.key][a]).length;
        return (
          <Checkbox
            checked={isAdminUser || on === r.actions.length}
            indeterminate={!isAdminUser && on > 0 && on < r.actions.length}
            disabled={isAdminUser}
            onChange={(e) => setRow(r.key, e.target.checked)}
            aria-label={t('All actions for {page}', { page: t(r.label) })}
          />
        );
      },
    },
  ];

  const save = async () => {
    setSaving(true);
    try {
      const { data } = await api.put(`/users/${user._id}`, { permissions: perms });
      message.success(t('Permissions saved'));
      onSaved?.(data);
      onClose();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={user ? t('Permissions: {name}', { name: `${user.name} (${user.username})` }) : ''}
      open={!!user}
      onCancel={onClose}
      width={760}
      destroyOnClose
      footer={
        isAdminUser
          ? [
              <Button key="close" onClick={onClose}>
                {t('Close')}
              </Button>,
            ]
          : [
              <Button key="cancel" onClick={onClose}>
                {t('Cancel')}
              </Button>,
              <Button key="save" type="primary" loading={saving} onClick={save}>
                {t('Save')}
              </Button>,
            ]
      }
    >
      {isAdminUser ? (
        <Alert type="info" showIcon style={{ marginBottom: 12 }} message={t('Administrators always have full access to every page.')} />
      ) : (
        <Space wrap style={{ marginBottom: 12 }}>
          <Typography.Text type="secondary">{t('Presets:')}</Typography.Text>
          <Button size="small" onClick={() => setPerms(PRESETS.full())}>
            {t('Full access')}
          </Button>
          <Button size="small" onClick={() => setPerms(PRESETS.readOnly())}>
            {t('Read only')}
          </Button>
          <Button size="small" onClick={() => setPerms(PRESETS.none())}>
            {t('No access')}
          </Button>
        </Space>
      )}
      <Table
        rowKey="key"
        size="small"
        columns={columns}
        dataSource={rows}
        pagination={false}
        rowClassName={(r) => (r.isGroup ? 'perm-group-row' : '')}
        scroll={{ y: 460 }}
      />
      <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0, fontSize: 12 }}>
        {t('Granting Create, Edit or Delete also grants View. System Settings and User Management are always limited to administrators.')}
      </Typography.Paragraph>
    </Modal>
  );
}
