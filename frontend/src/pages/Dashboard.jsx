import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Empty, Modal, Select, Skeleton, Table } from 'antd';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  BarChartOutlined,
  BookOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  SettingOutlined,
  TeamOutlined,
  UserAddOutlined,
  UsergroupAddOutlined,
} from '@ant-design/icons';
import { Area, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';
import { useSettings } from '../context/SettingsContext';
import { useAuth } from '../context/AuthContext';
import bannerImage from '../assets/welcome-banner.png';
import { t, T } from '../i18n';

const STAT_CARDS = [
  { key: 'students', label: 'Total Students', icon: <TeamOutlined />, tone: 'blue', to: '/students', page: 'students', period: 'vs. last semester' },
  { key: 'faculty', label: 'Total Faculty', icon: <UsergroupAddOutlined />, tone: 'purple', to: '/faculty', page: 'faculty', period: 'vs. last semester' },
  { key: 'courses', label: 'Total Courses', icon: <BookOutlined />, tone: 'green', to: '/courses', page: 'courses', period: 'vs. last semester' },
  { key: 'pendingApplications', label: 'Pending Applications', icon: <FileTextOutlined />, tone: 'orange', to: '/admissions', page: 'admissions', period: 'new vs. last week' },
];

const QUICK_ACTIONS = [
  { label: 'Add Student', icon: <UserAddOutlined />, to: '/students?new=1', tone: 'blue', page: 'students', action: 'create' },
  { label: 'Add Faculty', icon: <UsergroupAddOutlined />, to: '/faculty?new=1', tone: 'blue', page: 'faculty', action: 'create' },
  { label: 'Add Course', icon: <BookOutlined />, to: '/courses?new=1', tone: 'green', page: 'courses', action: 'create' },
  { label: 'Create Schedule', icon: <CalendarOutlined />, to: '/schedule', tone: 'blue', page: 'schedule', action: 'create' },
  { label: 'View Reports', icon: <BarChartOutlined />, to: '/grades', tone: 'purple', page: 'grades', action: 'view' },
  { label: 'System Settings', icon: <SettingOutlined />, to: '/settings', tone: 'blue' },
];

// Distribution slices are ranked by size; colours follow rank so the legend matches the mockup.
const SLICE_COLORS = ['#2f7bf5', '#2fc4a8', '#9b6cf0', '#f7b23b'];
const EVENT_DOTS = ['#2f7bf5', '#22c55e', '#f7b23b', '#ef4444'];

const activityColumns = [
  { title: <T>Date & Time</T>, dataIndex: 'createdAt', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'), width: 150 },
  { title: <T>User</T>, dataIndex: 'user', width: 90 },
  { title: <T>Action</T>, dataIndex: 'action', className: 'cell-link' },
  { title: <T>Details</T>, dataIndex: 'details', className: 'cell-link' },
];

function StatCard({ card, stat, onClick }) {
  const up = stat.change >= 0;
  return (
    <div
      className={`kpi-card kpi-${card.tone} ${onClick ? '' : 'static'}`}
      onClick={onClick}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault();
          onClick();
        }
      }}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={`${t(card.label)}: ${stat.total.toLocaleString()}, ${stat.change.toFixed(1)}% ${t(card.period)}`}
    >
      <div className="kpi-icon">{card.icon}</div>
      <div>
        <div className="kpi-label">{t(card.label)}</div>
        <div className="kpi-value">{stat.total.toLocaleString()}</div>
        <div className={`kpi-change ${card.tone === 'orange' || !up ? 'kpi-change-warn' : ''}`}>
          {up ? <ArrowUpOutlined /> : <ArrowDownOutlined />} {up ? '+' : ''}
          {stat.change.toFixed(1)}%
        </div>
        <div className="kpi-period">{t(card.period)}</div>
      </div>
    </div>
  );
}

function EnrollmentCard({ initial }) {
  const { message } = App.useApp();
  const [months, setMonths] = useState(6);
  const [trend, setTrend] = useState(initial);
  const firstRun = useRef(true);

  // The initial 6-month series comes with the dashboard payload; refetch only when the range changes.
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setTrend(null);
    api
      .get('/dashboard', { params: { months } })
      .then(({ data }) => setTrend(data.enrollmentTrend))
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [months]);

  return (
    <Card
      bordered={false}
      className="dash-card"
      title={
        <span>
          {t('Student')} <span className="text-primary">{t('Enrollment')}</span> {t('Trend')}
        </span>
      }
      extra={
        <Select
          size="small"
          value={months}
          onChange={setMonths}
          options={[
            { value: 6, label: t('Last 6 Months') },
            { value: 12, label: t('Last 12 Months') },
          ]}
          style={{ width: 130 }}
        />
      }
    >
      {trend ? (
        <>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={trend} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
              <defs>
                <linearGradient id="enrollFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2f7bf5" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="#2f7bf5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#eef1f6" />
              <XAxis dataKey="month" tickFormatter={(m) => t(m)} tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#667085' }} />
              <YAxis tickLine={false} axisLine={false} fontSize={11} tick={{ fill: '#667085' }} allowDecimals={false} />
              <Tooltip labelFormatter={(m) => t(m)} />
              <Area type="linear" dataKey="total" name={t('Total Students')} stroke="#2f7bf5" strokeWidth={2} fill="url(#enrollFill)" dot={{ r: 3.5, fill: '#2f7bf5' }} />
              <Line type="linear" dataKey="new" name={t('New Students')} stroke="#b4cdf7" strokeWidth={2} dot={{ r: 3, fill: '#b4cdf7' }} />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="chart-legend">
            <span>
              <i style={{ background: '#2f7bf5' }} /> {t('Total Students')}
            </span>
            <span>
              <i style={{ background: '#b4cdf7' }} /> {t('New Students')}
            </span>
          </div>
        </>
      ) : (
        <Skeleton active />
      )}
    </Card>
  );
}

