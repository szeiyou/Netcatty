# Netcatty 代码重构文档

本次重构基于 DDD（领域驱动设计）原则和单一职责原则，将项目中超过 1000 行的大型文件拆分为更小、更专注的模块。

## 重构概述

| 原始文件 | 原始行数 | 拆分后模块 | 模块数量 |
|---------|---------|-----------|---------|
| `electron/main.cjs` | 2121 行 | `electron/bridges/` | 7 个 bridge + 1 个入口 |
| `components/SftpView.tsx` | 1855 行 | `components/sftp/` | 8 个模块 |
| `components/KeychainManager.tsx` | 1974 行 | `components/keychain/` | 12 个模块 |
| `components/Terminal.tsx` | 1465 行 | `components/terminal/` | 4 个模块 |
| `components/PortForwardingNew.tsx` | 1359 行 | `components/port-forwarding/` | 5 个模块 |
| `components/HostDetailsPanel.tsx` | 1211 行 | `components/host-details/` | 4 个模块 |

---

## 1. Electron Main Process (`electron/bridges/`)

将 2121 行的 `main.cjs` 拆分为专门的 bridge 模块，每个 bridge 负责一类 IPC 通信：

```
electron/
├── bridges/
│   ├── sshBridge.cjs        # SSH 会话管理 (startSSHSession, writeToSession, resizeSession, closeSession)
│   ├── sftpBridge.cjs       # SFTP 操作 (listDir, mkdir, readFile, writeFile, delete, rename)
│   ├── localFsBridge.cjs    # 本地文件系统操作 (readDir, openDir, saveDialog, downloadFile)
│   ├── transferBridge.cjs   # 文件传输 (上传/下载进度、冲突处理、队列管理)
│   ├── portForwardingBridge.cjs  # 端口转发 (startPortForward, stopPortForward)
│   ├── terminalBridge.cjs   # 本地终端/Telnet/Mosh 会话
│   └── windowManager.cjs    # 窗口管理 (minimize, maximize, close, getOS)
├── main.new.cjs             # 新入口点 (~170 行)
└── main.cjs                 # 原始文件 (保留作为参考)
```

### 使用方式
```javascript
// main.new.cjs
const { registerSshBridge } = require('./bridges/sshBridge');
const { registerSftpBridge } = require('./bridges/sftpBridge');
// ... 其他 bridges

registerSshBridge(ipcMain);
registerSftpBridge(ipcMain);
// ...
```

---

## 2. SFTP View (`components/sftp/`)

将 1855 行的 `SftpView.tsx` 拆分为可复用的 UI 组件：

```
components/sftp/
├── utils.ts                  # 工具函数 (formatBytes, formatDate, getFileIcon)
├── SftpBreadcrumb.tsx       # 面包屑导航组件
├── SftpFileRow.tsx          # 文件/文件夹行组件 (支持上下文菜单)
├── SftpTransferItem.tsx     # 传输队列项组件 (进度、状态)
├── SftpConflictDialog.tsx   # 文件冲突解决对话框
├── SftpPermissionsDialog.tsx # 权限编辑对话框 (chmod)
├── SftpHostPicker.tsx       # 主机选择器 (用于复制/移动到其他主机)
├── index.ts                 # 模块导出
└── SftpView.new.tsx         # 重构后的主组件
```

### 组件职责
- **SftpBreadcrumb**: 显示当前路径，支持点击导航
- **SftpFileRow**: 单个文件/文件夹的显示，包含名称、大小、修改时间、权限
- **SftpTransferItem**: 显示单个传输任务的进度、速度、状态
- **SftpConflictDialog**: 处理同名文件冲突（覆盖/跳过/重命名/应用到全部）
- **SftpPermissionsDialog**: 可视化编辑 Unix 权限

---

## 3. Keychain Manager (`components/keychain/`)

将 1974 行的 `KeychainManager.tsx` 拆分为面板组件：

```
components/keychain/
├── utils.ts                     # 工具函数 (generateMockKeyPair, createFido2Credential, getKeyIcon)
├── KeyCard.tsx                  # SSH 密钥卡片 (grid/list 视图)
├── IdentityCard.tsx             # 身份卡片 (用户名/密码)
├── GenerateStandardPanel.tsx    # 标准密钥生成表单 (ED25519/ECDSA/RSA)
├── GenerateBiometricPanel.tsx   # 生物识别密钥 (Windows Hello/Touch ID)
├── GenerateFido2Panel.tsx       # FIDO2 硬件密钥 (YubiKey)
├── ImportKeyPanel.tsx           # 导入现有密钥 (拖放/文件选择)
├── ViewKeyPanel.tsx             # 查看密钥详情 (公钥复制)
├── EditKeyPanel.tsx             # 编辑密钥
├── IdentityPanel.tsx            # 创建/编辑身份
├── ExportKeyPanel.tsx           # 导出密钥到远程主机
└── index.ts                     # 模块导出
```

