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