function ActivitiesModal({ open, onClose }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    if (!open) return;
    api
      .get('/dashboard/activities')
      .then(({ data }) => setItems(data))
      .catch(() => setItems([]));
  }, [open]);
  return (
    <Modal title={t('All Activities')} open={open} onCancel={onClose} footer={null} width={820}>
      <Table rowKey="_id" size="small" columns={activityColumns} dataSource={items || []} loading={!items} pagination={{ pageSize: 10 }} scroll={{ x: 'max-content' }} />
    </Modal>
  );
}

export default function Dashboard() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const { settings } = useSettings();
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [activitiesOpen, setActivitiesOpen] = useState(false);

  useEffect(() => {
    api
      .get('/dashboard')
      .then(({ data: res }) => setData(res))
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <Skeleton active paragraph={{ rows: 14 }} />;

  const totalStudents = data.distribution.reduce((s, d) => s + d.value, 0);

  return (
    <div className="dash">
      <section className="welcome">
        <div className="welcome-art" style={{ backgroundImage: `url(${bannerImage})` }} aria-hidden="true" />
        <div className="welcome-text">
          <div className="welcome-kicker">{t('Welcome to the')}</div>
          <h1>{settings.schoolName}</h1>
          <div className="welcome-sub">{t('Administrative Management System')}</div>
          <p>{t('Manage students, faculty, courses, and campus resources efficiently for a smarter future.')}</p>
        </div>
      </section>

      <div className="kpi-grid">
        {STAT_CARDS.map((c) => (
          <StatCard key={c.key} card={c} stat={data.stats[c.key]} onClick={can(c.page) ? () => navigate(c.to) : undefined} />
        ))}
      </div>

      <div className="dash-grid">
        <div className="area-trend">
          <EnrollmentCard initial={data.enrollmentTrend} />
        </div>

        <Card bordered={false} className="dash-card area-dist" title={t('Student Distribution')}>
          <div className="dist-body">
            <div className="donut">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.distribution} dataKey="value" nameKey="name" innerRadius={48} outerRadius={70} startAngle={90} endAngle={-270} stroke="#fff" strokeWidth={2}>
                    {data.distribution.map((d, i) => (
                      <Cell key={d.name} fill={SLICE_COLORS[i % SLICE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, name) => [value, t(name)]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="donut-center">
                <div className="donut-value">{totalStudents.toLocaleString()}</div>
                <div className="donut-label">{t('Total')}</div>
              </div>
            </div>
            <div className="dist-legend">
              {data.distribution.map((d, i) => (
                <div key={d.name} className="legend-row">
                  <span>
                    <span className="legend-dot" style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }} />
                    {t(d.name)}
                  </span>
                  <strong>{totalStudents ? Math.round((d.value / totalStudents) * 100) : 0}%</strong>
                </div>
              ))}
            </div>
          </div>
        </Card>

        <Card
          bordered={false}
          className="dash-card area-events"
          title={t('Upcoming Events')}
          extra={
            can('announcements') && (
              <Button type="link" size="small" onClick={() => navigate('/announcements')}>
                {t('View All')}
              </Button>
            )
          }
        >
          {data.upcomingEvents.length ? (
            <ul className="event-list">
              {data.upcomingEvents.map((e, i) => {
                const d = dayjs(e.eventDate);
                return (
                  <li key={e._id}>
                    <div className="event-date">
                      <span>{d.format('MMM').toUpperCase()}</span>
                      <strong>{d.format('DD')}</strong>
                    </div>
                    <div className="event-info">
                      <div className="event-title">{e.title}</div>
                      {e.eventTime && (
                        <div className="event-meta">
                          <ClockCircleOutlined /> {e.eventTime}
                        </div>
                      )}
                      {e.location && (
                        <div className="event-meta">
                          <EnvironmentOutlined /> {e.location}
                        </div>
                      )}
                    </div>
                    <span className="event-dot" style={{ background: EVENT_DOTS[i % EVENT_DOTS.length] }} />
                  </li>
                );
              })}
            </ul>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('No upcoming events')} />
          )}
        </Card>

        <Card
          bordered={false}
          className="dash-card area-activity"
          title={t('Recent Activities')}
          extra={
            <Button type="link" size="small" onClick={() => setActivitiesOpen(true)}>
              {t('View All')}
            </Button>
          }
        >
          <Table rowKey="_id" size="small" columns={activityColumns} dataSource={data.recentActivities} pagination={false} scroll={{ x: 'max-content' }} />
        </Card>

        <Card bordered={false} className="dash-card area-actions" title={t('Quick Actions')}>
          <div className="quick-grid">
            {QUICK_ACTIONS.filter((a) => !a.page || can(a.page, a.action)).map((a) => (
              <button type="button" key={a.label} className={`quick-btn quick-${a.tone}`} onClick={() => navigate(a.to)}>
                <span className="quick-icon">{a.icon}</span>
                {t(a.label)}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <ActivitiesModal open={activitiesOpen} onClose={() => setActivitiesOpen(false)} />
    </div>
  );
}
