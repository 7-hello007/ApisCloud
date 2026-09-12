# **ApisCloud - 蜂云** 智能驾驶服务调度系统

[![CI](https://github.com/7-hello007/ApisCloud/actions/workflows/ci.yml/badge.svg)](https://github.com/7-hello007/ApisCloud/actions/workflows/ci.yml)
[![Security](https://github.com/7-hello007/ApisCloud/actions/workflows/security.yml/badge.svg)](https://github.com/7-hello007/ApisCloud/actions/workflows/security.yml)

## 定位

- 我们做：接入外部自动驾驶系统数据、处理数据、调度决策、下发指令。
- 我们不做：不造自动驾驶系统、不控车、不采原始传感器、不负责车辆安全。

## 快速开始

```bash
pnpm install
make test-unit
make lint
make typecheck
```

## 目录结构
见 [destination](docs/destination.md)。

阶段
阶段一：基础设施与共享库

阶段二：核心数据流服务

阶段三：核心业务服务与调度算法

阶段四：插件系统与前端外壳

阶段五：插件生态与性能优化

阶段六：测试完善、部署与交付
