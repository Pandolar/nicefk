# nicefk

`nicefk` 是一个面向数字卡密销售的发卡系统，后端使用 FastAPI，前端使用 React + Ant Design，数据层使用 MySQL + Redis，支持 ePay 支付、自动发货、按商品模板发送邮件、代理与来源渠道统计，以及管理员 / 代理双后台。

## 功能概览
- 商品页展示统一公告、商品封面、价格、库存状态、商品说明
- 支持手机号 / 邮箱下单，前端按商品配置校验联系方式
- 支持支付宝 / 微信支付按钮直跳 ePay 收银台
- 支付成功后自动发货，可一次购买多份卡密
- 支持 ePay 异步回调、主动查单补偿、超时订单过期
- 支持按商品模板发送发货邮件
- 支持一级代理与来源渠道记录、渠道浏览 / 下单 / 支付统计
- 管理员后台统一管理商品、卡密、订单、代理、渠道、配置
- 代理后台仅查看自身数据，并可自助新增和维护自己名下渠道
- 前台订单查询页支持单输入框查询订单号 / 手机号 / 邮箱
- 浏览器会记录近期支付成功订单，用户在查询页和订单状态页可直接查看

## 项目结构
- `docs/design.md`：详细设计文档
- `backend/`：FastAPI 后端代码
- `frontend/`：React + Vite 前端代码
- `Dockerfile`：单镜像构建文件
- `docker-compose.yml`：本地开发编排示例

## 环境要求
- Python `>= 3.9`
- Node.js `>= 18`
- `pnpm`
- `uv`
- MySQL `8.x`
- Redis `7.x`

## 本地开发
1. 复制环境变量模板
```bash
cp .env.example .env
```

2. 按实际环境修改 `.env`
```env
NICEFK_SITE_URL=http://127.0.0.1:8000
NICEFK_DATABASE_URL=mysql+pymysql://nicefk:nicefk@127.0.0.1:3306/nicefk?charset=utf8mb4
NICEFK_REDIS_URL=redis://:aaaaTZ3QaF@127.0.0.1:6379/0
```

3. 安装后端依赖
```bash
uv sync
```

4. 安装前端依赖
```bash
cd frontend
pnpm install
cd ..
```

5. 初始化数据库与默认配置
```bash
uv run python -m backend.app.cli init-db
```

6. 可选：写入演示商品和演示卡密
```bash
uv run python -m backend.app.cli seed-demo
```

7. 启动后端
```bash
uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload
```

8. 启动前端开发服务
```bash
cd frontend
pnpm dev
```

9. 健康检查
```bash
curl http://127.0.0.1:8000/healthz
```

## 生产构建
前端生产构建会输出到 `backend/app/static`，由 FastAPI 直接托管。

```bash
cd frontend
pnpm build
```

如果只想调试而不混淆前台 JS：

```bash
cd frontend
SKIP_OBFUSCATE=1 pnpm build
```

生产启动示例：

```bash
uv run uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

## Docker 用法
构建镜像：

```bash
docker build -t nicefk:latest .
```

使用本地 `.env` 运行：

```bash
docker run -d \
  --name nicefk-app \
  --env-file .env \
  -p 8000:8000 \
  nicefk:latest
```

如果只想快速拉起演示环境，也可以使用：

```bash
docker compose up -d --build
```

当前 `docker compose` 配置里：
- 服务名是 `app`
- 实际容器名是 `nicefk-app`
- 宿主机端口是 `18110`
- 容器内端口是 `8000`

项目根目录已提供一键部署脚本：

```bash
./deploy.sh
```

常用用法：

```bash
./deploy.sh
./deploy.sh --pull
./deploy.sh --logs
```

脚本会自动执行：
- 可选 `git pull --ff-only`
- `docker compose up -d --build --force-recreate app`
- 轮询 `http://127.0.0.1:18110/healthz` 健康检查
- 失败时自动输出最近日志

## 核心配置项

### 基础配置
- `NICEFK_SITE_URL`：站点对外地址
- `NICEFK_DATABASE_URL`：MySQL 连接串
- `NICEFK_REDIS_URL`：Redis 连接串
- `NICEFK_ORDER_EXPIRE_MINUTES`：订单超时分钟数，默认 `5`
- `NICEFK_RECONCILE_INTERVAL_SECONDS`：补偿查单周期，默认 `180`
- `NICEFK_LOG_DIR`：日志目录

### ePay 配置
- `PAY_EPAY_PID`：商户 PID
- `PAY_EPAY_KEY`：商户密钥
- `PAY_EPAY_API_URL`：网关基础地址，例如 `https://ep.niceaigc.com/`
- `PAY_EPAY_SUBMIT_URL`：支付提交地址，通常是 `{网关}/submit.php`
- `PAY_EPAY_QUERY_URL`：订单查询地址，通常是 `{网关}/api.php`
- `PAY_NOTIFY_URL`：异步回调地址
- `PAY_RETURN_URL`：同步跳转地址，默认 `/payment-return`

### 邮件配置
- `EMAIL_ENABLED`：是否启用全局自动发货邮件
- `SMTP_SERVER`
- `SMTP_PORT`
- `SMTP_USER`
- `SMTP_PASSWORD`
- `SMTP_FROM`

### 前台附加脚本
- `SITE_EXTRA_JS`：注入到公共前台页面的额外 JS，适合统计、埋点或第三方脚本

## 默认账号
- 管理员：`admin / Admin@123456`
- 演示代理：`agent_demo / Agent@123456`

首次初始化会把默认账号的哈希信息写入 `config` 表。正式环境请在后台尽快修改。

## 代理与渠道说明
- 一级代理只看自己的订单、支付流水和渠道数据
- 来源渠道用于记录代理名下不同博主、投放位或合作来源
- 渠道不参与平台侧返利计算，仅做来源统计
- 渠道推广链接格式：

```text
/goods/{goods_id}?agent_code={agent_code}&channel_code={channel_code}
```

## 前台使用说明
- 商品页地址：`/goods/{goods_id}`
- 订单状态页：`/order/{order_no}`
- 订单查询页：`/orders/query`
- 查询页支持一个输入框直接查询 `订单号 / 手机号 / 邮箱`
- 支付成功后，浏览器会记录近期订单引用，用户再次进入查询页或订单状态页时可直接查看已成功订单和卡密

## 后台入口
- 管理员登录：`/admin/login`
- 代理登录：`/agent/login`

## 支付与发货流程
1. 用户打开商品页，输入联系方式并点击支付方式按钮
2. 系统创建订单并跳转 ePay 收银台
3. ePay 支付成功后回调 `/api/payments/epay/notify`
4. 系统验签、查单、锁定卡密并自动发货
5. 如启用了邮件，系统按商品模板发送发货邮件
6. 若回调异常，定时任务会按周期补偿查单
7. 超过配置时间仍未支付的订单会自动过期

## 常用接口与检查点
- 健康检查：`GET /healthz`
- ePay 异步回调：`POST /api/payments/epay/notify`
- ePay 同步跳转：`GET /api/payments/epay/return`
- 后台启动后如已构建前端，FastAPI 会直接托管前台静态页面

## 测试
后端测试：

```bash
.venv/bin/pytest -q
```

当前测试覆盖了订单创建、支付回调、补偿发货、多数量购买与多卡密发放等核心流程。
