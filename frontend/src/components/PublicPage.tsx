import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Layout, Typography } from 'antd';
import { api, unwrap } from '../api/client';
import type { SiteInfo } from '../types';

const { Header, Content } = Layout;
const { Paragraph, Text, Title } = Typography;

interface PublicPageProps {
  brand?: string;
  title?: string;
  subtitle?: string;
  extra?: ReactNode;
  children: ReactNode;
}

export function PublicPage({ brand, title, subtitle, extra, children }: PublicPageProps) {
  const [site, setSite] = useState<SiteInfo | null>(null);

  useEffect(() => {
    unwrap<SiteInfo>(api.get('/api/public/site'))
      .then(setSite)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const code = site?.extra_js?.trim();
    if (!code) {
      return;
    }
    const script = document.createElement('script');
    script.setAttribute('data-managed', 'nicefk-extra-js');
    script.text = code;
    document.body.appendChild(script);
    return () => {
      script.remove();
    };
  }, [site?.extra_js]);

  const displayBrand = brand ?? site?.site_name ?? '';

  return (
    <Layout className="public-layout">
      <Header className="public-layout__header">
        <div>{displayBrand ? <Text className="public-layout__brand">{displayBrand}</Text> : null}</div>
        {extra}
      </Header>
      <Content className="public-layout__content">
        <div className="page-shell page-shell--public">
          {title ? (
            <div className="page-hero page-hero--compact">
              <Title level={1} className="page-hero__title">
                {title}
              </Title>
              {subtitle ? <Paragraph className="page-hero__subtitle">{subtitle}</Paragraph> : null}
            </div>
          ) : null}
          {children}
        </div>
      </Content>
    </Layout>
  );
}
