import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Alert, Button, Checkbox, Flex, Form, Input, Tooltip, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from '../context/AuthContext';
import { useSettings } from '../context/SettingsContext';
import { ShieldIcon } from '../components/Logo';
import { errMsg } from '../api';

export default function Login() {
  const { user, login } = useAuth();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  if (user) return <Navigate to="/dashboard" replace />;

  const onFinish = async (values) => {
    setError('');
    setLoading(true);
    try {
      await login(values);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-hero">
        <div className="login-brand">
          {settings.logo ? (
            <img src={settings.logo} alt="School logo" style={{ width: 72, height: 72, objectFit: 'contain' }} />
          ) : (
            <ShieldIcon size={72} />
          )}
          <div>
            <h1>{settings.schoolName}</h1>
            <h2>Administrative Management System</h2>
          </div>
        </div>
        <p className="login-tagline">
          Manage Students · Faculty · Courses · Resources
          <br />
          Build a Smarter Campus
        </p>
        <div className="login-campus" aria-hidden="true">
          <div className="bldg b1" />
          <div className="bldg b2" />
          <div className="bldg b3" />
        </div>
      </div>

      <div className="login-panel">
        <div className="login-card">
          <Typography.Title level={3} style={{ marginBottom: 4 }}>
            Welcome Back
          </Typography.Title>
          <Typography.Text type="secondary">Please login to your account</Typography.Text>

          {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}

          <Form layout="vertical" size="large" onFinish={onFinish} initialValues={{ remember: true }} style={{ marginTop: 24 }}>
            <Form.Item name="username" rules={[{ required: true, message: 'Please enter your username' }]}>
              <Input prefix={<UserOutlined />} placeholder="Username" autoComplete="username" />
            </Form.Item>
            <Form.Item name="password" rules={[{ required: true, message: 'Please enter your password' }]}>
              <Input.Password prefix={<LockOutlined />} placeholder="Password" autoComplete="current-password" />
            </Form.Item>
            <Flex justify="space-between" align="center" style={{ marginBottom: 24 }}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>Remember me</Checkbox>
              </Form.Item>
              <Tooltip title="Contact an administrator to reset your password">
                <Typography.Link style={{ fontSize: 13 }}>Forgot password?</Typography.Link>
              </Tooltip>
            </Flex>
            <Button type="primary" htmlType="submit" block loading={loading}>
              Login
            </Button>
          </Form>
        </div>
      </div>
    </div>
  );
}
