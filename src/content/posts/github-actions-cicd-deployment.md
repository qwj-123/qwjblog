---
title: "从手动上传到自动部署：给博客搭了一套 GitHub Actions CI/CD"
published: 2026-09-17
description: "记录一次完整的静态博客 CI/CD 搭建过程：从 GitHub Actions、Runner、Artifact，到 SSH、rsync、最小权限和自动部署。"
tags: [博客]
category: "博客"
draft: false
---

之前博客刚上线的时候，我的部署方式其实很“手工”。

每次本地改完内容以后，大概都要走一遍：

```text
pnpm build
↓
生成 dist
↓
压缩成 ZIP
↓
上传腾讯云
↓
服务器解压
↓
rsync 到 Nginx 网站目录
↓
检查网站
```

能用，而且刚开始学部署的时候，我觉得手动走一遍反而挺有必要。

因为不自己做一次的话，很容易只知道“网站上线了”，却不知道中间到底发生了什么。

至少通过前面的手工部署，我慢慢弄清楚了：

- `dist` 到底是什么；
- Nginx 真正读取的是哪个目录；
- 为什么静态网站更新后不需要重启 Nginx；
- 为什么目录和文件权限不能乱设；
- `rsync --delete` 到底会删除什么；
- 本地构建和服务器部署其实是两件事。

不过博客以后肯定还会继续更新。

如果每次写一篇文章，都还要：

```text
build
→ 压缩
→ 上传
→ 解压
→ rsync
```

那就有点麻烦了。

所以这次我干脆把整个过程自动化，给博客搭了一套 GitHub Actions CI/CD。

# 一、最后实现了什么

现在更新博客以后，我本地基本只需要：

```bash
git add .
git commit -m "更新博客内容"
git push
```

后面的事情交给 GitHub Actions。

整个流程变成：

```text
本地修改
   ↓
git push master
   ↓
GitHub Actions
   ↓
代码检查
   ↓
自动测试
   ↓
构建 Astro
   ↓
生成 dist
   ↓
保存构建产物 Artifact
   ↓
SSH 登录腾讯云
   ↓
rsync --dry-run
   ↓
正式 rsync
   ↓
/var/www/qwjblog.cn
   ↓
Nginx
   ↓
网站更新
```

如果中间任何一道检查失败，比如：

- Biome 检查失败；
- Astro / TypeScript 检查失败；
- 测试失败；
- 构建失败；
- Artifact 校验失败；
- SSH 失败；
- 服务器权限检查失败；
- rsync 预演失败；

那么后面的正式部署就不会继续。

这也是我这次真正理解到的一点：

> CI/CD 并不只是“自动上传文件”，而是先检查、再构建、再部署，把原来手工做的流程固定下来。

# 二、CI/CD 到底是什么

以前经常在招聘要求里看到：

```text
熟悉 CI/CD
```

单看概念的时候其实挺抽象。

自己真正搭一遍以后，理解就清楚多了。

可以先简单拆成两部分。

## CI：Continuous Integration

CI，也就是持续集成。

我现在这套流程里的 CI 大概是：

```text
checkout
↓
准备 Node / pnpm
↓
安装依赖
↓
Biome
↓
pnpm check
↓
pnpm test
↓
pnpm build
```

主要是在回答：

> 这次提交的代码有没有明显问题？  
> 测试能不能通过？  
> 最终能不能正常构建出网站？

只有这些全部通过，后面的部署才会开始。

## CD：Continuous Deployment

CD，也就是持续部署。

我现在的 CD 大概是：

```text
下载构建产物
↓
校验 Artifact
↓
准备 SSH
↓
连接腾讯云
↓
检查部署用户和目录权限
↓
rsync --dry-run
↓
正式 rsync
```

主要是在回答：

> 已经验证好的构建产物，怎么安全地送到生产服务器。

所以在我现在这套流程里，可以粗略理解成：

```text
Build Job  ≈ CI
Deploy Job ≈ CD
```

# 三、Workflow 和 deploy-tencent.yml 是什么关系

GitHub Actions 里有一个很重要的概念：

```text
Workflow
```

Workflow 就是一整套自动化流程。

我这次新增的文件是：

```text
.github/workflows/deploy-tencent.yml
```

它不是一个普通 Bash 脚本，更准确地说，它是：

> 用 YAML 描述 GitHub Actions Workflow 的配置文件。

关系大概是：

