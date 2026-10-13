---
title: Minecraft 服务器运维实践
published: 2026-10-13
description: 在腾讯云 Ubuntu 上搭建 Minecraft Fabric 服务器，完成权限隔离、旧世界迁移、RCON 管理、systemd 托管和开机自启。
tags: [minecraft, 系统运维]
category: "minecraft"
draft: false
---

## 前言

以前和朋友联机玩《我的世界》，往往由其中一个人创建房间。房主一退出，其他人就无法继续游玩。我恰好有一台已经运行 Nginx 静态博客的腾讯云服务器，于是想到：**能不能把游戏世界放到云服务器上，让它成为一个独立运行的服务？**

最初的目标只是两个人能随时联机。真正动手后，我决定把它当作一个 Linux 运维项目：从服务用户与权限、网络端口、JVM 资源分配，到游戏存档迁移、变更前备份、日志排障，再到最后使用 systemd 管理整个服务生命周期。

本文以**服务器搭建与 systemd 托管**为主线，记录截至目前已经完成并验证的工作；自动备份、定时巡检和告警等内容还未落地。停服过程中的一次异常会留到单独的故障复盘文章讲述。

> 本文中的公网 IP、玩家标识和 RCON 密码均不公开；示例命令中的路径应按实际环境调整。

## 一、环境与最终架构

| 项目 | 使用环境 |
| --- | --- |
| 云主机 | 腾讯云，2 vCPU / 2 GiB 内存 / 40 GB 系统盘 |
| 操作系统 | Ubuntu 24.04 LTS |
| 已有业务 | Nginx 静态博客，TCP 80/443 |
| 游戏服务 | Minecraft Java 26.2，TCP 25565 |
| Java | OpenJDK 25 |
| Mod 加载器 | Fabric Loader 0.19.3 |
| 基础 Mod | Fabric API、Jade、AppleSkin |
| JVM 参数 | `-Xms512M -Xmx1G` |
| 正式存档 | `/opt/minecraft/server/friend-world/` |
| 服务管理 | systemd + RCON + Shell 停服脚本 |

这里记录的是部署当时使用的版本，不代表最新版本。以后重新安装时，我会再核对 Minecraft、Java、Fabric Loader 和各个 Mod 的兼容性。

整体结构大致如下：

```text
Internet
  |
  +-- TCP 80/443 --> Nginx --> 静态博客
  |
  +-- TCP 25565 --> Minecraft Fabric Server
                         |
                         +-- Java 25
                         +-- mods/
                         +-- friend-world/
                         +-- RCON TCP 25575
                                ^
                                | 仅本机管理
                       mcrcon / stop.sh
                                ^
                                |
                            systemd

启动顺序：minecraft-rcon-firewall.service
             --> minecraft.service
```

游戏端口和 RCON 管理端口必须区分：**25565 给玩家连接；25575 只用于服务器本机管理，不能向公网开放。**

## 二、独立服务账号与目录权限

最开始没有直接使用 `root` 或登录账号运行游戏，而是建立独立的系统用户：

```bash
sudo adduser --system --group \
  --home /opt/minecraft \
  --shell /usr/sbin/nologin minecraft

id minecraft
getent passwd minecraft
```

这里有两个设计目的：

- **最小权限**：Minecraft 不需要 root 权限，也不需要一个可以正常 SSH 登录的账号。
- **业务隔离**：游戏运行数据集中在 `/opt/minecraft`，不与 Nginx 的网站目录混在一起。

初期约定的目录结构为：

```text
/opt/minecraft/
├── server/       # Minecraft 程序、配置、Mod 和存档
└── scripts/      # 运维脚本
```

实践中遇到过一个很好的权限问题：普通 `ubuntu` 用户无法 `cd /opt/minecraft`，甚至无法直接查看其中一个权限为 `755` 的脚本。原因不是脚本没有读取权限，而是上级目录 `/opt/minecraft` 的 `750` 权限不允许普通用户穿过。

