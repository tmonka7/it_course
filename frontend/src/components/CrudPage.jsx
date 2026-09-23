import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Card, DatePicker, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';
import { useAuth } from '../context/AuthContext';
import { RESOURCE_PAGE } from '../permissions';
import { t } from '../i18n';

const compact = (obj) => Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/**
 * Generic list page: search + filters + paginated table + add/edit modal + delete.
 *
 * Props:
 *   title, resource            - page title and API resource (e.g. "students")
 *   columns                    - antd table columns (an Actions column is appended)
 *   filters                    - [{ name, placeholder, options }] rendered as selects
 *   renderForm(record)         - form items for the add/edit modal
 *   toForm(record)/fromForm(v) - convert between API records and form values
 *   initialValues              - defaults for new records
 *   rowActions(record, reload) - extra action buttons per row
 *   toolbarExtra({ query })    - extra toolbar content (receives the current query)
 *   dateFilter                 - { label, value, onChange }: a day picker sending dateFrom/dateTo (local day bounds).
 *                                Defaults to today; clearing it shows all dates. Pass value/onChange to control it.
 *   onSaved(saved, values, isEdit) - async hook after a successful create/update (e.g. upload attachments)
 *   onMutate()                 - called after any create, update or delete
 *   refreshKey                 - change it to reload the table from outside
 *   page                       - permission page key (defaults from `resource`); hides Add/Edit/Delete the user may not use
 *
 * Titles, button texts, placeholders and string column titles are passed through t(), so pages can give English text.
 */