```text
GitHub Actions
    ↓
Workflow
    ↓
deploy-tencent.yml
```

这个文件里面定义了：

- 什么时候触发；
- 使用什么 Runner；
- 有哪些 Job；
- Job 之间谁先谁后；
- 每个 Job 有哪些 Step；
- 使用哪些 Secret；
- 使用哪些 Variables；
- 最后执行哪些 shell 命令。

可以把它理解成一份“自动化作业说明书”。

真正干活的并不是 YAML 文件本身，而是 GitHub Actions 分配出来的 Runner。

# 四、Runner 到底是什么

当我执行：

```bash
git push origin master
```

以后，GitHub 收到这次 push。

如果 `deploy-tencent.yml` 的触发条件正好匹配 `master`，GitHub 就会创建一次 Workflow Run。

然后为 Job 分配一台临时 Runner。

这次实际使用的是 Ubuntu Runner。

可以把 Runner 理解成：

> GitHub 临时提供的一台 Ubuntu 机器，用来执行 Workflow 里的命令。

所以现在其实有三个完全不同的环境：

```text
我的 Windows
    ↓
写代码、commit、push

GitHub Runner
    ↓
安装依赖、检查、测试、build、部署

腾讯云 Ubuntu
    ↓
保存静态网站文件 + Nginx
```

以前我很容易把“GitHub Actions 在服务器上运行”理解成一回事。

实际上不是。

`deploy-tencent.yml` 主要是在 GitHub 侧被解析，然后 Runner 按照里面的定义执行命令。

只有到了 SSH 和 rsync 阶段，Runner 才去连接腾讯云。

# 五、为什么服务器不直接 git pull + build

一开始我也想过这种方案：

```text
git push
↓
服务器 git pull
↓
pnpm install
↓
pnpm build
↓
Nginx
```

这样当然也能做。

但最后还是选择了：

```text
GitHub Runner build
↓
只把 dist 部署到服务器
```

这样生产服务器就不需要安装：

- Node.js；
- pnpm；
- Astro；
- node_modules；
- 项目源代码；
- 一整套前端构建环境。

生产服务器只负责：

```text
接收静态文件
+
Nginx 对外提供网站
```

这让我开始理解一个很重要的运维思路：

> 生产环境能少装东西就少装，能少承担职责就少承担职责。

# 六、Build Job 做了什么

## 1. Checkout

Runner 刚创建出来的时候，并没有我的博客源码。

所以首先需要：

```text
actions/checkout
```

把这次 commit 对应的代码取到 Runner。

可以粗略理解为：

```text
GitHub 仓库
↓
当前 commit
↓
Runner
```

也就是说，Runner 并不是直接从我的 Windows 拿代码。

真正的数据路径是：

```text
Windows
↓ git push
GitHub
↓ checkout
Runner
```

## 2. 准备 Node 和 pnpm

Astro 项目需要 Node.js 才能构建。

为了尽量和本地已经验证过的环境保持一致，这次 Workflow 使用：

```text
Node 24.15.0
pnpm 11.5.3
```

然后执行：

```bash
pnpm install --frozen-lockfile
```

这里的 `--frozen-lockfile` 很重要。

项目里有：

```text
package.json
pnpm-lock.yaml
```

可以简单理解成：

```text
package.json
→ 我需要哪些依赖

pnpm-lock.yaml
→ 实际应该安装哪些确定版本
```

CI 使用 frozen lockfile，就是尽量保证：

> 不要在 CI 环境里自己重新算一套依赖版本，严格按已经提交的锁文件来。

这样本地、CI、其他开发环境之间会更一致。

# 七、为什么 CI 里还要设置 ENABLE_CONTENT_SYNC=false

我的项目本身带有内容同步能力。

本地 `.env` 里面有：

```text
ENABLE_CONTENT_SYNC=false
```

但是 `.env` 被 Git 忽略了。

也就是说：

```text
本地有 .env
↓
git push
↓
GitHub 仓库里没有
↓
Runner checkout 后也没有
```

所以 Workflow 里需要明确设置：

```text
ENABLE_CONTENT_SYNC=false
```

这样 CI 环境才知道：

> 使用仓库中的本地内容，不要尝试外部内容同步。

这里让我意识到一个挺重要的问题：

> 自动化环境不能依赖“我电脑上刚好有某个配置”。

需要的配置，要明确地提供给 CI。

# 八、部署之前为什么要过几道门

现在 Build 并不是直接执行：