排查命令：

```bash
namei -l /opt/minecraft/scripts/stop.sh
```

这让我重新理解了目录的 `r` 和 `x`：`r` 控制读取目录项名称，`x` 控制能否穿过目录并访问已知路径。**检查文件权限时，不能只盯着文件本身。**

## 三、部署原版服务端并规划内存

先安装 Java 环境：

```bash
sudo apt update
sudo apt install -y openjdk-25-jre-headless
java -version
```

从适配 Minecraft 26.2 的官方渠道取得原版服务端 `server.jar` 后，最早通过以下方式手动运行：

```bash
sudo -u minecraft sh -c \
'cd /opt/minecraft/server && exec java -Xms512M -Xmx1G -jar server.jar nogui'
```

这里：

- `-Xms512M` 是 JVM 初始 Heap 大小。
- `-Xmx1G` 是 JVM 最大 Heap 大小，**不是整个 Java 进程的内存上限**。
- `nogui` 表示不启动图形界面。
- `exec` 让 Shell 被 Java 进程替换，减少额外的中间 Shell 进程。

首次启动会生成 `eula.txt`、`server.properties`、世界和日志等文件。确认 EULA 并完成配置后，使用 tmux 暂时保留交互式服务端控制台。

这台机器只有 2 GiB 内存，不能把全部 RAM 分给 Java。实际监控曾发现 Java 的 RSS 约 **1.3 GiB**、系统 `MemAvailable` 仅剩 **200～300 MiB**，Swap 已经使用了数百 MiB；不过采样时 `vmstat` 的 `si/so` 多数为零，不能仅凭 Swap 已使用就判断正在发生严重换页。

```bash
top
free -h
vmstat 1
ps -eo pid,user,%mem,rss,cmd --sort=-rss | head -n 10
```

资源分析让我明确了一点：**CPU 空闲不代表内存不紧张；找到高占用进程后，还要看 RSS、增长趋势、Swap 活动及业务表现。**

## 四、配置网络、世界参数与白名单

在腾讯云防火墙中开放 Minecraft 玩家使用的 TCP 25565，随后分别从服务端和客户端检查：

```bash
# Ubuntu：是否在监听
sudo ss -lntp | grep 25565
```

```powershell
# Windows：公网 TCP 能否连接
Test-NetConnection <服务器公网IP> -Port 25565
```

我将服务器配置为小规模联机，例如：

```properties
max-players=3
view-distance=8
simulation-distance=6
gamemode=survival
difficulty=normal
white-list=true
level-name=friend-world
```

`view-distance` 影响玩家能接收多远的区块；`simulation-distance` 影响多远范围内的实体、红石和游戏机制持续运算。它们不是单纯的客户端画面设置，而是直接关系到服务端负载。

当时还遇到一个很典型的应用层问题：**玩家名称已经添加进白名单，但仍被提示不在白名单中。** 最终发现 Minecraft 对玩家的识别还涉及 UUID。检查 `whitelist.json` 并在玩家成功连接后重新确认身份，才解决了问题。

这也让我意识到，公网端口可连通只是网络层成功；能否进入游戏，还可能受到版本、白名单和身份认证等应用层因素影响。

## 五、从 Vanilla 迁移到 Fabric

原版稳定运行后，才开始迁移 Fabric。这样一旦出错，就能把问题范围缩小到新引入的 Loader 或 Mod，而不是同时排查全部组件。

变更前先停服，给整个服务端目录做完整备份：

```bash
sudo mkdir -p /var/backups/minecraft/milestones

sudo tar -czf \
"/var/backups/minecraft/milestones/pre-fabric-$(date +%F_%H-%M-%S).tar.gz" \
-C /opt/minecraft server
```

然后下载匹配的 Fabric Server Launcher（当时使用 Minecraft 26.2、Loader 0.19.3、Launcher 1.1.2）：

