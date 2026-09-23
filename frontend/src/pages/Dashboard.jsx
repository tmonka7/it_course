import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { App, Button, Card, Col, Flex, Row, Skeleton, Table } from 'antd';
import { ArrowUpOutlined, BookOutlined, FileAddOutlined, SolutionOutlined, TeamOutlined } from '@ant-design/icons';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import api, { errMsg } from '../api';
import { DEPARTMENT_COLORS } from '../constants';

const STAT_CARDS = [
  { key: 'students', label: 'Total Students', icon: <TeamOutlined />, className: 'stat-blue', to: '/students' },
  { key: 'faculty', label: 'Total Faculty', icon: <SolutionOutlined />, className: 'stat-green', to: '/faculty' },
  { key: 'courses', label: 'Total Courses', icon: <BookOutlined />, className: 'stat-purple', to: '/courses' },
  { key: 'pendingApplications', label: 'Pending Applications', icon: <FileAddOutlined />, className: 'stat-orange', to: '/admissions' },
];

const activityColumns = [
  { title: 'Time', dataIndex: 'createdAt', render: (v) => dayjs(v).format('YYYY-MM-DD HH:mm'), width: 160 },
  { title: 'User', dataIndex: 'user', width: 100 },
  { title: 'Action', dataIndex: 'action' },
  { title: 'Details', dataIndex: 'details' },
];

export default function Dashboard() {
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [data, setData] = useState(null);

  useEffect(() => {
    api
      .get('/dashboard')
      .then(({ data: res }) => setData(res))
      .catch((err) => message.error(errMsg(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!data) return <Skeleton active paragraph={{ rows: 12 }} />;

  const totalStudents = data.distribution.reduce((s, d) => s + d.value, 0);

  return (
    <>
      <h1 className="page-title">Dashboard</h1>

      <Row gutter={[16, 16]}>
        {STAT_CARDS.map((c) => {
          const stat = data.stats[c.key];
          // Share of the current total that arrived this month.
          const growth = stat.total ? Math.round((stat.thisMonth / stat.total) * 100) : 0;
          return (
            <Col xs={24} sm={12} xl={6} key={c.key}>
              <div
                className={`stat-card ${c.className}`}
                onClick={() => navigate(c.to)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    navigate(c.to);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-label={`${c.label}: ${stat.total.toLocaleString()}, ${stat.thisMonth} added this month`}
              >
                <div className="stat-icon">{c.icon}</div>
                <div className="stat-label">{c.label}</div>
                <Flex justify="space-between" align="flex-end" gap={8}>
                  <div className="stat-value">{stat.total.toLocaleString()}</div>
                  <div className="stat-delta" title={`+${stat.thisMonth} this month`}>
                    <ArrowUpOutlined /> {growth}%
                  </div>
                </Flex>
              </div>
            </Col>
          );
        })}
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} xl={15}>
          <Card title="Student Enrollment Trend" bordered={false} className="page-card">
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={data.enrollmentTrend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <defs>
                  <linearGradient id="enrollFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1664ff" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="#1664ff" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eef1f6" />
                <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={12} />
                <YAxis tickLine={false} axisLine={false} fontSize={12} allowDecimals={false} />
                <Tooltip formatter={(v) => [v, 'Students']} />
                <Area
                  type="monotone"
                  dataKey="students"
                  stroke="#1664ff"
                  strokeWidth={2.5}
                  fill="url(#enrollFill)"
                  dot={{ r: 3, fill: '#fff', strokeWidth: 2 }}
                  connectNulls={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card
            title="Student Distribution"
            bordered={false}
            className="page-card"
            extra={
              <Button type="link" size="small" onClick={() => navigate('/students')}>
                View All
              </Button>
            }
          >
            <Flex align="center" gap={16} wrap="wrap" justify="center">
              <div style={{ position: 'relative', width: 180, height: 180 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={data.distribution} dataKey="value" nameKey="name" innerRadius={58} outerRadius={85} paddingAngle={2} stroke="none">
                      {data.distribution.map((d) => (
                        <Cell key={d.name} fill={DEPARTMENT_COLORS[d.name] || '#bfbfbf'} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
                <div className="donut-center">
                  <div className="donut-value">{totalStudents.toLocaleString()}</div>
                  <div className="donut-label">Total</div>
                </div>
              </div>
              <div style={{ flex: 1, minWidth: 180 }}>
                {data.distribution.map((d) => (
                  <Flex key={d.name} justify="space-between" className="legend-row">
                    <span>
                      <span className="legend-dot" style={{ background: DEPARTMENT_COLORS[d.name] || '#bfbfbf' }} />
                      {d.name}
                    </span>
                    <strong>{totalStudents ? Math.round((d.value / totalStudents) * 100) : 0}%</strong>
                  </Flex>
                ))}
              </div>
            </Flex>
          </Card>
        </Col>
      </Row>

      <Card
        title="Recent Activities"
        bordered={false}
        className="page-card"
        style={{ marginTop: 16 }}
        extra={
          <Button type="link" size="small" onClick={() => navigate('/announcements')}>
            View All
          </Button>
        }
      >
        <Table
          rowKey="_id"
          size="small"
          columns={activityColumns}
          dataSource={data.recentActivities}
          pagination={false}
          scroll={{ x: 'max-content' }}
        />
      </Card>
    </>
  );
}