```bash
pnpm build
```

而是先经过几道检查。

## Biome

Biome 主要负责：

- Formatter；
- Linter；
- import 排序；
- 一些代码质量规则。

之前我对 Mizuki 做了不少个性化修改，一度出现：

```text
18 个 Biome Error
```

后来才搞清楚：

这些 Error 大部分并不是“代码不能运行”，而是：

> 代码格式和 import 顺序不符合这个仓库自己配置的规范。

修好以后，CI 就可以每次自动检查。

## pnpm check

这个项目里的：

```bash
pnpm check
```

主要会执行 Astro / TypeScript 相关检查。

例如：

- Astro 组件诊断；
- TypeScript 类型；
- 一些变量和模板问题。

## pnpm test

这里会执行项目自己的测试。

这次搭 CI/CD 的过程中，还顺便遇到了一个很典型的问题：

> 网站其实符合我现在的需求，但旧测试还在验证 Mizuki 模板以前的内容。

例如我已经改过：

- 音乐；
- About 页面；
- 示例文章；

但原来的测试仍然要求：

```text
必须有旧歌曲
必须有旧 GitHub Card
必须存在 guide 示例文章
```

于是：

```text
新需求没问题
+
旧测试还是旧标准
=
CI 测试失败
```

后来把这些测试调整成更偏“行为”的检查。

比如音乐测试不再写死：

```text
必须有某四首歌曲
```

而是检查：

```text
播放列表不是空的
音频文件存在
标题/作者有效
时长有效
默认封面有效
加载策略正常
```

这样以后如果只是换歌，不至于把 CI 搞挂。

这也让我理解了：

> 测试用例并不是“永远正确的标准”，它代表的是编写测试时的预期。需求变了，测试也要跟着维护。

# 九、真正构建 Astro

前面的检查全部通过以后，才执行：

```bash
pnpm build
```

最终生成：

```text
dist/
```

这里很重要：

```text
src/
→ 源代码

dist/
→ 构建完成、可以部署的网站
```

Nginx 最终真正需要的是：

```text
dist
```

而不是整个 Astro 项目。

# 十、为什么还要 Artifact

这里一开始我也不太理解。

既然 Build 已经生成：

```text
dist/
```

为什么 Deploy 不直接用？

后来才知道：

> Build Job 和 Deploy Job 很可能不是同一台 Runner。

可以理解成：

```text
Build Job
↓
Runner A
↓
pnpm build
↓
dist
↓
Job完成
↓
Runner A销毁
```

Deploy 又可能是：

```text
Deploy Job
↓
Runner B
```

所以 Runner A 上的 `dist/` 不会自动出现在 Runner B。

这时候就需要：

```text
Artifact
```

作为中间桥梁。

整个过程：

```text
Runner A
↓
生成 dist
↓
打包并上传 Artifact
↓
Runner A 销毁

Runner B 创建
↓
下载 Artifact
↓
解压得到 dist
↓
开始部署
```

这样 Build 和 Deploy 就可以真正分开。

# 十一、Artifact 还做了完整性校验

Deploy Job 下载 Artifact 以后，并不是马上部署。

还会校验 SHA-256。

这次日志中能看到：

```text
site.tar.gz: OK
```

目的就是确认：

> Deploy 拿到的构建产物是完整的，没有损坏或者发生不一致。

这属于完整性校验。

# 十二、为什么不用我的 ubuntu 管理员账号部署

服务器上原本主要用：

```text
ubuntu
```

做管理。

这个用户有 sudo 权限。

但 GitHub Actions 只是要做一件事：

```text
更新网站文件
```

没必要给它管理员权限。

所以这次专门建立了：

```text
gha-qwjblog
```

作为 CI/CD 部署用户。

这个用户：

```text
没有 sudo
不能密码登录
不能随便管理系统
```

它主要只需要具备：

```text
修改 /var/www/qwjblog.cn
```

的能力。

这就是这次反复提到的：

> 最小权限原则。

自动化需要什么，就给什么。

不要为了省事，直接把整个服务器管理员权限交出去。

# 十三、CI 使用独立 SSH Key

GitHub Actions 没有直接使用我平时登录服务器的个人 SSH Key。

而是专门生成了一套：

```text
id_ed25519_qwjblog_deploy
```

对应关系：

```text
GitHub Actions
↓
保存部署私钥
DEPLOY_SSH_KEY

腾讯云
↓
/home/gha-qwjblog/.ssh/authorized_keys
↓
保存对应公钥
```

