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
