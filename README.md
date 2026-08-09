# Codex × DeepSeek 一键配置助手（网站原型）

一个纯静态单页网站，把“下载 Codex → 登录 DeepSeek → 获取 API Key → 部署配置 → 开始使用”做成 5 个可点击步骤。

> 本工具仅面向电脑端（Windows / macOS）使用。手机或平板访问时会显示拦截提示页；请使用电脑上的 Chrome 或 Edge 打开。

## 在线访问

- 已部署地址：<https://sergiosperling103-coder.github.io/codex-deepseek-site/>
- GitHub 仓库：<https://github.com/sergiosperling103-coder/codex-deepseek-site>

## 更换网址 / 绑定自己的域名

### 方式一：直接换 GitHub Pages 地址（最简单）

修改仓库名即可，网址会变成 `https://<你的GitHub用户名>.github.io/<新仓库名>/`：

1. 打开仓库 Settings → General → Repository name，改名；
2. 等一两分钟，新地址自动生效，旧地址会失效。

### 方式二：绑定自己的域名（GitHub Pages）

1. 仓库 Settings → Pages → Custom domain，填你的域名（如 `codex.example.com`）；
2. 去你的域名服务商（阿里云/腾讯云/Cloudflare 等）加 DNS 记录：
   - 根域名（`example.com`）：添加 4 条 A 记录，指向 `185.199.108.153`、`185.199.109.153`、`185.199.110.153`、`185.199.111.153`；
   - 子域名（`codex.example.com`）：添加 1 条 CNAME 记录，指向 `sergiosperling103-coder.github.io`；
3. 回到 GitHub Pages 设置页点 Save，勾选 Enforce HTTPS，等证书自动签发（通常几分钟）；
4. 也可以直接在仓库根目录放一个 `CNAME` 文件，内容写你的域名，效果相同。

### 方式三：换到 Vercel / Netlify（想用它们自带域名或更方便的域名管理）

1. 把整个 `codex-deepseek-site` 文件夹拖到 [Netlify Drop](https://app.netlify.com/drop)（无需注册就能获得临时域名）；
2. 或用 Vercel：登录后 New Project → Import 这个文件夹（或 GitHub 仓库）；
3. 免费域名形如 `xxx.netlify.app` / `xxx.vercel.app`；
4. 绑定自己的域名：在对应平台的 Domains 设置里添加域名，按平台提示把 CNAME / A 记录加到你的域名服务商即可。

## 运行方式

- 最简单：直接双击 `index.html`（浏览器打开即可，无需服务器）。
- 也可以放到任意静态托管（GitHub Pages / Netlify / Vercel / Nginx）。

推荐使用 Chrome 或 Edge，才能使用“方式 A：网页一键部署”（浏览器直接写入 `~/.codex` 配置）。Firefox / Safari 用户请使用“方式 B：官方脚本”或“方式 C：下载配置”。

## 文件说明

| 文件 | 作用 |
| --- | --- |
| `index.html` | 页面结构与 5 步引导 |
| `styles.css` | 样式 |
| `app.js` | 交互逻辑：跳转、Key 验证、部署、恢复、下载 |
| `toml-merge.js` | 极简 TOML 合并器（保留旧配置，只改写 DeepSeek 相关字段） |
| `models-data.js` | 内嵌的 DeepSeek 官方模型目录（自动生成，来自 DeepSeek 官方脚本） |
| `assets/models.json` | 官方模型目录原文，供“方式 C”下载 |

## 架构与安全

- 纯静态页面，无后端。API Key 只存在于浏览器内存和本机 `~/.codex/config.toml`，不会上传到任何服务器。
- Key 验证直接请求 DeepSeek API（`https://api.deepseek.com/responses`），已验证支持浏览器跨域。
- “方式 A”使用浏览器 File System Access API：用户主动选择 `~/.codex` 文件夹后，网页获得该目录的读写权限，自动备份旧配置、写入 `config.toml` 和 `models.json`，并提供一键恢复。
- 登录 DeepSeek 的密码与短信验证码始终由用户本人在官方页面输入，网站不接触凭据（浏览器安全限制，也不建议任何网站代管密码）。

## 限制与注意

- API Key 会明文保存在 `config.toml`（DeepSeek 官方脚本同样如此）。建议不要分享该文件，可在平台随时轮换 Key。
- `deepseek-v4-flash` 已官方适配 Codex；`deepseek-v4-pro` 预计 2026 年 8 月初支持，如验证失败请切换 flash。
- “方式 A”写配置时，Windows 建议在路径输入框填完整路径（如 `C:/Users/你的用户名/.codex/models.json`），因为旧版 Codex 在 Windows 上对 `~` 展开不可靠。

## 参考来源

- [DeepSeek 官方：Integrate with Codex](https://api-docs.deepseek.com/quick_start/agent_integrations/codex/)
- [DeepSeek 官方：Using the Responses API](https://api-docs.deepseek.com/guides/responses_api/)
- [OpenAI Codex 官网下载](https://openai.com/codex/)
- [OpenAI Codex 开源仓库](https://github.com/openai/codex)