于是 Runner 通过 SSH 连接时：

```text
Runner持有私钥
↓
服务器持有公钥
↓
服务器验证签名
↓
允许 gha-qwjblog 登录
```

这样以后即使 CI 密钥出问题，也可以单独撤销这套部署 Key，不影响我自己的个人 SSH Key。

# 十四、还有另一套 Host Key

SSH 这里还有一个之前很容易混淆的东西：

```text
服务器 Host Key
```

部署 SSH Key 是：

> 服务器确认客户端是谁。

Host Key 是：

> 客户端确认服务器是谁。

所以 GitHub Actions 还保存：

```text
DEPLOY_KNOWN_HOSTS
```

SSH 使用：

```text
StrictHostKeyChecking=yes
```

连接时：

```text
Runner
↓
连接服务器
↓
服务器拿出 Host Key
↓
和预先保存的 known_hosts 对比
↓
一致
↓
继续
```

所以现在 SSH 是两个方向的身份确认：

```text
部署 Key
→ 服务器验证客户端

Host Key
→ 客户端验证服务器
```

# 十五、服务器目录权限怎么解决

生产网站目录：

```text
/var/www/qwjblog.cn
```

以前主要由：

```text
ubuntu
```

管理。

现在：

```text
gha-qwjblog
```

也需要写。

但又不能给它 sudo。

所以建立了共享组：

```text
qwjblog-web
```

把：

```text
ubuntu
gha-qwjblog
```

加入这个组。

网站目录使用：

```text
group = qwjblog-web
```

目录权限大致：

```text
2775
```

文件：

```text
664
```

其中目录前面的：

```text
2
```

代表 setgid。

作用可以理解成：

> 在这个目录下面创建的新文件和目录，尽量继续继承父目录的 group。

也就是继续保持：

```text
qwjblog-web
```

这样不会部署几次以后，目录里的 group 越来越乱。

# 十六、Nginx 的 www-data 为什么不加入部署组

Nginx worker 通常使用：

```text
www-data
```

运行。

但它只需要：

```text
读取文件
进入目录
```

不需要修改网站。

所以通过：

```text
目录 other = r-x
文件 other = r--
```

就够了。

于是职责很清楚：

```text
ubuntu
gha-qwjblog
→ 修改网站

www-data
→ 读取网站
```

# 十七、真正部署前先做服务器预检

GitHub Actions SSH 登录服务器以后，不会直接开始 rsync。

还会检查：

```text
whoami
id
rsync 是否存在
部署目录是否存在
目录是否可写
目录是否可进入
setgid 是否正确
group 是否正常
```

第一次 Dry Run 的日志里，我看到：

```text
Remote deployment identity: gha-qwjblog
```

以及：

```text
groups=...,qwjblog-web
```

证明 Runner 确实是用预期的部署用户登录，而且部署组也正常。

# 十八、真正部署用的是 rsync

核心数据方向其实很简单：

```text
GitHub Runner 上的 dist/
        ↓
       SSH
        ↓
/var/www/qwjblog.cn/
```

使用：

```text
rsync
```

而不是继续：

```text
压缩 ZIP
↓
上传
↓
unzip
```

rsync 会比较源端和目标端，处理需要变化的内容。

# 十九、为什么没有直接 rsync -a

以前手工同步的时候经常使用：

```bash
rsync -av
```

但 CI Runner 上文件的：

```text
owner
group
permissions
```

属于临时 CI 环境。

这些属性不应该原样搬到生产服务器。

所以这次部署里使用：

```text
--no-perms
--no-owner
--no-group
```

避免 Runner 的权限属性污染生产目录。

再配合：

```text
--chmod
umask 0002
setgid
qwjblog-web
```

让服务器继续按照自己的权限模型管理文件。

# 二十、--delete-delay 到底做什么

生产目录需要尽量和最新：

```text
dist/
```

保持一致。

否则每次 Astro build 都可能产生新的 hash 文件，而服务器上的旧 JS、CSS、Pagefind 索引会一直堆着。

所以 rsync 使用：

```text
--delete-delay
```

它依然会删除：

> 目标服务器存在，但最新 dist 已经不存在的内容。

只是把删除动作延后。

第一次 Dry Run 时就发现服务器还留着：

```text
assets/anime/
```

我一开始甚至不记得这是什么。

后来查 Git 历史发现：

