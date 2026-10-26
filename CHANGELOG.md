# 变更记录

## 2.2.0

- 新增「版本背景」：≥3.0.0 为 C++ 原生 CEF 壳、<3.0.0 为 C# 壳；冷/热启动只有 ≥3.1.0 才有，更早版本每次启动都是全新实例
- 按版本给既有条目加限定：单实例参数转发、连点两次 exe、CefSharp 手册三条只在对应版本成立
- `check_env.py` 从包目录名解析版本，多打印一行 `版本:`（壳形态 + 启动语义）；识别不到时提示人工确认，退出码不变
- 明确标注：全部实测结论来自 3.1.1，<3.0.0 的 C# 壳未做基线测试

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
