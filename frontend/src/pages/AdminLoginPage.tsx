import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { App, Button, Form, Input, Typography } from 'antd';
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getErrorMessage, unwrap } from '../api/client';
import { AuthPage } from '../components/AuthPage';
import type { LoginResult } from '../types';
import { ADMIN_TOKEN_KEY } from '../utils/auth';
import { buildConsolePageTitle } from '../utils/pageTitle';

export function AdminLoginPage() {
  const navigate = useNavigate();
  const { message } = App.useApp();
  const [form] = Form.useForm<{ username: string; password: string }>();

  useEffect(() => {
    document.title = buildConsolePageTitle('管理员登录', '管理后台');
  }, []);

  async function handleFinish(values: { username: string; password: string }) {
    try {
      const result = await unwrap<LoginResult>(api.post('/api/admin/auth/login', values));
      localStorage.setItem(ADMIN_TOKEN_KEY, result.token);
      message.success('登录成功');
      navigate('/admin/dashboard');
    } catch (error) {
      message.error(getErrorMessage(error, '管理员登录失败'));
    }
  }

  return (
    <AuthPage
      eyebrow="Admin Console"
      title="主流风格后台入口"
      description="采用更标准的中后台交互布局，登录后直接进入商品、订单、代理、渠道与配置管理。"
      tips={['支持商品、卡密、订单、代理、渠道统一管理', '渠道数据按浏览、下单、支付、金额四个维度汇总', '敏感配置继续通过统一配置中心维护']}
    >
      <Typography.Title level={3}>管理员登录</Typography.Title>
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入管理员用户名' }]}>
          <Input prefix={<UserOutlined />} placeholder="请输入用户名" autoComplete="username" />
        </Form.Item>
        <Form.Item name="password" label="密码" rules={[{ required: true, message: '请输入管理员密码' }]}>
          <Input.Password prefix={<LockOutlined />} placeholder="请输入密码" autoComplete="current-password" />
        </Form.Item>
        <Button type="primary" htmlType="submit" size="large" block>
          进入后台
        </Button>
      </Form>
    </AuthPage>
  );
}