这是 Mizuki 上游原本的 Anime / 番剧页面资源。

我在之前做个性化修改时已经把整个 Anime 功能删掉了。

当前：

```text
源码引用：0
GitHub构建：不存在
服务器：只剩空目录
```

所以正好可以让 rsync 自动清理。

这也让我真正理解了：

> `--delete` 并不一定是坏东西，关键是你必须明确“这个目录到底归谁管理”。

# 二十一、为什么 .well-known 要排除

网站目录里并不是所有东西都一定属于 Astro。

例如：

```text
.well-known/
```

可能用于：

```text
ACME
HTTPS 证书验证
```

它属于服务器自身管理的内容。

但它不会存在于：

```text
dist/
```

如果直接使用 delete，同步工具可能认为：

```text
源端没有
↓
目标端多余
↓
删除
```

所以专门配置：

```text
--exclude=/.well-known/
```

也就是告诉 rsync：

> 这个目录不归博客部署流程管理，不要碰。

这个思路以后做动态网站会更重要。

比如：

```text
用户上传文件
数据库
日志
配置文件
Secrets
```

都不能和发布产物混在一起随便覆盖。

# 二十二、为什么第一次只做 Dry Run

第一次测试自动化时，我没有直接让 GitHub Actions 修改生产网站。

先把 Workflow 改成：

```text
Build
↓
Artifact
↓
SSH
↓
身份检查
↓
权限检查
↓
rsync --dry-run
↓
结束
```

也就是说：

```text
能连接服务器
能验证 Host Key
能登录 gha-qwjblog
权限正常
rsync 参数正常
删除列表正常
```

全部确认以后，才打开真正的 rsync。

现在正式版仍然保留：

```text
rsync --dry-run
↓
正式 rsync
```

不过它现在不是人工审批。

也就是说：

```text
dry-run 成功
↓
自动继续正式同步
```

不会停下来问我：

```text
是否继续？ y/n
```

但 dry-run 的日志仍然很有价值。

以后出问题的时候，可以看到：

```text
准备新增什么
准备修改什么
准备删除什么
```

方便复盘。

# 二十三、为什么静态网站部署后不用重启 Nginx

这一点以前也经常搞混。

Nginx 一直运行。

请求：

```text
/index.html
```

的时候，它会去：

```text
/var/www/qwjblog.cn/index.html
```

读取当前文件。

当 rsync 把旧文件换成新文件以后：

```text
下一次请求
↓
Nginx直接读取新文件
```

所以静态网站部署根本不需要：

```bash
sudo systemctl restart nginx
```

也不需要：

```bash
sudo systemctl reload nginx
```

只有修改：

```text
nginx.conf
server {}
listen
SSL
反向代理
```

这种 Nginx 配置时，才需要：

```bash
nginx -t
systemctl reload nginx
```

所以当前：

```text
gha-qwjblog
```

也完全没必要拥有 `systemctl` 的 sudo 权限。

能不给，就不给。

# 二十四、Runner 什么时候产生，什么时候销毁

这一点也是搭完以后才真正理解。

执行：

```bash
git push
```

后：

```text
GitHub收到push
↓
Workflow被触发
↓
某个Job准备执行
↓
GitHub分配Runner
↓
Runner执行Job
↓
Job结束
↓
Runner清理并销毁
```

而且 Build 和 Deploy 不一定是同一台 Runner。

可以理解成：

```text
Runner A
↓
Build
↓
上传 Artifact
↓
销毁

Runner B
↓
下载 Artifact
↓
SSH + rsync
↓
销毁
```

所以：

```text
源码
node_modules
dist
临时SSH Key
known_hosts
```

这些都只是 Runner 里的临时内容。

真正需要长期保留的东西，要存到专门的位置：

```text
源码
→ GitHub仓库

构建产物
→ Artifact

生产网站
→ 腾讯云

Secret
→ GitHub Actions Secrets

日志
→ GitHub Actions
```

# 二十五、如果不用 CI/CD，全手工其实要做什么

把 GitHub Actions 去掉以后，这套流程其实等价于我自己手动做：

```text
1. 获取最新源码
2. 准备 Node / pnpm
3. 安装依赖
4. 设置 ENABLE_CONTENT_SYNC=false
5. Biome 检查
6. pnpm check
7. pnpm test
8. pnpm build
9. 检查 dist
10. 保存构建产物
11. 准备 SSH 私钥
12. 验证服务器 Host Key
13. SSH 登录
14. 检查部署身份
15. 检查目录权限
16. rsync --dry-run
17. 检查删除列表
18. 正式 rsync
19. 检查网站
```

