# 推理子系统：TensorFlow.js 集成与降级

对应 C++ 版 `engine/neural_*` 与 `docs/` 推理设计。实现位于 `src/engine/infer/`。

## 模块

| 文件 | 职责 |
| --- | --- |
| `tensor.js` | `NanoTensor`：纯 JS 张量引擎（shape/stride/matmul/conv2d/激活），零依赖黄金参考 |
| `tfjs_backend.js` | TF.js 适配层：检测 `@tensorflow/tfjs`，存在则接管算子 |
| `inference.js` | 统一推理入口：模型加载（JSON 权重）、前向执行、后端选择与降级 |
| `neural.js` | 高层封装：MLP/小卷积网的层描述与构建 |

## 后端选择（红线 E：可选层缺失即降级，不崩溃）

```
InferenceEngine.create()
   ├─ 检测到 tfjs（浏览器 importmap CDN / Node optionalDependency）
   │    → TF.js 后端（WebGL/WASM 加速）
   └─ 未检测到
        → NanoTensor（纯 JS，正确性参考，小规模实时够用）
```

降级是显式的：`engine.backendName` 报告实际后端，调用方可读取并记录，
不静默吞错（红线 A）。

## 消费方

| 场景 | 引擎文件 | 用法 |
| --- | --- | --- |
| 神经材质 | `render/neural_material.js` | MLP 拟合 BRDF 切片，替代查表 |
| DDGI 去噪 | `render/ddgi.js` | 可选神经网络探针辐照滤波 |
| ReSTIR 变体 | `render/restir.js` | 可选神经重采样权重 |
| 超分 | `render/frame_interp.js` | 低分辨率渲染 → 网络上采样 |
| AI 行为 | `sim/ai.js` | 策略网络驱动 NPC 决策 |

## 模型格式

JSON：`{ layers: [{ type: 'dense'|'conv2d'|'relu'|..., weights: [...], bias: [...] }] }`。
`inference.js` 逐层构建；权重可用 Python 侧脚本从 TF/PyTorch 导出。
TF.js 存在时同一 JSON 也可映射为 `tf.LayersModel` 执行。

## 验证

`tools/smoke/infer_smoke.js`：NanoTensor 算子正确性（matmul/conv2d 对手算结果）、
后端降级路径、MLP 前向数值。Node 下无 TF.js 时必须全绿 —— 这本身就是降级路径的验收。
