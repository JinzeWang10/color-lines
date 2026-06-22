#!/usr/bin/env bash
# 服务器侧拉取脚本（放到 ECS 的 /usr/local/bin/color_lines_pull.sh）
# 以仓库属主 www-data 的身份跑 git，避免 root 操作 www-data 仓库时的
# "dubious ownership" 报错，也免去事后 chown。
set -e
DIR=/var/www/color-lines
sudo -u www-data git -C "$DIR" fetch origin master
sudo -u www-data git -C "$DIR" reset --hard origin/master
echo "color-lines 已更新到最新 master"