### 面板导航模式
```typescript
type PanelMode = 
  | { type: 'generate'; variant: 'standard' | 'biometric' | 'fido2' }
  | { type: 'import' }
  | { type: 'view'; keyId: string }
  | { type: 'edit'; keyId: string }
  | { type: 'identity'; identityId?: string }
  | { type: 'export'; keyId: string };
```

---

## 4. Terminal (`components/terminal/`)

将 1465 行的 `Terminal.tsx` 拆分为可复用组件：

```
components/terminal/
├── TerminalAuthDialog.tsx       # 认证表单 (密码/密钥选择)
├── TerminalConnectionProgress.tsx # 连接进度显示 (日志、超时)
├── TerminalToolbar.tsx          # 工具栏 (SFTP、Scripts 按钮)
├── TerminalConnectionDialog.tsx # 完整连接覆盖层 (组合以上组件)
└── index.ts                     # 模块导出
```

### 组件职责
- **TerminalAuthDialog**: 密码/公钥认证方式切换，密钥列表选择
- **TerminalConnectionProgress**: 连接阶段日志、超时倒计时、取消/重试按钮
- **TerminalToolbar**: SFTP 按钮、Scripts 弹出菜单、关闭会话按钮
- **TerminalConnectionDialog**: 组合所有连接相关 UI，支持链式连接进度

---

## 5. Port Forwarding (`components/port-forwarding/`)

将 1359 行的 `PortForwardingNew.tsx` 拆分：

```
components/port-forwarding/
├── utils.tsx                # 工具函数和常量 (TYPE_LABELS, getStatusColor, getTypeColor)
├── RuleCard.tsx            # 规则卡片 (grid/list 视图，上下文菜单)
├── WizardContent.tsx       # 向导步骤内容渲染器
├── EditPanel.tsx           # 编辑现有规则面板
├── NewFormPanel.tsx        # 新建规则表单 (跳过向导模式)
└── index.ts                # 模块导出
```

### 向导步骤
```typescript
type WizardStep = 
  | 'type'                  // 选择转发类型
  | 'local-config'          // 本地端口配置
  | 'remote-host-selection' // 选择远程主机
  | 'remote-config'         // 远程端口配置
  | 'destination'           // 目标地址配置
  | 'host-selection'        // 选择 SSH 服务器
  | 'label';                // 规则标签
```

---

## 6. Host Details (`components/host-details/`)

将 1211 行的 `HostDetailsPanel.tsx` 拆分为子面板：

```
components/host-details/
├── CreateGroupPanel.tsx    # 创建新分组
├── ProxyPanel.tsx          # HTTP/SOCKS5 代理配置
├── ChainPanel.tsx          # SSH 跳板主机链配置
├── EnvVarsPanel.tsx        # 环境变量配置
└── index.ts                # 模块导出
```

### 子面板类型
```typescript
type SubPanel = 
  | 'none'           // 主面板
  | 'create-group'   // 创建分组
  | 'proxy'          // 代理配置
  | 'chain'          // 跳板链配置
  | 'env-vars'       // 环境变量
  | 'theme-select'   // 主题选择
  | 'telnet-theme-select';  // Telnet 主题选择
```

---

## 迁移指南

### 更新导入路径

原始：
```typescript
import SftpView from './components/SftpView';
```

重构后（使用原始组件）：
```typescript
import SftpView from './components/SftpView'; // 保持不变
```

使用子组件：
```typescript
import { SftpFileRow, SftpBreadcrumb } from './components/sftp';
```

### 逐步迁移策略

1. **保留原始文件**: 所有原始文件保持不变，新组件作为并行实现
2. **测试新组件**: 可以在新文件中 import 子组件进行测试
3. **替换主组件**: 确认无误后，可以将 `*.new.tsx` 替换原始文件
4. **更新导入**: 如需直接使用子组件，从对应的 index.ts 导入

---

## 设计原则

### 单一职责原则 (SRP)
- 每个组件只负责一个功能领域
- Bridge 模块按通信类型分离
- 面板组件按用户交互流程分离

### 高内聚低耦合
- 相关功能组织在同一目录下
- 通过 index.ts 提供统一导出接口
- 使用 props 进行组件间通信

### 可复用性
- 工具函数抽取到 utils.ts
- 通用 UI 模式提取为独立组件
- 类型定义与实现分离

---

## 文件统计

| 类别 | 重构前行数 | 重构后总行数 | 新增文件数 |
|-----|----------|------------|----------|
| Electron Main | 2121 | ~2300 | 8 |
| SFTP View | 1855 | ~2000 | 9 |
| Keychain | 1974 | ~2200 | 13 |
| Terminal | 1465 | ~1600 | 5 |
| Port Forwarding | 1359 | ~1500 | 6 |
| Host Details | 1211 | ~1400 | 5 |
| **总计** | **9985** | **~11000** | **46** |

> 注：重构后总行数略有增加是因为添加了模块导出、类型定义和必要的样板代码，但每个文件的平均大小从 ~1600 行降低到 ~240 行，大大提高了可维护性。
