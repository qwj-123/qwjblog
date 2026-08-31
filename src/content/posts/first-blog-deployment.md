---
title: "第一次把博客部署到服务器"
published: 2026-08-25
description: "记录一下从本地 Astro 博客，到腾讯云 Nginx 真正上线的过程。"
category: "博客"
tags: [博客]
draft: false
---

# 第一次把博客部署到服务器

博客前前后后改了挺久，终于把它真正放到服务器上了。

之前虽然已经配置好了域名、Nginx 和 HTTPS，但服务器上一直放的只是一个很简单的测试页面。

这次才算是真的把本地做好的 Astro / Mizuki 博客部署上去。

顺便记录一下整个过程，不然感觉过一阵子自己又会忘。

---

## 本地其实一直都可以继续改

我的项目在：

```text
E:\static_blog\qwjblog-mizuki
```

平时修改博客时运行：

```cmd
pnpm dev
```

然后打开：

```text
http://localhost:4322
```

就可以在本地看效果。

现在博客虽然已经上线了：

```text
https://qwjblog.cn
```

但 `localhost:4322` 还是照样可以使用。

也就是说我现在其实有两个环境：

```text
localhost:4322
= 我自己正在修改的版本

qwjblog.cn
= 已经正式上线的版本
```

本地怎么折腾，都不会直接影响线上网站。

等我确认改好了，再重新部署就行。

---

## dev 和 build 到底有什么区别

之前一直在用：

```cmd
pnpm dev
```

一开始我还以为网站能打开就差不多了。

后来才发现，`dev` 只是开发模式。

它更像：

```text
写东西
↓
马上看效果
↓
继续修改
```

而真正准备上线的时候，还需要：

```cmd
pnpm build
```

`build` 会把项目真正生成成静态网站。

生成出来的东西在：

```text
dist/
```

里面。

例如：

```text
dist/
├── index.html
├── 404.html
├── about/
├── archive/
├── assets/
├── _astro/
├── pagefind/
├── pio/
└── ...
```

所以现在我的理解就是：

```text
pnpm dev
= 修改时看效果

pnpm build
= 生成最终准备上线的网站
```

而且之前我确实遇到过：

```text
pnpm dev 能运行
```

但是：

```text
pnpm build 报错
```

所以以后上线之前还是得跑一次 build。

---

> ⭐ **这里也是我问得比较多的地方：既然上线用 dist，为什么 GitHub 又不上传 dist？**

## dist、Git 和 GitHub 一开始把我绕晕了

后来弄明白，其实是两条不同的线。

### 网站上线这条线

```text
源码
↓
pnpm build
↓
dist
↓
服务器
↓
Nginx
↓
qwjblog.cn
```

真正给 Nginx 用的是：

```text
dist
```

而不是整个 Astro 项目。

---

### Git 这条线

另一边是：

```text
修改源码
↓
git add
↓
git commit
↓
git push
↓
GitHub
```

GitHub 保存的主要还是源码。

例如：

```text
src/
public/
package.json
astro.config.mjs
pnpm-lock.yaml
...
```

而 `dist` 本身可以：

```cmd
pnpm build
```

重新生成，所以一般不会放进 Git。

现在终于能把这两件事分开了：

```text
GitHub
= 存源码、存版本

dist
= 网站成品

Nginx
= 使用 dist
```

---

## 顺便把 Git 基础的相关操作理顺了一点

一开始我总觉得：

```text
git commit
```

不就是保存版本吗？

为什么前面还非要：

```text
git add
```

后来理解成：

```text
修改文件
git add       // 将修改放进暂存区，准备下一次版本
git commit    // 真正生成一个版本，也就是快照
git push      // 把本地版本上传到 GitHub
```

我目前已经有了自己的几个 commit。

以后改博客也可以继续：

```cmd
git add -A
git commit -m "修改博客首页"
git push
```

GitHub 就会在原来的仓库里继续增加新的版本。

---

## 正式准备上线

本地确认没问题以后：

```cmd
pnpm build
```

得到新的：

```text
dist/
```

然后开始往腾讯云服务器上传。

我的 Nginx 网站目录是：

```text
/var/www/qwjblog.cn
```

一开始里面其实只有一个之前测试用的：

```text
index.html
```

所以正式部署前先备份了一下：

```bash
sudo cp -a /var/www/qwjblog.cn /var/www/qwjblog.cn.backup
```

做好备份习惯是一个运维的基本。

---

## 我第一次用的是 OrcaTerm 免登录上传

因为目前服务器主要还是通过腾讯云 OrcaTerm 免登录进去。

没有专门配置本地 SSH，所以第一次就用了最直接的方法：

```text
dist
↓
压缩
↓
OrcaTerm 上传
↓
服务器解压
↓
rsync
↓
Nginx
```

---

## 先把 dist 压成 ZIP

因为 `dist` 里面文件很多。

