import { useEffect, useMemo, useState } from 'react';
import { App, Button, Calendar, Card, Space, Typography } from 'antd';
import { LeftOutlined, RightOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';

/**
 * Month calendar for a dated resource. Each day cell shows `renderDay(items)`; today is highlighted and the
 * selected day is reported through `onSelect` (the page shows that day's records below).
 */
export default function CalendarBoard({ title, resource, dateField = 'date', value, onSelect, renderDay, refreshKey, legend }) {
  const { message } = App.useApp();
  const [month, setMonth] = useState(() => (value || dayjs()).startOf('month'));
  const [items, setItems] = useState([]);

  // Follow the selected day into another month (e.g. picked in the list's date picker).
  useEffect(() => {
    if (value && !value.isSame(month, 'month')) setMonth(value.startOf('month'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    // The grid also shows the tail of the previous and the head of the next month.
    const from = month.startOf('month').subtract(7, 'day').startOf('day');
    const to = month.endOf('month').add(14, 'day').startOf('day');
    api
      .get(`/${resource}`, { params: { dateFrom: from.toISOString(), dateTo: to.toISOString(), pageSize: 1000 } })
      .then(({ data }) => setItems(data.items))
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource, month, refreshKey]);

  const byDay = useMemo(() => {
    const map = {};
    items.forEach((it) => {
      const key = dayjs(it[dateField]).format('YYYY-MM-DD');
      (map[key] = map[key] || []).push(it);
    });
    return map;
  }, [items, dateField]);

  const goto = (m) => setMonth(m.startOf('month'));
  const today = dayjs();

  return (
    <Card className="page-card calendar-board" bordered={false}>
      <div className="calendar-head">
        <h1 className="page-title" style={{ margin: 0 }}>
          {title}
        </h1>
        <Space wrap>
          {legend}
          <Button icon={<LeftOutlined />} onClick={() => goto(month.subtract(1, 'month'))} aria-label="Previous month" />
          <Typography.Text strong className="calendar-month">
            {month.format('MMMM YYYY')}
          </Typography.Text>
          <Button icon={<RightOutlined />} onClick={() => goto(month.add(1, 'month'))} aria-label="Next month" />
          <Button
            onClick={() => {
              goto(today);
              onSelect(today);
            }}
          >
            Today
          </Button>
        </Space>
      </div>
      <Calendar
        value={value && value.isSame(month, 'month') ? value : month}
        headerRender={() => null}
        onSelect={(d, info) => {
          if (info?.source === 'date' || !info) onSelect(d);
        }}
        onPanelChange={(d) => goto(d)}
        fullCellRender={(d, info) => {
          if (info.type !== 'date') return info.originNode;
          const key = d.format('YYYY-MM-DD');
          const dayItems = byDay[key] || [];
          const classes = [
            'cal-cell',
            d.isSame(today, 'day') ? 'is-today' : '',
            value && d.isSame(value, 'day') ? 'is-selected' : '',
            d.isSame(month, 'month') ? '' : 'is-other-month',
          ].join(' ');
          return (
            <div className={classes}>
              <div className="cal-date">
                <span>{d.date()}</span>
                {d.isSame(today, 'day') && <span className="cal-today-tag">Today</span>}
              </div>
              <div className="cal-items">{dayItems.length > 0 && renderDay(dayItems, d)}</div>
            </div>
          );
        }}
      />
    </Card>
  );
}