GitHub Actions 并没有凭空创造出一套神奇的部署方法。

它只是把原来人工要做的事情：

```text
固定顺序
+
自动执行
+
留下日志
```

而已。

这也算是我这次最大的收获之一：

> 自动化不是跳过基础，而是把已经理解的人工流程固化下来。

# 二十六、以后 Actions 失败应该怎么排查

以后不能再看到：

```text
Actions 红了
```

就只知道“自动化坏了”。

应该先定位在哪一层：

```text
Workflow没启动
↓
触发条件 / branch / YAML

pnpm install失败
↓
Node / pnpm / lockfile / 网络

Biome失败
↓
格式 / lint / import

pnpm check失败
↓
Astro / TypeScript

pnpm test失败
↓
代码回归 / 测试预期过时

pnpm build失败
↓
Astro构建 / 静态资源 / 配置

Artifact失败
↓
打包 / 下载 / SHA256

SSH失败
↓
SSH Key / Host Key / 用户 / 端口 / 防火墙

权限预检失败
↓
owner / group / chmod / setgid

rsync失败
↓
权限 / 路径 / 网络 / 磁盘

Actions全绿但网站异常
↓
Nginx / HTTP / HTTPS / 静态资源 / 浏览器缓存
```

这种分层排查方式，其实比死记某一条命令重要得多。

# 二十七、现在这套还不是最终形态

目前部署还是：

```text
dist
↓
直接 rsync
↓
生产目录
```

还没有：

```text
原子发布
自动回滚
release 版本目录
current 软链接
部署审批
部署后健康检查
自动通知
```

以后可以继续演进成：

```text
releases/
├── version-A
├── version-B
└── version-C

current
→ version-C
```

部署新版本：

```text
上传完整新版本
↓
验证
↓
切换 current
↓
失败则切回旧版本
```

不过对现在这个静态博客来说，这套已经够用了。

我现在更想先把：

```text
Git
Linux权限
SSH
rsync
GitHub Actions
CI/CD
```

这些基础关系真正搞明白，而不是一上来就堆很多高级方案。

# 二十八、以后动态网站以后会怎么变化

现在是：

```text
Astro
↓
dist
↓
Nginx
```

以后如果做动态网站：

```text
Nginx
↓
Flask / Node / Java
↓
MySQL
```

CI/CD 可能就会多出：

```text
后端构建
数据库迁移
环境变量
systemd
服务重启
健康检查
```

以后再学 Docker，流程可能继续变成：

```text
git push
↓
GitHub Actions
↓
Build Docker Image
↓
Push Registry
↓
服务器 docker compose pull
↓
docker compose up -d
```

虽然工具一直在变，但主线其实还是：

```text
代码
↓
检查
↓
测试
↓
构建
↓
产物
↓
部署
↓
验证
```

现在我的产物是：

```text
dist/
```

以后也许就是：

```text
Docker Image
```

# 写在最后

结果一路折腾下来，已经碰到了：

- Linux 用户和权限；
- Nginx；
- HTTPS；
- Git；
- GitHub；
- SSH；
- 公钥认证；
- Host Key；
- rsync；
- setgid；
- GitHub Actions；
- Runner；
- Artifact；
- CI/CD；
- 自动测试；
- 最小权限；
- 自动化部署。

以前更新网站是：

```text
我自己 build
↓
我自己压缩
↓
我自己上传
↓
我自己解压
↓
我自己同步
```

现在变成：

```text
git push
↓
剩下交给流水线
```

当然，如果现在让我把 `deploy-tencent.yml` 全删了，重新手写一份，我估计够呛。

但至少现在已经不再只是：

> “复制一份 GitHub Actions YAML，然后它莫名其妙就能跑。”

而是大概知道每一步为什么存在、在哪台机器执行、出了问题应该往哪一层查。

而且，这篇文章也是 CI/CD 的测试的一环。

如果现在能在网站上看到它，那就说明：

```text
这篇 Markdown
↓
git commit
↓
git push
↓
GitHub Actions
↓
CI
↓
Build
↓
Artifact
↓
SSH
↓
rsync
↓
腾讯云
↓
Nginx
↓
你现在看到的页面
```

整条链路，又成功跑了一遍。
