# nicefk 详细设计文档

## 1. 项目目标

nicefk 是一个面向数字卡密销售的发卡系统，核心目标：
- 用户进入商品页后，可查看公告、商品封面、介绍、价格和支付方式
- 用户填写手机号或邮箱后，调用 ePay 发起支付
- 支付成功后，系统自动发放商品对应卡密，并可按商品模板发送发货邮件
- 如果流量来自代理链接，系统需记录一级代理和来源渠道
- 管理员可维护商品、卡密、配置和订单
- 管理员可维护一级代理名下的多个来源渠道
- 一级代理可登录后台，只查看自己的支付成功流水和渠道数据

## 2. 技术选型

### 后端
- FastAPI：API 服务和静态资源服务
- SQLAlchemy 2.x：ORM 和事务处理
- APScheduler：定时任务
- Redis：配置缓存、登录态、支付幂等锁
- MySQL：业务主库

### 前端
- React + Vite + TypeScript
- pnpm：前端依赖管理

### 部署
- 单 Docker 镜像，多阶段构建
- MySQL、Redis 作为外部依赖或通过 docker-compose 启动

## 3. 核心业务流程

### 3.1 下单流程
1. 前端打开 `/goods/:id`
2. 后端返回站点公告和商品详情
3. 若 URL 存在 `agent_code` 和 `channel_code`，前端将其存入本地并在下单时提交
4. 用户输入手机号或邮箱并选择支付方式
5. 后端校验商品状态、联系方式和库存
6. 后端创建 `pending` 状态订单，并计算过期时间
7. 若来自来源渠道链接，系统记录渠道浏览和下单统计
8. 后端根据 ePay 配置生成签名参数，返回支付表单参数
8. 前端跳转到 ePay 支付页

### 3.2 支付成功流程
1. ePay 调用异步回调接口 `/api/payments/epay/notify`
2. 后端验签、校验金额和订单状态
3. 开启事务，锁定一条未售卡密
4. 更新卡密状态为 `sold`
5. 更新订单状态为 `delivered`，记录支付时间、发卡时间和卡密快照
6. 若订单带有来源渠道，则累计该渠道的支付成功单数与支付金额
7. 返回 `success`

### 3.3 回调补偿流程
- APScheduler 每 3 分钟执行一次待支付订单核验任务
- 对所有 `pending` 订单主动调用 ePay 查单
- 如果订单已支付但回调未成功，则执行补单发卡逻辑
- 如果订单创建时间已超过 5 分钟且仍未支付，则标记 `expired`

## 4. 数据表设计

### 4.1 `fk_goods`
- `id`：主键
- `title`：商品标题
- `slug`：短链接标识，可选
- `cover`：封面图片 URL
- `description`：商品介绍
- `price`：销售价格
- `original_price`：原价，可选
- `status`：`on/off`
- `contact_type`：`phone/email/both`
- `pay_methods`：JSON 数组
- `stock_display_mode`：前台库存展示方式
- `stock_display_text`：自定义库存文案
- `email_enabled`：是否启用自动发货邮件
- `email_subject_template`：商品邮件标题模板
- `email_body_template`：商品邮件正文模板
- `sort_order`：排序值
- `created_at` / `updated_at`

### 4.2 `fk_cdk`
- `id`：主键
- `goods_id`：所属商品
- `card_code`：卡密内容
- `card_secret`：可选的密钥字段
- `status`：`unused/locked/sold/invalid`
- `order_id`：关联订单 ID
- `locked_at` / `sold_at`
- `created_at` / `updated_at`

### 4.3 `fk_orders`
- `id`：主键
- `order_no`：站内订单号，唯一
- `trade_no`：ePay 平台订单号
- `goods_id`：商品 ID
- `buyer_contact`：手机号或邮箱
- `contact_type`：`phone/email`
- `amount`：订单金额
- `pay_method`：支付方式
- `status`：`pending/paid/delivered/expired/failed`
- `card_id`：发出的卡密 ID
- `card_snapshot`：发卡快照 JSON
- `agent_code`：代理标识
- `agent_name`：代理名称快照
- `source_raw`：原始来源参数 JSON，内含来源渠道快照
- `source_from`：来源类型，如 `agent_link`
- `pay_time` / `deliver_time` / `expire_time`
- `email_status` / `email_sent_at` / `email_error`
- `created_at` / `updated_at`

### 4.4 `fk_config`
- `id`：主键
- `config_key`：配置键，唯一
- `config_value`：配置值文本
- `config_type`：`string/int/bool/json/text`
- `group_name`：分组
- `description`：说明
- `is_sensitive`：是否敏感
- `created_at` / `updated_at`

