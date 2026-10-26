# 变更记录

## 2.1.0

- 新增 `scripts/check_env.py`：只读判定 `install` / `frontend` / `direct`，退出码 `2/3/0`
- 新增环境自检一节：`IsFirstRun` 为 `true` 或键缺失即安装态，`ServerUrl` 有值不代表装完
- CDP 细节拆到 `cdp-recipes.md`，`SKILL.md` 只留判定与红线
- 补红线：本机构建上调 `setZoomLevel` 会直接退出整个客户端

## 2.0.0

- 重写为「先用壳自己的入口，再考虑系统层手段」的主线
- 收录实测坑：`localhost:9222` 落到 `[::1]` 上另一个 Chrome；CEF 不支持 `PUT /json/new` 与 `Target.createTarget`；`Network.getRequestPostData` 才是唯一可靠的取 body 方式
- 退出客户端统一走 `initObj.exitApplication()`，验收看进程 / 端口 / PID 三条

## 1.0.0

- 首版：冷热启动、调试端口、抓包与退出流程