如果一个一个通过网页上传，感觉会比较麻烦。

我当时用的是 CMD，而 `Compress-Archive` 是 PowerShell 命令，所以最后这样执行：

```cmd
powershell -Command "Compress-Archive -Path '.\dist\*' -DestinationPath '.\qwjblog-dist.zip' -Force"
```

也可以手动压缩。

---

## 用 OrcaTerm 上传

在 OrcaTerm 的文件管理器里进入：

```text
/home/ubuntu
```

然后直接点：

```text
上传文件
```

把：

```text
qwjblog-dist.zip
```

上传进去。

服务器里可以检查：

```bash
ls -lh ~/qwjblog-dist.zip
```

---

## 为什么不直接解压到网站目录

我最后没有直接把 ZIP 解压到：

```text
/var/www/qwjblog.cn
```

而是先弄了个临时目录：

```bash
mkdir -p ~/qwjblog-upload
```

然后：

```bash
unzip ~/qwjblog-dist.zip -d ~/qwjblog-upload
```

再检查：

```bash
ls -lah ~/qwjblog-upload
```

确认里面直接能看到：

```text
index.html
404.html
assets/
_astro/
about/
archive/
...
```

这样至少能先确认：

> 上传的确实是完整的网站成品。

---

> 以下的操作主要关系到更新网站内容

## 第二次更新时，旧文件怎么办

一开始我有些疑惑。

比如：

```text
~/qwjblog-upload
```

里面已经是上一次解压出来的网站。

下一次如果直接把新 ZIP 再解压进去，虽然同名文件可以覆盖，但有个问题：

新版已经删除的文件，旧目录里可能还会继续留下来。

所以比较干净的方法是：

```bash
rm -rf ~/qwjblog-upload
mkdir ~/qwjblog-upload
```

然后再重新：

```bash
unzip ~/qwjblog-dist.zip -d ~/qwjblog-upload
```

这样这个临时目录里就只有最新版。

---

## 最后用 rsync 真正部署

确认临时目录没问题以后：

```bash
sudo rsync -av --delete ~/qwjblog-upload/ /var/www/qwjblog.cn/
```

这也是这次部署里我觉得比较重要的一条命令。

简单理解：

```text
~/qwjblog-upload/
= 新版本

/var/www/qwjblog.cn/
= 正在正式运行的网站
```

`rsync` 就负责把新版同步过去。

---

> ⭐ **rsync 的 `--delete` 我也专门问过。**

比如旧网站里：

```text
index.html
assets/
about/
old-page/
```

新版里面：

```text
index.html
assets/
about/
new-page/
```

执行：

```bash
rsync -av --delete
```

以后：

```text
index.html → 更新
new-page → 加进去
old-page → 删除
```

所以最后：

```text
/var/www/qwjblog.cn
```

基本就会和我最新的 `dist` 保持一致。

---

## 部署后检查

文件同步好以后：

```bash
ls -lah /var/www/qwjblog.cn
```

已经能看到完整的网站：

```text
404.html
about/
archive/
assets/
_astro/
images/
index.html
pagefind/
pio/
...
```

然后检查 Nginx：

```bash
sudo nginx -t
```

结果：

```text
syntax is ok
test is successful
```

再检查 HTTP：

```bash
curl -I -H "Host: qwjblog.cn" http://127.0.0.1
```

返回：

```text
301 Moved Permanently
Location: https://qwjblog.cn/
```

说明 HTTP 会自动跳 HTTPS。

再执行：

```bash
curl -I https://qwjblog.cn
```

返回：

```text
HTTP/1.1 200 OK
```

最后浏览器打开：

```text
https://qwjblog.cn
```

终于真的上线了。

---

## 以后古法修改网站也了解得差不多了

目前如果继续用 OrcaTerm，流程大概就是：

```text
本地修改
↓
pnpm dev
↓
localhost:4322 看效果
↓
pnpm build
↓
生成新 dist
↓
Git commit / push
↓
压缩 dist
↓
OrcaTerm 上传 ZIP
↓
清空旧临时目录
↓
解压
↓
rsync 到 /var/www/qwjblog.cn
↓
网站更新
```

现在看起来步骤还有点多，不过至少整个流程已经弄懂了。

---

## 最后

第一次真正把网站部署成功以后，感觉很多之前单独学过的东西终于连起来了：

```text
Astro
↓
pnpm
↓
Git
↓
GitHub
↓
Linux
↓
文件上传
↓
rsync
↓
Nginx
↓
HTTPS
```

以前这些东西单独看都知道一点，但真把一个网站从自己电脑扔到公网以后，感觉才开始知道它们分别是在干什么。

现在用的还是比较手动的：

```text
OrcaTerm + ZIP + unzip + rsync
```

后面准备继续换成：

```text
SSH
↓
SCP / SFTP
↓
rsync over SSH
↓
GitHub Actions
```
