import { Tag } from 'antd';

const COLORS = {
  Active: 'green',
  Published: 'green',
  Passed: 'green',
  Accepted: 'green',
  Pending: 'orange',
  Draft: 'default',
  'On Leave': 'gold',
  Inactive: 'default',
  Graduated: 'blue',
  Suspended: 'red',
  Rejected: 'red',
  Failed: 'red',
  General: 'blue',
  Event: 'magenta',
  Notice: 'cyan',
  Submitted: 'blue',
  Reviewed: 'green',
  Issued: 'blue',
  'In Progress': 'gold',
  Completed: 'green',
  Cancelled: 'default',
  Low: 'default',
  Normal: 'blue',
  High: 'orange',
  Urgent: 'red',
  Online: 'green',
  Offline: 'red',
  Maintenance: 'orange',
  Sent: 'green',
  Info: 'blue',
  Success: 'green',
  Warning: 'orange',
  Alert: 'red',
  admin: 'geekblue',
  staff: 'default',
};

export default function StatusTag({ value }) {
  if (!value) return null;
  return (
    <Tag color={COLORS[value] || 'default'} bordered={false}>
      {value}
    </Tag>
  );
}
