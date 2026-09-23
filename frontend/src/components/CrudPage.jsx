import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { App, Button, Card, Flex, Form, Input, Modal, Popconfirm, Select, Space, Table, Tooltip } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import api, { errMsg } from '../api';

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
}) {
  const { message } = App.useApp();
  const [searchParams] = useSearchParams();
  const urlQuery = searchParams.get('q') || '';

  const [searchText, setSearchText] = useState(urlQuery);
  const [search, setSearch] = useState(urlQuery);
  const [filterValues, setFilterValues] = useState({});
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

  const query = useMemo(() => compact({ q: search, ...filterValues }), [search, filterValues]);

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
  }, [load]);

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
      if (modal.record) {
        await api.put(`/${resource}/${modal.record._id}`, payload);
        message.success('Saved');
      } else {
        await api.post(`/${resource}`, payload);
        message.success('Created');
      }
      closeModal();
      load();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (record) => {
    try {
      await api.delete(`/${resource}/${record._id}`);
      message.success('Deleted');
      // Step back a page if we just removed the last row on it.
      if (data.items.length === 1 && pagination.current > 1) {
        setPagination((p) => ({ ...p, current: p.current - 1 }));
      } else {
        load();
      }
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const allColumns = [
    ...columns,
    {
      title: 'Actions',
      key: 'actions',
      fixed: 'right',
      width: rowActions ? 150 : 100,
      render: (_, record) => (
        <Space size={0} className="row-actions">
          {rowActions?.(record, load)}
          {canWrite && (
            <>
              <Tooltip title="Edit">
                <Button type="text" icon={<EditOutlined />} style={{ color: '#1664ff' }} onClick={() => openModal(record)} />
              </Tooltip>
              <Popconfirm title="Delete this record?" okText="Delete" okButtonProps={{ danger: true }} onConfirm={() => remove(record)}>
                <Tooltip title="Delete">
                  <Button type="text" danger icon={<DeleteOutlined />} />
                </Tooltip>
              </Popconfirm>
            </>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card className="page-card" bordered={false}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        <Space wrap>
          {toolbarExtra?.({ query })}
          {canWrite && (
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal()}>
              {addText}
            </Button>
          )}
        </Space>
      </Flex>

      <Flex gap={12} wrap="wrap" style={{ marginBottom: 16 }}>
        <Input
          allowClear
          prefix={<SearchOutlined style={{ color: '#98a2b3' }} />}
          placeholder={searchPlaceholder}
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
        {filters.map((f) => (
          <Select
            key={f.name}
            allowClear
            placeholder={f.placeholder}
            options={f.options}
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
          showTotal: (total, [from, to]) => `Showing ${from}-${to} of ${total.toLocaleString()}`,
          onChange: (current, pageSize) => setPagination({ current, pageSize }),
        }}
      />

      <Modal
        title={modalTitle(modal.record)}
        open={modal.open}
        onOk={save}
        onCancel={closeModal}
        confirmLoading={saving}
        okText="Save"
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
