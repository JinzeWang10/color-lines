# 部署 · color-lines（彩球连珠）

参照 family-archive 的方式（**本地 push GitHub → ECS Workbench `git pull`**），但更简单：
源码本身就是可直接托管的静态站（`index.html` + `css/` + `js/`），**不需要 deploy 分支**——
ECS 直接 clone 仓库、`git pull` 更新即可。

- ECS 22 端口对公网关闭，服务器侧命令都在**阿里云 ECS Workbench**（浏览器）里跑。
- 无隐私数据，**仓库公开**即可，ECS 用 https 直接 clone，**不需要 deploy key**。
- `dist/` 已 gitignore，服务器跑的是多文件源码版（功能完全一致）。

---

## A. 本地一次性（建仓库 + 首推）

```powershell
cd "D:\code repos\color-lines"
gh repo create color-lines --public --source . --remote origin --push
```

## B. ECS 一次性（Workbench 里执行）

```bash
# 1. clone 到站点目录
sudo git clone https://github.com/JinzeWang10/color-lines.git /var/www/color-lines
sudo chown -R www-data:www-data /var/www/color-lines

# 2. 装拉取脚本
sudo cp /var/www/color-lines/scripts/color_lines_pull.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/color_lines_pull.sh

# 3. nginx 站点（server_name 改成你的子域名）
sudo cp /var/www/color-lines/deploy/nginx-color-lines.conf /etc/nginx/sites-available/color-lines.conf
sudo ln -s /etc/nginx/sites-available/color-lines.conf /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## C. DNS（在 knowyourself.com.cn 解析后台）

加一条 A 记录：`lines` → `39.102.120.6`（TTL 600）。等 `ping lines.knowyourself.com.cn` 能解析到该 IP。
阿里云 ECS 安全组放行 **80 / 443**。

## D. HTTPS

DNS 生效、nginx 已在 80 端口服务后：

```bash
sudo certbot --nginx -d lines.knowyourself.com.cn
```

certbot 自动补 443 server 块 + 80→443 跳转。

---

## 日后更新（改了代码后）

```powershell
# 本地：正常提交并推送
cd "D:\code repos\color-lines"
git add -A; git commit -m "..."; git push
```

然后 ECS Workbench：

```bash
sudo /usr/local/bin/color_lines_pull.sh
```

刷新页面即新版（nginx 无需重载）。

---

## 游玩统计（谁玩了多久）

看板地址：**<https://lines.knowyourself.com.cn/stats/>**（无密码，手机可直接收藏）

原理是「日志即数据库」，不需要后端和数据库：页面每玩满一分钟发一个 GET 到 `/px`，
nginx 直接 `return 204` 不落文件，只在专用日志里记一行；cron 每 10 分钟把日志汇总成静态页。

- 时长口径蹭的是防沉迷计时器（`js/limit.js`）：只在游戏页、页面可见、两分钟内有操作时才计秒，
  挂机 / 切标签页 / 看复盘都不算。
- 只发一个随机匿名 ID，日志里不记 IP、不记 UA。发出去的单文件离线版（`file://`）完全不打点。
- nginx 日志 logrotate 只留 14 天，所以脚本每次都把结果并进 `/var/lib/color-lines/daily.tsv`，
  历史不随轮转丢失。

### ECS 一次性安装

```bash
# 1. 日志格式（log_format 只能在 http 上下文，故走 conf.d）
sudo cp /var/www/color-lines/deploy/color-lines-log.conf /etc/nginx/conf.d/

# 2. 站点配置里加 /px 和 /stats 两个 location（照 deploy/nginx-color-lines.conf 改）
sudo nano /etc/nginx/sites-available/color-lines.conf
sudo nginx -t && sudo systemctl reload nginx

# 3. 统计脚本 + 每 10 分钟一次的 cron
sudo cp /var/www/color-lines/scripts/color_lines_stats.sh /usr/local/bin/
sudo chmod +x /usr/local/bin/color_lines_stats.sh
sudo /usr/local/bin/color_lines_stats.sh          # 先手动跑一次，把页面生成出来
echo '*/10 * * * * root /usr/local/bin/color_lines_stats.sh >/dev/null 2>&1' \
  | sudo tee /etc/cron.d/color-lines-stats
```

> `/stats/` 那条 location 必须写 `^~`。不然内部跳转到 `/stats/index.html` 时会被
> `.html` 那条正则 location 抢走（正则优先于普通前缀），拿 root 去找 → 404。

### 不开网页时，命令行看

```bash
column -t /var/lib/color-lines/daily.tsv   # 日期 / 匿名ID / 分钟 / 局数
```

> 若早期装的旧版脚本报 `dubious ownership`，先一次性加白名单：
> `sudo git config --global --add safe.directory /var/www/color-lines`
> 然后把仓库里的新脚本覆盖上去即可（新脚本以 www-data 身份跑 git，不再有此问题）：
> `sudo cp /var/www/color-lines/scripts/color_lines_pull.sh /usr/local/bin/`
