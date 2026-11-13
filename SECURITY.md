# 安全策略

## 支持的版本

0.x 期间只修最新发布的版本。

## 报告漏洞

**请不要在公开 Issue 里报告安全问题。** 请通过 GitHub 仓库的 **Security → Report a vulnerability**（私下漏洞报告）提交，写清：

- 受影响的版本和浏览器；
- 复现步骤或概念验证；
- 你判断的影响。

我们会在确认问题后修复，并在发布修复版本时注明致谢（如果你愿意）。本项目由志愿者维护，不承诺固定的响应时间。

Please do not report security issues in public issues. Use GitHub's private vulnerability reporting (**Security → Report a vulnerability**) on this repository instead; English is fine.

## 范围说明

本库只在同一浏览器、同一来源的标签页之间协调，不涉及网络通信和身份验证。localStorage 对同一来源的所有脚本可读可写，**本库的选主结果不是安全边界**：同源的恶意脚本可以伪造租约或记录。需要防止重复执行的敏感操作（扣款、下单等）请在服务端做幂等。