export default function CrudPage({
  title,
  resource,
  columns,
  filters = [],
  renderForm,
  addText = 'Add',
  searchPlaceholder = 'Search...',
  toForm = (r) => r,
  fromForm = (v) => v,
  initialValues,
  modalWidth = 640,
  modalTitle = (record) => (record ? `Edit ${title}` : addText),
  rowActions,
  toolbarExtra,
  canWrite = true,
  pageSize: defaultPageSize = 8,
  dateFilter,
  onSaved,
  onMutate,
  refreshKey,
  page,
}) {
  const { message } = App.useApp();
  const { can } = useAuth();
  const permissionPage = page || RESOURCE_PAGE[resource];
  const canCreate = canWrite && can(permissionPage, 'create');
  const canEdit = canWrite && can(permissionPage, 'edit');
  const canDelete = canWrite && can(permissionPage, 'delete');
  const [searchParams, setSearchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';

  const [searchText, setSearchText] = useState(urlQuery);
  const [search, setSearch] = useState(urlQuery);
  const [filterValues, setFilterValues] = useState({});
  const [ownDate, setOwnDate] = useState(() => dayjs());
  const date = dateFilter && dateFilter.value !== undefined ? dateFilter.value : ownDate;
  const setDate = (d) => {
    if (dateFilter?.onChange) dateFilter.onChange(d);
    else setOwnDate(d);
    setPagination((p) => ({ ...p, current: 1 }));
  };
  const [pagination, setPagination] = useState({ current: 1, pageSize: defaultPageSize });
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, record: null });
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  // Header search navigates here with ?q=...
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSearchText(urlQuery);
    setSearch(urlQuery);
    setPagination((p) => ({ ...p, current: 1 }));
  }, [urlQuery]);

  // Dashboard quick actions link here with ?new=1 to open the add dialog.
  useEffect(() => {
    if (searchParams.get('new') !== '1') return;
    if (canCreate) setModal({ open: true, record: null });
    setSearchParams(
      (p) => {
        p.delete('new');
        return p;
      },
      { replace: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const dateKey = dateFilter && date ? date.format('YYYY-MM-DD') : '';
  const query = useMemo(() => {
    const range = dateKey
      ? { dateFrom: dayjs(dateKey).startOf('day').toISOString(), dateTo: dayjs(dateKey).add(1, 'day').startOf('day').toISOString() }
      : {};
    return compact({ q: search, ...filterValues, ...range });
  }, [search, filterValues, dateKey]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/${resource}`, {
        params: { ...query, page: pagination.current, pageSize: pagination.pageSize },
      });
      setData(res);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, query, pagination]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const setFilter = (name, value) => {
    setFilterValues((f) => ({ ...f, [name]: value }));
    setPagination((p) => ({ ...p, current: 1 }));
  };

  const openModal = (record = null) => setModal({ open: true, record });
  const closeModal = () => setModal({ open: false, record: null });

  const save = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return; // field errors are shown inline
    }
    setSaving(true);
    try {
      const payload = fromForm(values, modal.record);
      const isEdit = !!modal.record;
      const { data: saved } = isEdit ? await api.put(`/${resource}/${modal.record._id}`, payload) : await api.post(`/${resource}`, payload);
      if (onSaved) await onSaved(saved, values, isEdit);
      message.success(t(isEdit ? 'Saved' : 'Created'));
      closeModal();
      load();
      onMutate?.();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record) => {
    try {
      await api.delete(`/${resource}/${record._id}`);
      message.success(t('Deleted'));
      // Step back a page if we just removed the last row on it.
      if (data.items.length === 1 && pagination.current > 1) {
        setPagination((p) => ({ ...p, current: p.current - 1 }));
      } else {
        load();
      }
      onMutate?.();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const hasActions = !!rowActions || canEdit || canDelete;
  const allColumns = [
    ...columns.map((c) => (typeof c.title === 'string' ? { ...c, title: t(c.title) } : c)),
    ...(hasActions
      ? [
          {
            title: t('Actions'),
            key: 'actions',
            fixed: 'right',
            width: rowActions ? 150 : 100,
            render: (_, record) => (
              <Space size={0} className="row-actions">
                {rowActions?.(record, load)}
                {canEdit && (
                  <Tooltip title={t('Edit')}>
                    <Button type="text" icon={<EditOutlined />} style={{ color: '#1664ff' }} onClick={() => openModal(record)} />
                  </Tooltip>
                )}
                {canDelete && (
                  <Popconfirm title={t('Delete this record?')} okText={t('Delete')} cancelText={t('Cancel')} okButtonProps={{ danger: true }} onConfirm={() => remove(record)}>
                    <Tooltip title={t('Delete')}>
                      <Button type="text" danger icon={<DeleteOutlined />} />
                    </Tooltip>
                  </Popconfirm>
                )}
              </Space>
            ),
          },
        ]
      : []),
  ];

  return (
    <Card className="page-card" bordered={false}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {t(title)}
        </h1>
        <Space wrap>
          {toolbarExtra?.({ query })}
          {canCreate && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              {t(addText)}
            </Button>
          )}
        </Space>
      </Flex>

      <Flex gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#98a2b3' }} />}
          placeholder={t(searchPlaceholder)}
          value={searchText}
          onChange={(e) => {
            setSearchText(e.target.value);
            if (!e.target.value) {
              setSearch('');
              setPagination((p) => ({ ...p, current: 1 }));
            }
          }}
          onPressEnter={() => {
            setSearch(searchText.trim());
            setPagination((p) => ({ ...p, current: 1 }));
          }}
          style={{ flex: '1 1 260px', maxWidth: 420 }}
        />
        {dateFilter && (
          <Space.Compact>
            <DatePicker
              value={date}
              onChange={setDate}
              placeholder={t('All dates')}
              allowClear
              style={{ width: 150 }}
              aria-label={t(dateFilter.label || 'Date')}
            />
            <Button onClick={() => setDate(dayjs())} disabled={!!date && date.isSame(dayjs(), 'day')}>
              {t('Today')}
            </Button>
          </Space.Compact>
        )}
        {filters.map((f) => (
          <Select
            key={f.name}
            allowClear
            placeholder={t(f.placeholder)}
            options={f.options.map((o) => (typeof o.label === 'string' ? { ...o, label: t(o.label) } : o))}
            value={filterValues[f.name]}
            onChange={(v) => setFilter(f.name, v)}
            style={{ minWidth: f.width || 160 }}
            popupMatchSelectWidth={false}
          />
        ))}
      </Flex>

      <Table
        rowKey="_id"
        loading={loading}
        columns={allColumns}
        dataSource={data.items}
        scroll={{ x: 'max-content' }}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: data.total,
          showSizeChanger: true,
          pageSizeOptions: [8, 20, 50, 100],
          showTotal: (total, [from, to]) => t('Showing {from}-{to} of {total}', { from, to, total: total.toLocaleString() }),
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
      />

      <Modal
        title={t(modalTitle(modal.record))}
        open={modal.open}
        onOk={save}
        onCancel={closeModal}
        confirmLoading={saving}
        okText={t('Save')}
        cancelText={t('Cancel')}
        width={modalWidth}
        destroyOnClose
        maskClosable={false}
      >
        {modal.open && (
          <Form
            form={form}
            layout="vertical"
            preserve={false}
            initialValues={modal.record ? toForm(modal.record) : initialValues}
            style={{ marginTop: 16 }}
          >
            {renderForm(modal.record)}
          </Form>
        )}
      </Modal>
    </Card>
  );
}
