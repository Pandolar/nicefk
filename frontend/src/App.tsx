import { App as AntdApp, ConfigProvider, Spin, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { Suspense, lazy, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { readAdminToken, readAgentToken } from './utils/auth';

const PublicGoodsPage = lazy(() => import('./pages/PublicGoodsPage').then((module) => ({ default: module.PublicGoodsPage })));
const OrderStatusPage = lazy(() => import('./pages/OrderStatusPage').then((module) => ({ default: module.OrderStatusPage })));
const OrderSearchPage = lazy(() => import('./pages/OrderSearchPage').then((module) => ({ default: module.OrderSearchPage })));
const AdminLoginPage = lazy(() => import('./pages/AdminLoginPage').then((module) => ({ default: module.AdminLoginPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then((module) => ({ default: module.AdminDashboardPage })));
const AgentLoginPage = lazy(() => import('./pages/AgentLoginPage').then((module) => ({ default: module.AgentLoginPage })));
const AgentDashboardPage = lazy(() => import('./pages/AgentDashboardPage').then((module) => ({ default: module.AgentDashboardPage })));

function RequireAdmin({ children }: { children: JSX.Element }) {
  return readAdminToken() ? children : <Navigate to="/admin/login" replace />;
}

function RequireAgent({ children }: { children: JSX.Element }) {
  return readAgentToken() ? children : <Navigate to="/agent/login" replace />;
}

export default function App() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false;
    }
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = (event: MediaQueryListEvent | MediaQueryList) => {
      setIsDark(event.matches);
      document.documentElement.dataset.theme = event.matches ? 'dark' : 'light';
    };
    sync(media);
    const listener = (event: MediaQueryListEvent) => sync(event);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, []);

  return (
    <ConfigProvider
      locale={zhCN}
      theme={{
        algorithm: isDark ? theme.darkAlgorithm : theme.defaultAlgorithm,
        token: {
          colorPrimary: '#1677ff',
          colorSuccess: '#16a34a',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          borderRadius: 12,
          colorBgLayout: isDark ? '#0f172a' : '#f5f7fb',
          fontSize: 14
        }
      }}
    >
      <AntdApp>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route path="/" element={<Navigate to="/goods/1" replace />} />
            <Route path="/goods/:goodsId" element={<PublicGoodsPage />} />
            <Route path="/order/:orderNo" element={<OrderStatusPage />} />
            <Route path="/orders/query" element={<OrderSearchPage />} />
            <Route path="/payment-return" element={<OrderStatusPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/admin/dashboard" element={<Navigate to="/admin/dashboard/overview" replace />} />
            <Route
              path="/admin/dashboard/:section"
              element={
                <RequireAdmin>
                  <AdminDashboardPage />
                </RequireAdmin>
              }
            />
            <Route path="/agent/login" element={<AgentLoginPage />} />
            <Route path="/agent/dashboard" element={<Navigate to="/agent/dashboard/overview" replace />} />
            <Route
              path="/agent/dashboard/:section"
              element={
                <RequireAgent>
                  <AgentDashboardPage />
                </RequireAgent>
              }
            />
          </Routes>
        </Suspense>
      </AntdApp>
    </ConfigProvider>
  );
}

function RouteFallback() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center'
      }}
    >
      <Spin size="large" />
    </div>
  );
}
