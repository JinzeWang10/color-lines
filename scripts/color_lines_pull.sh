#!/usr/bin/env bash
# 服务器侧拉取脚本（放到 ECS 的 /usr/local/bin/color_lines_pull.sh）
# 参照 family_archive_pull.sh：git fetch + reset --hard + chown
set -e
DIR=/var/www/color-lines
cd "$DIR"
git fetch origin master
git reset --hard origin/master
chown -R www-data:www-data "$DIR"
echo "color-lines 已更新到最新 master"
