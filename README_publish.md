# ImgDo 发布指南

本文说明如何把 **ImgDo** 打成 `.vsix`，并发布到 **VS Code**、**Cursor**、**Trae**。

> 扩展 ID：`xydideo.imgdo`  
> 作者 / Publisher：`xydideo`（已写入 `package.json` 的 `publisher` 与 `author`）。  
> 上架时请在 VS Code Marketplace 与 Open VSX 创建同名 Publisher / Namespace：`xydideo`。

> https://marketplace.visualstudio.com/manage
> https://open-vsx.org/
---

## 总览


| 平台          | 用户如何安装                  | 是否需要单独发布      | 发布到哪里                                                              | 是否需要注册账号                                                |
| ----------- | ----------------------- | ------------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| **VS Code** | 扩展市场搜索 / 从 VSIX 安装      | 要上市场则需要       | [Visual Studio Marketplace](https://marketplace.visualstudio.com/) | **需要**（微软账号 + Marketplace Publisher + Azure DevOps PAT） |
| **Cursor**  | 扩展市场搜索 / 从 VSIX 安装      | 要上市场则需要       | [Open VSX Registry](https://open-vsx.org/)                         | **需要**（GitHub / Eclipse 账号 + Open VSX 命名空间 + Token）     |
| **Trae**    | 扩展市场搜索（若能搜到）/ 从 VSIX 安装 | **一般无独立发布通道** | 依赖 VS Code 市场或本地 VSIX                                              | **发布侧不需要 Trae 账号**；用户侧安装可不登录                            |


本地自测 / 内部分发：只需打出 `.vsix`，三个编辑器都可以「从 VSIX 安装」，**不必注册任何市场账号**。

---



## 0. 发布前检查（所有平台共用）



### 0.1 改好 `package.json`

至少确认：

- `name`：`imgdo`（勿随意改，会影响扩展 ID 的后半段）
- `displayName`：`ImgDo`
- `publisher` / `author`：已设为 `xydideo`（市场侧需创建同名 Publisher / Namespace）
- `version`：按 semver 递增（如 `0.1.0` → `0.1.1`）



### 0.2 安装依赖与构建

```bash
npm install
npm run build
```

构建产物目录：`ImgDo/`（入口为 `ImgDo/extension.js`）。

### 0.3 安装打包 / 发布 CLI

```bash
npm i -D @vscode/vsce ovsx
```



### 0.4 常用 npm 命令

```bash
npm run build              # 仅构建
npm run package            # 生成 .vsix（不发布）
```

**Trae 没有发布命令**：发完 VS Code 后一般即可被搜到；否则把 `.vsix` 给用户本地安装。


## 1. 发布到 VS Code（Visual Studio Marketplace）

**目标**：用户在 VS Code 扩展市场能搜索到 ImgDo。  
**是否需要注册账号**：**需要**。

### 1.1 需要注册 / 创建什么


| 步骤  | 账号 / 资源                        | 说明                                                                                                                                          |
| --- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **微软账号**（Microsoft Account）    | 登录 Marketplace 管理页                                                                                                                          |
| 2   | **Marketplace Publisher**      | 在 [Manage Publishers](https://marketplace.visualstudio.com/manage) 创建；**Publisher ID 必须与** `package.json` **的** `publisher` **一致**，创建后基本不可改 |



### 1.2 操作流程

**方式 A：网页上传（无需 Token）**

1. 打开 [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage)
2. 选择 Publisher `xydideo` → 上传 `imgdo-x.y.z.vsix`


首次发布成功后，扩展页：

`https://marketplace.visualstudio.com/items?itemName=xydideo.imgdo`

### 1.3 后续更新

1. 修改代码
2. 升高 `package.json` 的 `version`

---



## 2. 发布到 Cursor（Open VSX）

**目标**：用户在 Cursor 扩展市场能搜索到 ImgDo。  
**是否需要注册账号**：**需要**（与微软市场是两套体系）。

> Cursor **不使用** Visual Studio Marketplace，而是基于 **Open VSX**（并经 Cursor 侧代理/同步）。  
> **只发布到 VS Code 市场，Cursor 里通常搜不到。**



### 2.1 需要注册 / 创建什么


| 步骤  | 账号 / 资源                       | 说明                                                  |
| --- | ----------------------------- | --------------------------------------------------- |
| 1   | **GitHub 账号**（常用）或 Eclipse 账号 | 登录 [Open VSX](https://open-vsx.org/)                |
| 2   | 签署 **Publisher Agreement**    | 首次发布前在 Open VSX 侧完成协议签署                             |
| 3   | **Namespace（命名空间）**           | 名称应与 `package.json` 的 `publisher` **相同**（`xydideo`） |