## 5. 配置设计

### 5.1 站点配置
- `SITE_NAME`
- `SITE_NOTICE`
- `SITE_FOOTER`
- `SITE_URL`
- `SITE_EXTRA_JS`

### 5.2 支付配置
- `PAY_EPAY_PID`
- `PAY_EPAY_KEY`
- `PAY_EPAY_API_URL`
- `PAY_EPAY_SUBMIT_URL`
- `PAY_EPAY_QUERY_URL`
- `PAY_NOTIFY_URL`
- `PAY_RETURN_URL`
- `ORDER_EXPIRE_MINUTES`

### 5.3 邮件配置
- `SMTP_SERVER`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`
- `EMAIL_ENABLED`
- `EMAIL_DEFAULT_SUBJECT`
- `EMAIL_DEFAULT_TEMPLATE`

### 5.4 权限配置
- `ADMIN_ACCOUNTS`
- `AGENT_ACCOUNTS`
- `AGENT_CHANNELS`

`AGENT_ACCOUNTS` 采用 JSON 数组，结构如下：

```json
[
  {
    "agent_code": "agent_demo",
    "agent_name": "演示代理",
    "username": "agent_demo",
    "password_hash": "...",
    "status": 1,
    "allowed_goods_ids": []
  }
]
```

`AGENT_CHANNELS` 采用 JSON 数组，结构如下：

```json
[
  {
    "agent_code": "agent_demo",
    "channel_code": "blogger_demo",
    "channel_name": "演示博主",
    "promoter_name": "演示博主",
    "goods_id": 1,
    "status": 1,
    "note": "默认二级渠道示例"
  }
]
```

## 6. 权限模型

### 6.1 管理员
- 可查看和维护所有商品、卡密、订单、配置
- 可查看整体统计

### 6.2 代理
- 仅可查看自己的支付成功流水、渠道数据和推广链接
- 无法访问配置管理和卡密管理
- 后端接口层强制按 `agent_code` 过滤数据

## 7. API 设计

### 7.1 前台接口
- `GET /api/public/site`
- `GET /api/public/goods`
- `GET /api/public/goods/{goods_id}`
- `POST /api/public/goods/{goods_id}/visit`
- `POST /api/public/orders`
- `GET /api/public/orders/{order_no}`
- `POST /api/public/orders/{order_no}/check`
- `POST /api/public/orders/search`

### 7.2 支付接口
- `POST /api/payments/epay/notify`
- `GET /api/payments/epay/return`

### 7.3 管理员接口
- `POST /api/admin/auth/login`
- `GET /api/admin/dashboard`
- `GET /api/admin/goods`
- `POST /api/admin/goods`
- `PUT /api/admin/goods/{goods_id}`
- `GET /api/admin/orders`
- `GET /api/admin/cdks`
- `POST /api/admin/cdks/import`
- `GET /api/admin/configs`
- `PUT /api/admin/configs/{config_key}`
- `GET /api/admin/agents`
- `POST /api/admin/agents`
- `PUT /api/admin/agents/{agent_code}`
- `GET /api/admin/channels`
- `POST /api/admin/channels`
- `PUT /api/admin/channels/{agent_code}/{channel_code}`

### 7.4 代理接口
- `POST /api/agent/auth/login`
- `GET /api/agent/dashboard`
- `GET /api/agent/orders`
- `GET /api/agent/channels`

## 8. 模块划分

### 8.1 `core`
- 配置、日志、缓存、认证安全工具

### 8.2 `db`
- 数据库引擎、会话、基础模型

### 8.3 `models`
- 配置、商品、卡密、订单模型

### 8.4 `services`
- 配置服务
- 认证服务
- ePay 服务
- 订单服务
- 定时任务服务

### 8.5 `api`
- `public`、`payments`、`admin`、`agent`

## 9. 测试策略

### 9.1 单元 / 集成测试
- 使用 SQLite + 内存缓存覆盖核心业务逻辑
- 测试下单、支付成功、自动发卡、来源渠道统计、代理过滤和订单过期

### 9.2 本地环境测试
- 使用本地 MySQL 和 Redis 执行初始化脚本
- 使用 FastAPI `TestClient` 做接口烟雾测试
- 使用前端 `pnpm build` 验证工程可构建

## 10. 交付内容
- 完整后端代码
- 完整前端代码
- Dockerfile 和 docker-compose
- 详细设计文档
- 初始化脚本和测试脚本
- 后台商品编辑、卡密筛选、代理和来源渠道可视化维护能力
- 前台订单查询页和前端手机号/邮箱格式校验
