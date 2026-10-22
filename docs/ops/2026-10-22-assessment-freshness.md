# 新电话事实与旧职位评估的接续

## 主流程观察与调整

沿用上轮 Pinecrest/Quinn 电话记录。候选人列表已能识别旧评估过期，但提示排在旧判断之后；打开 Read supporting evidence 后提示消失，详情直接展示 CAD 230,000、四周通知期等旧条件，也没有显示评估时间。需要阅读证据的用户反而失去了时效上下文。

现在列表与评估详情均显示真实 assessed_at；旧资料提示置于判断之前，并提供 Review latest evidence。该入口复用现有助理，带上当前职位、人选及可编辑委托，用户发送后才执行，不自动扣费或改写结论。没有增加自动重评、固定业务流程、案例判断规则或新的状态实体。既有版本和证据签名仍由角色评估 owner 管理。

## 本地真实链路

本机 Chrome Computer Use、真实模型/worker、隔离 PostgreSQL `hirelix_workspace_qa_local_20261022`，虚构人选资料。

1. 打开 Quinn 的旧评估详情，确认缺少时间和过期提示；修复后显示原评估时间 20:30、新资料提示及续办入口。
2. 从详情点击 Review latest evidence。新对话草稿自动带上 Pinecrest 职位和 Quinn 人选；没有自动发送。
3. 发送后，对话 `86baaa0c-cfe7-4718-96c5-38d60b6d53ae` 的任务 `cfc00b44-2ffd-4da6-acc3-b552c1d8ac7f` done，模型读取当前资料并保存评估，未进行额外资料修改或外发。
4. 真实 `roleDetails` 服务回读：Quinn 关系 v3、assessment_stale=false；评估引用 person v2、role v1、新电话记录 `3eeb9268-5d1d-4d65-a150-4369e7fe6c85` v1，并有当前证据签名。旧关系 v2 的完整 assessment 与上轮只读证据一致，保留历史。
5. 页面重新打开显示 21:10 的新评估时间，采用 CAD 225,000、六周通知期和“历史四人、当前两人”的区别；过期提示消退。候选人、职位和两份推荐稿版本未改，分享许可 unknown。

模型保持 worth_discussing，并解释六周通知期的风险。这是本次模型判断观察，不作为必须保持该结论的工程验收条件。模型仍有“named direct reports”等来源未提供的修饰，不将完整回答质量标成通过，也未据此增加个案规则。

## 检查及边界

TypeScript、lint、git diff --check 通过；全量单测 506 项，491 通过、15 门控跳过、0 失败。本轮为界面时效提示和既有助理入口衔接，使用真实运行/数据回读验证，没有另写复刻文案的单测。真实 Chrome 初次热更新观察超时一次，原标签后续恢复，没有重启服务或数据库。

截图 `tmp/stale-assessment-context.png`、`tmp/current-assessment-context.png` 和服务回读 `tmp/assessment-refresh-readback.json`，不提交 tmp。未推送、部署、付款或外发，未修改既有提醒或 Owen 待定选择。本地链路不代表生产或续费效果。
