import { useCallback, useEffect, useMemo, useState } from 'react';
import { App, Badge, Button, Calendar, Card, Empty, Flex, Form, Input, Modal, Popconfirm, Segmented, Select, Space, Spin, Typography } from 'antd';
import { LeftOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';
import { DEPARTMENT_COLORS, PERIODS, WEEKDAYS } from '../constants';

// Monday of the week containing `d` (dayjs weeks start on Sunday by default).
const mondayOf = (d) => d.subtract((d.day() + 6) % 7, 'day').startOf('day');
// 1 = Monday ... 5 = Friday; 0/6 for weekend days.
const isoDay = (d) => (d.day() === 0 ? 7 : d.day());

function SlotCard({ slot, onClick }) {
  const color = DEPARTMENT_COLORS[slot.course?.department] || '#1664ff';
  return (
    <button type="button" className="slot-card" style={{ borderColor: color, background: `${color}14` }} onClick={onClick}>
      <strong style={{ color }}>{slot.course?.code}</strong>
      <span>{slot.room}</span>
      <span className="slot-sub">{slot.course?.instructor?.name}</span>
    </button>
  );
}

export default function Schedule() {
  const { message } = App.useApp();
  const [view, setView] = useState('Week');
  const [date, setDate] = useState(dayjs());
  const [slots, setSlots] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState({ open: false, record: null, defaults: null });
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get('/schedules', { params: { pageSize: 1000 } });
      setSlots(data.items);
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
    api
      .get('/courses', { params: { pageSize: 1000, status: 'Active' } })
      .then(({ data }) => setCourses(data.items.map((c) => ({ value: c._id, label: `${c.code} ${c.name}` }))))
      .catch(() => {});
  }, [load]);

  const grid = useMemo(() => {
    const map = {};
    slots.forEach((s) => {
      const key = `${s.day}-${s.period}`;
      (map[key] = map[key] || []).push(s);
    });
    return map;
  }, [slots]);

  const monday = mondayOf(date);
  const days = view === 'Day' ? [isoDay(date)].filter((d) => d <= 5) : [1, 2, 3, 4, 5];

  const shift = (dir) => setDate((d) => d.add(dir, view === 'Month' ? 'month' : view === 'Week' ? 'week' : 'day'));

  const rangeLabel =
    view === 'Month'
      ? date.format('MMMM YYYY')
      : view === 'Week'
        ? `${monday.format('YYYY-MM-DD')} ~ ${monday.add(4, 'day').format('MM-DD')}`
        : date.format('YYYY-MM-DD dddd');

  const openModal = (record, defaults) => setModal({ open: true, record, defaults });
  const closeModal = () => setModal({ open: false, record: null, defaults: null });

  const save = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (modal.record) await api.put(`/schedules/${modal.record._id}`, values);
      else await api.post('/schedules', values);
      message.success('Schedule saved');
      closeModal();
      load();
    } catch (err) {
      message.error(errMsg(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await api.delete(`/schedules/${modal.record._id}`);
      message.success('Class removed');
      closeModal();
      load();
    } catch (err) {
      message.error(errMsg(err));
    }
  };

  const renderGrid = () => {
    if (!days.length) return <Empty description="No classes on weekends" style={{ padding: 48 }} />;
    return (
      <div className="schedule-scroll">
        <div className="schedule-grid" style={{ gridTemplateColumns: `110px repeat(${days.length}, minmax(140px, 1fr))` }}>
          <div className="sg-head">Time</div>
          {days.map((d) => {
            const dayDate = monday.add(d - 1, 'day');
            const today = dayDate.isSame(dayjs(), 'day');
            return (
              <div key={d} className={`sg-head ${today ? 'sg-today' : ''}`}>
                {WEEKDAYS[d - 1]}
                <div className="sg-date">{dayDate.format('MM/DD')}</div>
              </div>
            );
          })}
          {PERIODS.map((label, period) => (
            <div key={label} style={{ display: 'contents' }}>
              <div className="sg-time">{label}</div>
              {days.map((d) => (
                <div
                  key={d}
                  className="sg-cell"
                  onClick={(e) => e.target === e.currentTarget && openModal(null, { day: d, period })}
                  title="Click an empty area to add a class"
                >
                  {(grid[`${d}-${period}`] || []).map((s) => (
                    <SlotCard key={s._id} slot={s} onClick={() => openModal(s)} />
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonth = () => (
    <Calendar
      value={date}
      headerRender={() => null}
      onSelect={(d, { source }) => {
        setDate(d);
        if (source === 'date') setView('Day');
      }}
      cellRender={(d, info) => {
        if (info.type !== 'date') return info.originNode;
        const daySlots = slots.filter((s) => s.day === isoDay(d)).sort((a, b) => a.period - b.period);
        return (
          <ul className="month-events">
            {daySlots.slice(0, 3).map((s) => (
              <li key={s._id}>
                <Badge color={DEPARTMENT_COLORS[s.course?.department] || '#1664ff'} text={`${s.course?.code} ${PERIODS[s.period].slice(0, 5)}`} />
              </li>
            ))}
            {daySlots.length > 3 && <li className="slot-sub">+{daySlots.length - 3} more</li>}
          </ul>
        );
      }}
    />
  );

  return (
    <Card className="page-card" bordered={false}>
      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <Typography.Title level={4} style={{ margin: 0 }}>
          Class Schedule
        </Typography.Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openModal(null, { day: Math.min(isoDay(date), 5), period: 0 })}>
          Add Class
        </Button>
      </Flex>

      <Flex justify="space-between" align="center" wrap="wrap" gap={12} style={{ marginBottom: 16 }}>
        <Space>
          <Button icon={<LeftOutlined />} onClick={() => shift(-1)} />
          <Typography.Text strong style={{ minWidth: 170, display: 'inline-block', textAlign: 'center' }}>
            {rangeLabel}
          </Typography.Text>
          <Button icon={<RightOutlined />} onClick={() => shift(1)} />
          <Button onClick={() => setDate(dayjs())}>Today</Button>
        </Space>
        <Segmented options={['Day', 'Week', 'Month']} value={view} onChange={setView} />
      </Flex>

      <Spin spinning={loading}>{view === 'Month' ? renderMonth() : renderGrid()}</Spin>

      <Modal
        title={modal.record ? 'Edit Class' : 'Add Class'}
        open={modal.open}
        onCancel={closeModal}
        destroyOnClose
        footer={
          <Flex justify="space-between">
            <div>
              {modal.record && (
                <Popconfirm title="Remove this class from the schedule?" okButtonProps={{ danger: true }} onConfirm={remove}>
                  <Button danger>Delete</Button>
                </Popconfirm>
              )}
            </div>
            <Space>
              <Button onClick={closeModal}>Cancel</Button>
              <Button type="primary" loading={saving} onClick={save}>
                Save
              </Button>
            </Space>
          </Flex>
        }
      >
        {modal.open && (
          <Form
            form={form}
            layout="vertical"
            preserve={false}
            style={{ marginTop: 16 }}
            initialValues={
              modal.record
                ? { course: modal.record.course?._id, day: modal.record.day, period: modal.record.period, room: modal.record.room }
                : modal.defaults
            }
          >
            <Form.Item name="course" label="Course" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label" options={courses} placeholder="Select course" />
            </Form.Item>
            <Flex gap={16}>
              <Form.Item name="day" label="Day" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Select options={WEEKDAYS.map((w, i) => ({ label: w, value: i + 1 }))} />
              </Form.Item>
              <Form.Item name="period" label="Time" rules={[{ required: true }]} style={{ flex: 1 }}>
                <Select options={PERIODS.map((p, i) => ({ label: p, value: i }))} />
              </Form.Item>
            </Flex>
            <Form.Item name="room" label="Room" rules={[{ required: true }]}>
              <Input placeholder="e.g. Room 101" />
            </Form.Item>
          </Form>
        )}
      </Modal>
    </Card>
  );
}