```bash
sudo -u minecraft curl -fL \
  -o /opt/minecraft/server/fabric-server-launch.jar \
  'https://meta.fabricmc.net/v2/versions/loader/26.2/0.19.3/1.1.2/server/jar'
```

启动入口由原来的 `server.jar` 改为：

```bash
java -Xms512M -Xmx1G -jar fabric-server-launch.jar nogui
```

第一次只运行 Fabric Loader，不添加玩法 Mod；确认旧世界能够加载后，再逐步添加 Fabric API、Jade 和 AppleSkin，每安装一个阶段就检查启动日志。

并不是玩家客户端里的所有 Mod 都需要安装到服务器。像渲染、光影、小地图、鼠标操作类 Mod，通常主要由客户端使用；是否需要双端安装应以 Mod 的兼容性及依赖说明为准。

## 六、迁移朋友的旧存档

真正打算长期玩的，是朋友原来的世界。收到的压缩包约 1.5 GB，解压后的存档根目录具有 `level.dat`、`dimensions/`、`players/` 等结构。

我没有覆盖最初测试用的 `world/`，而是保留两个世界：

```text
/opt/minecraft/server/
├── world/          # 原测试世界，保留
└── friend-world/   # 朋友的正式世界
    ├── level.dat
    ├── dimensions/
    ├── players/
    └── ...
```

迁移过程中出现过一次“目录套娃”：

```text
friend-world/
└── 新的世界1/
    └── level.dat
```

原因是目标 `friend-world` 已经存在，`mv` 把源目录移动到了目标内部，而不是把它重命名为目标路径。整理好层级后，确保 `friend-world/level.dat` 直接存在，再统一所有权：

```bash
sudo chown -R minecraft:minecraft /opt/minecraft/server/friend-world
```

修改 `server.properties`：

```properties
level-name=friend-world
```

最终日志出现 `Preparing level "friend-world"`，客户端也能进入原世界。

日志里仍会显示 `ServerLevel[新的世界1]`，这是因为 Linux 上的世界**目录名**与 `level.dat` 中保存的世界**内部名称**是两回事；改目录名不会自动修改世界内部名称。

