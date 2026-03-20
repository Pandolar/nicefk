import type { ReactNode } from 'react';
import { Card, Col, Layout, Row, Space, Typography } from 'antd';

const { Content } = Layout;
const { Paragraph, Text, Title } = Typography;

interface AuthPageProps {
  eyebrow: string;
  title: string;
  description: string;
  tips?: string[];
  children: ReactNode;
}

export function AuthPage({ eyebrow, title, description, tips, children }: AuthPageProps) {
  return (
    <Layout className="auth-layout">
      <Content className="auth-layout__content">
        <Row gutter={[32, 32]} align="middle">
          <Col xs={24} lg={13}>
            <Space direction="vertical" size={20}>
              <Text className="auth-layout__eyebrow">{eyebrow}</Text>
              <Title className="auth-layout__title">{title}</Title>
              <Paragraph className="auth-layout__description">{description}</Paragraph>
              {tips?.length ? (
                <Space direction="vertical" size={12}>
                  {tips.map((tip) => (
                    <Card key={tip} size="small" className="auth-layout__tip">
                      {tip}
                    </Card>
                  ))}
                </Space>
              ) : null}
            </Space>
          </Col>
          <Col xs={24} lg={11}>
            <Card className="auth-layout__card" bordered={false}>
              {children}
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
