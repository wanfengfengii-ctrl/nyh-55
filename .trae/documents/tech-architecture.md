## 1. 架构设计

```mermaid
flowchart TB
    subgraph "前端层"
        "UI[控制面板 Mantine]"
        "PIX[PixiJS 画布]"
        "TABLE[差分表格]"
        "LOG[运算记录]"
    end
    subgraph "状态层"
        "STORE[Zustand Store]"
    end
    subgraph "引擎层"
        "ENGINE[差分引擎核心]"
        "HISTORY[状态历史栈]"
        "VALIDATOR[合法性校验]"
    end
    "UI" --> "STORE"
    "STORE" --> "PIX"
    "STORE" --> "TABLE"
    "STORE" --> "LOG"
    "STORE" --> "ENGINE"
    "ENGINE" --> "HISTORY"
    "ENGINE" --> "VALIDATOR"
    "VALIDATOR" --> "STORE"
```

## 2. 技术说明

- **前端框架**：React 18 + TypeScript + Vite
- **UI 库**：Mantine v7（组件库、表单、通知）
- **动画引擎**：PixiJS v8（2D Canvas/WebGL 渲染，数字轮/齿轮动画）
- **状态管理**：Zustand（轻量级状态管理，支持中间件）
- **初始化工具**：vite-init（react-ts 模板）
- **后端**：无（纯前端应用）
- **数据持久化**：localStorage（保存用户设置和历史运算）

## 3. 路由定义

| 路由 | 用途 |
|------|------|
| / | 主页面，包含差分机全部功能 |

## 4. 核心数据结构

### 4.1 差分机状态

```typescript
interface DifferenceEngineState {
  order: number;
  modulus: number;
  columns: DigitColumn[];
  crankPosition: number;
  phase: EnginePhase;
  errorState: ErrorInfo | null;
}

interface DigitColumn {
  wheels: DigitWheel[];
  carryLever: CarryLever;
  gearAngle: number;
}

interface DigitWheel {
  digit: number;
  targetDigit: number;
  rotation: number;
  isCarrying: boolean;
  isError: boolean;
}

interface CarryLever {
  engaged: boolean;
  sourceWheel: number;
  targetWheel: number;
  animationProgress: number;
}

type EnginePhase = 'idle' | 'adding' | 'carrying' | 'error' | 'complete';

interface ErrorInfo {
  type: 'overflow' | 'negative' | 'invalid_state';
  column: number;
  wheel: number;
  message: string;
}
```

### 4.2 运算记录

```typescript
interface ComputationStep {
  stepNumber: number;
  crankTurn: number;
  phase: 'add' | 'carry';
  column: number;
  previousValues: number[];
  newValues: number[];
  carryTriggered: boolean;
  errorOccurred: boolean;
  timestamp: number;
}

interface OperationLog {
  steps: ComputationStep[];
  currentStep: number;
  snapshotStack: DifferenceEngineState[];
}
```

## 5. 差分引擎算法

### 5.1 差分法原理

对于 n 阶多项式 f(x)，利用差分表中各阶差分之间的递推关系：
- Δ⁰ᵢ = f(i)（第0阶差分即原函数值）
- Δᵏᵢ = Δᵏ⁻¹ᵢ₊₁ - Δᵏ⁻¹ᵢ（第k阶差分）
- 当 f 为 n 次多项式时，Δⁿ 为常数

### 5.2 前向推算步骤

每次手柄转动执行一轮运算：
1. 从最高阶差分开始，逐阶向下加法
2. Δⁿ → Δⁿ⁻¹：第n阶差分加到第n-1阶
3. Δⁿ⁻¹ → Δⁿ⁻²：第n-1阶差分加到第n-2阶
4. ...依次类推直到 Δ⁰
5. 每次加法后检查进位，触发进位杆和齿轮联动

### 5.3 数字轮与进位

- 每个数由多个数字轮表示，每个轮显示0-9
- 加法：数字轮正向转动对应格数
- 进位：当数字轮从9变为0（或超过9取模），触发向高位的进位
- 进位杆联动：进位杆推动相邻齿轮，高位数字轮转动1格

### 5.4 合法性校验

- 差分阶数必须大于0
- 数值溢出检测：超出模数范围
- 负数检测：差分结果不允许为负数
- 非法状态：进位级联超限

## 6. 项目目录结构

```
src/
├── components/
│   ├── EngineCanvas.tsx        # PixiJS 画布容器
│   ├── ControlPanel.tsx        # Mantine 参数控制面板
│   ├── DiffTable.tsx           # 差分表格组件
│   ├── OperationLog.tsx        # 运算记录组件
│   └── ErrorOverlay.tsx        # 错误高亮覆盖层
├── engine/
│   ├── DifferenceEngine.ts     # 差分引擎核心逻辑
│   ├── DigitWheel.ts           # 数字轮逻辑
│   ├── CarryMechanism.ts       # 进位机制逻辑
│   └── Validator.ts            # 合法性校验
├── pixi/
│   ├── WheelRenderer.ts        # 数字轮渲染器
│   ├── GearRenderer.ts         # 齿轮渲染器
│   ├── CarryRenderer.ts        # 进位杆渲染器
│   └── AnimationController.ts  # 动画控制器
├── store/
│   └── engineStore.ts          # Zustand 状态管理
├── types/
│   └── index.ts                # TypeScript 类型定义
├── utils/
│   └── math.ts                 # 数学工具函数
├── App.tsx
└── main.tsx
```
