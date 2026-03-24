import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Typography } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage, unwrap } from '../api/client';
import { AuthPage } from '../components/AuthPage';
import type { LoginResult } from '../types';
import { AGENT_CODE_KEY, AGENT_TOKEN_KEY } from '../utils/auth';
import { buildConsolePageTitle } from '../utils/pageTitle';

export function AgentLoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ username: string; password: string }>();

  useEffect(() => {
    document.title = buildConsolePageTitle('代理登录', '代理后台');
  }, []);

  async function handleFinish(values: { username: string; password: string }) {
    try {
      const result = await unwrap<LoginResult>(api.post('/api/agent/auth/login', values));
      localStorage.setItem(AGENT_TOKEN_KEY, result.token);
      if (result.agent_code) {
        localStorage.setItem(AGENT_CODE_KEY, result.agent_code);
      }
      message.success('登录成功');
      navigate('/agent/dashboard');
    } catch (error) {
      message.error(getErrorMessage(error, '代理登录失败'));
    }
  }

  return (
    <AuthPage
      eyebrow="Agent Workspace"
      title="代理登录"
      description="输入账号密码后进入工作台。"
    >
      <Typography.Title level={3}>代理登录</Typography.Title>
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入代理用户名' }]}>
          <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入代理密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block>
          进入工作台
        </Button>
      </Form>
    </AuthPage>
  );
}