存档迁移还要关注玩家 UUID 对应的 `players/data/<UUID>.dat`，否则可能出现建筑正常但背包、位置和经验像新玩家一样的情况。这里也要留意版本差异：从 26.1 起，旧的 `playerdata/` 已经移到了 `players/data/`，所以网上旧教程里的路径不一定适合这次的 26.2。具体变化可以对照 [Minecraft 26.1 官方更新说明](https://feedback.minecraft.net/hc/en-us/articles/44551668333837-Minecraft-Java-Edition-26-1)。

## 七、从 tmux 过渡到 systemd

最初使用 tmux 的好处是 SSH 断开后仍能保留 Minecraft 控制台；但它主要管理的是**终端会话**，而不是系统服务的生命周期。

希望得到的效果是：

- `systemctl start/stop/restart` 统一管理。
- 开机自动启动 Minecraft。
- 异常退出时按策略尝试恢复。
- 通过 `journalctl` 集中检查日志。
- 停服时先保存世界，而不是直接强制终止 Java。

创建 `/etc/systemd/system/minecraft.service`，最终核心配置为：

```ini
[Unit]
Description=Minecraft Fabric Server
Requires=minecraft-rcon-firewall.service
After=network.target minecraft-rcon-firewall.service

[Service]
Type=exec
User=minecraft
Group=minecraft
WorkingDirectory=/opt/minecraft/server
ExecStart=/usr/bin/java -Xms512M -Xmx1G -jar /opt/minecraft/server/fabric-server-launch.jar nogui
ExecStop=/opt/minecraft/scripts/stop.sh $MAINPID
Restart=on-failure
RestartSec=10
KillSignal=SIGTERM
TimeoutStopSec=180

[Install]
WantedBy=multi-user.target
```

这里 `WorkingDirectory` 确保服务在正确目录读取世界和配置；`User/Group` 确保 Java 不以 root 身份运行；`Restart=on-failure` 是异常退出自动恢复策略，但截至本文写作时**只验证了配置已生效，没有故意强杀正式世界去演练故障恢复**。

修改 service 文件后需要：

```bash
sudo systemctl daemon-reload
sudo systemctl start minecraft
sudo systemctl status minecraft --no-pager
sudo journalctl -u minecraft -n 50 --no-pager
```

`daemon-reload` 只让 systemd 重新读取单元配置；如果改的是 `server.properties`，通常应该重启 Minecraft，而不是只执行 `daemon-reload`。

## 八、通过 RCON 管理服务器与安全停服

完成 systemd 基础配置后，我原以为服务器的托管工作已经接近尾声，但在测试 `systemctl stop minecraft` 时，却遇到了整个部署过程中一个比较棘手的问题：**Minecraft 的 Java 进程虽然结束了，systemd 却将服务判定为异常退出，而且日志中没有出现完整的世界保存记录，无法确认存档是否正常保存。**

对于 Minecraft 这样的有状态服务来说，进程成功退出并不意味着数据已经安全保存。这次问题也让我意识到，**服务管理不仅要保证能够正常启动，还必须保证能够安全停止。**

> ⭐ **围绕这个问题，我进行了多次排查与验证，过程涉及 Linux 进程信号、systemd 服务状态以及 Minecraft 的存档保存机制。由于排查过程比较长，我准备单独写一篇文章详细记录，这里就不展开了。**

最终，我选择使用 Minecraft 自带的 **RCON（远程控制台协议）** 来实现服务器管理与安全停服。它允许管理程序向游戏服务端发送 `list`、`save-all`、`stop` 等指令，而不需要重新接管 Java 的标准输入，也为后续通过 `systemctl` 正常停止 Minecraft 提供了实现方式。

在 `server.properties` 中配置：

```properties
enable-rcon=true
rcon.port=25575
rcon.password=<请替换为强随机密码>
```

配置文件包含管理密码，因此收紧文件权限：

```bash
sudo chown minecraft:minecraft /opt/minecraft/server/server.properties
sudo chmod 600 /opt/minecraft/server/server.properties
```

随后安装 `mcrcon` 作为本机 RCON 客户端。测试时，先通过 RCON 执行 `list` 和 `save-all flush`，确认服务端能够响应命令并记录世界保存日志。

为了让 `systemctl stop minecraft` 也能触发游戏内部的正常退出流程，我将 RCON 停服封装为 `/opt/minecraft/scripts/stop.sh`，并通过 `ExecStop` 调用。下面保留当时验证过的主体，同时补上空 PID 和 RCON 返回非零两个异常分支；这两个补充还需要在服务器上单独验证：

```bash
#!/usr/bin/env bash
set -euo pipefail

PID="${1:-}"
SERVER_DIR="/opt/minecraft/server"

# systemd 确认主进程已经退出时，MAINPID 可能为空。
if [[ -z "$PID" ]]; then
    echo "Minecraft main process has already exited"
    exit 0
fi

if [[ ! "$PID" =~ ^[0-9]+$ ]] || (( PID <= 1 )); then
    echo "ERROR: Invalid Minecraft PID" >&2
    exit 1
fi

if ! kill -0 "$PID" 2>/dev/null; then
    exit 0
fi

MCRCON_PASS=$(sed -n 's/^rcon[.]password=//p' \
    "$SERVER_DIR/server.properties")
if [[ -z "$MCRCON_PASS" ]]; then
    echo "ERROR: RCON password is empty" >&2
    exit 1
fi
export MCRCON_PASS

if /usr/local/bin/mcrcon -H 127.0.0.1 -P 25575 stop; then
    echo "RCON stop command sent"
else
    rcon_status=$?
    echo "RCON returned $rcon_status; waiting for Minecraft to exit" >&2
fi
unset MCRCON_PASS

# 等待游戏正常保存并结束，避免过早返回
for ((i=0; i<150; i++)); do
    if ! kill -0 "$PID" 2>/dev/null; then
        echo "Minecraft stopped successfully"
        exit 0
    fi
    sleep 1
done

echo "ERROR: Minecraft did not exit within 150 seconds; check server logs" >&2
exit 1
```

RCON 返回非零，既可能是关服时连接提前断开，也可能是真的没有连上，所以脚本仍会继续等待 Java 退出。进程退出也不等于一定正常保存，最终还要结合 `Saving players`、`Saving worlds` 等日志确认。`ExecStop` 的等待和 `$MAINPID` 行为可以对照 [systemd.service 文档](https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html#ExecStop=)。

测试时可以在另一个 SSH 会话中查看日志：

```bash
sudo systemctl stop minecraft
sudo journalctl -u minecraft -n 50 --no-pager
```

最终能够看到 `Saving players`、`Saving worlds`、`All dimensions are saved` 等日志，服务状态回到 `inactive (dead)`，说明已经完成正常停服和存档保存的验证。

> **关于中途的停服异常**：最初测试时曾遇到进程结束后，停服状态和世界保存过程无法直接确认的情况。这个问题涉及 systemd 退出状态、进程信号及日志判断，排查过程比较长，准备单独写一篇故障复盘；本文只介绍最后采用并验证通过的方案。

## 九、保护 RCON 并处理开机顺序

RCON 启动日志显示 `0.0.0.0:25575`，意味着它监听所有 IPv4 接口，而不只是本机。RCON 通信本身缺乏加密保护，因此绝不能把 25575 当作普通游戏端口向公网开放。

我的防护措施有两层：

1. **腾讯云防火墙**：只放行必要的 SSH、HTTP、HTTPS 和游戏端口，不开放 TCP 25575。
2. **Ubuntu 主机防火墙**：用 iptables/ip6tables 拒绝所有来自非回环接口的 TCP 25575 入站流量。

核心规则为：

```bash
sudo iptables -I INPUT 1 -p tcp --dport 25575 ! -i lo -j DROP
sudo ip6tables -I INPUT 1 -p tcp --dport 25575 ! -i lo -j DROP
```

服务器上还存在 `YJ-FIREWALL-INPUT` 自定义安全链，里面有动态维护的 SSH 拒绝规则，因此我没有粗暴保存整套 iptables 规则，而是写了一个**只维护 RCON 规则**的脚本，并建立 `minecraft-rcon-firewall.service`：

```ini
[Unit]
Description=Prepare Minecraft RCON Firewall

[Service]
Type=oneshot
ExecStart=/usr/local/sbin/minecraft-rcon-firewall.sh
```

`Type=oneshot` 表示执行一次脚本就结束，不需要长期驻留。这里没有设置 `RemainAfterExit=yes`，所以执行成功后显示 `inactive (dead)` 也是正常的；我会结合退出结果和实际防火墙规则确认它是否成功，不能只看有没有 `active`。防火墙脚本会检查 IPv4/IPv6 规则，保证 RCON 拒绝规则位于 INPUT 链靠前位置，再允许 Minecraft 启动。

实际使用的防火墙准备脚本位于 `/usr/local/sbin/minecraft-rcon-firewall.sh`，核心逻辑为：

```bash
#!/usr/bin/env bash
set -euo pipefail

for tool in iptables ip6tables; do
    # 删除已有的同类规则，避免重复和顺序错误
    while "$tool" -w -C INPUT \
        -p tcp --dport 25575 ! -i lo -j DROP 2>/dev/null; do
        "$tool" -w -D INPUT \
            -p tcp --dport 25575 ! -i lo -j DROP
    done

    # 放到 INPUT 最前面，避免先被其他规则放行
    "$tool" -w -I INPUT 1 \
        -p tcp --dport 25575 ! -i lo -j DROP
done

echo "Minecraft RCON firewall rules ready"
```

更新规则时会有很短的删除再插入窗口，所以这项操作应配合云防火墙保护，最好在游戏服务停止或启动前执行；脚本应归 root 管理，不能交给游戏进程随意修改。

在 `minecraft.service` 中加入：

```ini
Requires=minecraft-rcon-firewall.service
After=network.target minecraft-rcon-firewall.service
```

`Requires=` 负责依赖，`After=` 负责启动顺序：**必须让防火墙准备成功，游戏服务才开始启动。**

这套机制能保证通过 systemd 启动 Minecraft 前执行防火墙检查；它不能保证其他安全程序之后永远不会改动这些规则，因此仍需持续检查。

## 十、最终验收与目前边界

依次进行了：

```bash
sudo systemctl start minecraft
sudo systemctl stop minecraft
sudo systemctl restart minecraft
sudo systemctl enable minecraft
sudo systemctl reboot
```

整机重启后重新 SSH 登录，并通过下列命令检查：

```bash
sudo systemctl is-enabled minecraft
sudo systemctl is-active minecraft
sudo journalctl -b -u minecraft-rcon-firewall -u minecraft --no-pager
sudo iptables -S INPUT | head -n 5
sudo ip6tables -S INPUT | head -n 5
sudo ss -lntp | grep -E '25565|25575'
```

实际日志确认：**先执行防火墙准备服务，再启动 Minecraft**；Fabric 能加载 `friend-world`，25565/25575 正常监听，防火墙规则也在重启后恢复。通过 `ExecStop` 的 `systemctl stop` 已经验证能够保存玩家与世界，并最终进入 `inactive (dead)`。

截至这篇文章完成，状态如下：

| 功能 | 状态 |
| --- | --- |
| 独立用户与目录权限 | 已完成 |
| Minecraft / Fabric / 基础 Mod | 已完成 |
| 朋友旧世界迁移 | 已完成 |
| 变更前完整备份及 README 记录 | 已完成 |
| `systemctl start/stop/restart` | 已验证 |
| RCON 保存与安全停服 | 已验证 |
| 开机自启与防火墙先行启动 | 已通过整机重启验证 |
| `Restart=on-failure` | 已配置，尚未模拟崩溃 |
| 自动备份、巡检、邮件告警 | **尚未实施** |

还有两项安全工作不能忽略：一是 `online-mode=false` 的身份冒用风险，二是管理脚本应最终放在真正由 root 控制、业务账号无法替换的目录中。当前 `/opt/minecraft` 顶层归 `minecraft` 所有，哪怕 `scripts/stop.sh` 归 root，业务账号对上级目录的写权限仍可能带来脚本替换风险。

## 十一、这次实践最大的收获

真正有价值的，不只是“游戏开起来了”，而是学会围绕一个真实运行的服务逐层提问：

- **服务打不开**：先查进程、监听端口、云防火墙，再查应用日志、版本和白名单。
- **CPU 或内存高**：先定位进程，再观察趋势、业务负载、RSS、available、Swap `si/so`，而不是直接重启。
- **修改服务**：先停服、备份、验证压缩包，再变更并保留回滚入口。
- **服务管理**：区分 tmux 的终端会话管理与 systemd 的服务生命周期管理。
- **验证结果**：不仅确认进程是否退出，还要检查游戏存档日志、服务状态和实际连接情况。
- **安全配置**：管理接口与玩家接口分开，防火墙保护必须考虑启动顺序和重启后的有效性。

下一阶段，我准备继续实现自动备份、备份轮转与恢复演练，再做资源巡检和异常通知。同时，会另写一篇停服故障复盘，专门记录发现异常、分析日志、验证假设以及最终修复的全过程。到那时，这个最初只是为了方便朋友联机的小想法，才会逐步成为一个更完整的 Linux 运维练习项目。
