# 发布回复模板功能到 chat8238.seanmo.com

服务器：`root@159.203.17.116`（DigitalOcean）
Chatwoot 目录：`/mnt/soluber_data/chatwoot`（docker compose，rails 在 127.0.0.1:3600）
代码：`https://github.com/JohnnyZ8238/chatwoot` 的 `feature/reply-templates` 分支（基于 v4.19.0）

整个过程大约 30–40 分钟，其中构建镜像占 15–25 分钟（构建期间网站照常运行）。
真正停机只在第 5 步换容器的时候，约 1 分钟。

> 这台 Chatwoot 是你所有网站共用的，换完后所有站点都用上新功能。
> 现有的预设回复会变成“公司模板”，以后只有管理员能改。

---

## 1. 登录并查看现状

```bash
ssh root@159.203.17.116
cd /mnt/soluber_data/chatwoot
ls
docker compose ps
grep -n "image:" docker-compose*.y*ml
free -h
df -h /mnt/soluber_data /var/lib/docker
```

记下这几件事，后面要用：

- compose 文件名（`docker-compose.yaml` 或 `docker-compose.yml`）
- `image:` 那一行现在写的是什么，例如 `chatwoot/chatwoot:v4.19.0`
- 内存：构建需要约 4 GB。如果 `free -h` 里 total 小于 4G，先做第 3 步的“加临时 swap”
- 磁盘：至少留 6 GB 空间

## 2. 备份数据库（必须做）

```bash
mkdir -p /mnt/soluber_data/backups
B=/mnt/soluber_data/backups/chatwoot-$(date -u +%Y%m%d-%H%M%S)
docker compose exec -T rails sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h "$POSTGRES_HOST" -p "${POSTGRES_PORT:-5432}" -U "$POSTGRES_USERNAME" -Fc "${POSTGRES_DATABASE:-chatwoot_production}"' > $B.dump
ls -lh $B.dump
cp -a docker-compose*.y*ml .env /mnt/soluber_data/backups/
echo "备份文件：$B.dump"
```

`ls -lh` 显示的大小不能是 0，通常是几 MB 到几百 MB。是 0 就停下，不要继续。

## 3. 构建新镜像

内存不到 4 GB 时，先加一个临时 swap（构建完可以删掉）：

```bash
fallocate -l 4G /swapfile-build && chmod 600 /swapfile-build && mkswap /swapfile-build && swapon /swapfile-build
free -h
```

下载代码并构建：

服务器跑的是社区版（`v4.19.0-ce`），所以构建时和官方 CE 镜像一样：去掉 enterprise 代码，并标记 `CW_EDITION=ce`。构建目录放在 50GB 盘上。

```bash
D=/mnt/soluber_data/build/chatwoot-reply-templates
rm -rf $D
git clone --depth 1 -b feature/reply-templates https://github.com/JohnnyZ8238/chatwoot.git $D
cd $D
SHA=$(git rev-parse HEAD)
TAG=chatwoot-custom:v4.19.0-ce-reply-templates-$(git rev-parse --short HEAD)
rm -rf enterprise spec/enterprise
printf '\nENV CW_EDITION="ce"\n' >> docker/Dockerfile
echo $TAG
docker build -f docker/Dockerfile -t $TAG .
docker images | grep chatwoot-custom
```

不要删 `.git` 目录：Dockerfile 里有一步 `git rev-parse HEAD` 要读它。

最后一行能看到新镜像就说明构建成功。把 `echo $TAG` 打印出来的名字记下来，例如 `chatwoot-custom:reply-templates-ab12cd3`。

用完 swap 可以删掉：

```bash
swapoff /swapfile-build && rm -f /swapfile-build
```

## 4. 让 compose 改用新镜像

```bash
cd /mnt/soluber_data/chatwoot
grep -n "image: chat" docker-compose.yml
sed -i "s#image: chatwoot[-/a-z]*:[^ ]*#image: $TAG#" docker-compose.yml
grep -n "image:" docker-compose.yml
```

`TAG` 变量来自第 3 步。如果你换了终端窗口，先重新设一次：`TAG=chatwoot-custom:reply-templates-xxxxxxx`。

确认 rails 和 sidekiq 用的都是新镜像（官方文件里两者共用 `base` 的那一行），postgres 和 redis 不变。

## 5. 运行数据库迁移，然后换容器

```bash
docker compose run --rm rails bundle exec rails db:migrate
docker compose up -d
docker compose ps
```

迁移只会新增 3 张表和 `canned_responses` 上的几列，不会删任何东西。
`docker compose ps` 里 rails 和 sidekiq 应该是 `Up` 状态。

## 6. 检查

```bash
curl -s https://chat8238.seanmo.com/api
docker compose exec -T rails bundle exec rails runner 'p CannedResponse.column_names; p CannedResponseCategory.count'
docker compose logs --tail=50 rails
```

- `/api` 返回 `"queue_services":"ok","data_services":"ok"`
- `rails runner` 打印的列里有 `title`、`user_id`、`variables`、`usage_count`
- 日志里没有一直刷 `Error`

然后在浏览器里：

1. 打开 https://chat8238.seanmo.com 并登录（ivybid 后台里的 Chatwoot 页面也一样）。
2. 进入任意对话，在回复框输入 `/`，看到 Favorites / Recent / Mine / Company / All 标签。
3. 按 Alt+T，或点回复框下面新加的书本图标，打开完整模板库。
4. 设置 → Canned Responses，看到 Company library 和 My library 两个标签。

ivybid 的 Chatwoot 皮肤（nginx 换色）不受影响。如果新界面里有颜色没换成 ivybid 的绿色，在 ivybid 仓库里重新跑一次 `node scripts/chatwoot-colors.cjs` 即可。

---

刚重启的头几秒，`/api` 可能返回 `"data_services":"failing"`，过 5 秒再查一次会变成 `ok`。

## 发布记录

- 2026-10-24：首次发布 `chatwoot-custom:v4.19.0-ce-reply-templates-ed22be2`。发布前的数据库备份在 `/mnt/soluber_data/chatwoot/backups/pre-reply-templates-20261024-205800/`。旧镜像 `chatwoot/chatwoot:v4.19.0-ce` 保留在服务器上，用于回滚。

## 回滚（出问题时）

新加的表和列旧版 Chatwoot 不会用到，所以回滚只需把镜像换回去，不用恢复数据库：

```bash
cd /mnt/soluber_data/chatwoot
cp /mnt/soluber_data/chatwoot/backups/pre-reply-templates-20261024-205800/docker-compose.yml .
docker compose up -d
docker compose ps
```

只有数据真的出错时才恢复备份（会丢失备份之后的所有新消息，慎用）：

```bash
docker compose stop rails sidekiq
docker compose exec -T rails sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" pg_restore --clean --if-exists -h "$POSTGRES_HOST" -U "$POSTGRES_USERNAME" -d "${POSTGRES_DATABASE:-chatwoot_production}"' < 你的备份文件.dump
docker compose up -d
```

注意：`rails` 停掉后不能再用它执行命令。恢复时要么先只停 sidekiq，要么改用 postgres 容器执行 `pg_restore`。真需要恢复时把报错发给我，我们一起处理。

## 以后升级 Chatwoot

这个版本是从 v4.19.0 改出来的。以后要升级到新版 Chatwoot，需要先把新版本合并进这个分支、解决冲突、重新跑测试，再按上面的步骤构建发布。不能直接换回官方的 `chatwoot/chatwoot:latest`，否则新功能会消失。新加的表会留在数据库里，但没有界面用到。
