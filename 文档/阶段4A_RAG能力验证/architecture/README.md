# 技术架构图

文件：[01_技术架构.drawio](01_技术架构.drawio)

结构：

1. 接入层：P03、P06、P10、P11；
2. 企业 BFF：身份、安全门禁、RAG Adapter、归一化、审计和密钥代理；
3. 企业控制平面：来源/知识版本、审核、评测/发布、审计回滚、环境隔离；
4. RAG 提供方：FastGPT/Dify/RAGFlow，仅负责文档处理、索引、检索和生成；
5. 模型与数据基础设施：Embedding、Reranker、LLM、索引、可观测性。

当前环境没有 draw.io Desktop CLI，所以本阶段交付 `.drawio` XML，并执行 XML 结构、ID、尺寸和重叠自动验证；未声称已完成像素级视觉检查。
