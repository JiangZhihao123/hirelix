# Hirelix 产品说明书交付包

日期：2026-09-25 ｜ 版本：1.4

定位：**专业猎头的私人 Agent**。对外表达为 “Your private AI assistant. Built for headhunters.”

六张页面示意图展示英文界面状态；v1.4 补充中文与英文的全界面切换及客户草稿语言选择。本包采用暖白与炭黑为主，深绿只用于少量操作和选中状态；采用紧凑列表、资料侧栏和纸面文稿布局。第 21 章给出配色、字体、间距与可访问性要求。

建议先打开 `index.html`，在浏览器中离线阅读；不需要启动服务器。点击页面图片可查看完整原图。也可阅读 ZIP 中的 `product-spec.pdf`。

## 文件说明

| 文件 | 用途 |
| --- | --- |
| `index.html` | 带目录、表格和图片的离线阅读版 |
| `product-spec.md` | 27 章完整中文说明，可继续编辑 |
| `product-spec.pdf` | PDF 阅读版，包含在最终 ZIP 中 |
| `images/01-assistant-home.png` | 私人助理首页 |
| `images/02-candidates.png` | 候选人列表与档案 |
| `images/03-role-workspace.png` | 围绕 JD 的职位工作页 |
| `images/04-candidate-submission.png` | 单人推荐状态示意；同一提交也支持多人 |
| `images/05-search-update.png` | 客户搜寻进展更新 |
| `images/06-import-review.png` | 候选人导入确认 |
| `image-prompts.md` | 六张最终图片的提示词和生成方式 |
| `manifest.sha256` | ZIP 中各文件的校验值 |

文档涵盖产品定位、目标用户、调研依据、命名规范、完整使用过程、信息结构、六页详细交互、需求优先级、Agent 行为、数据关系、长期检索、两个英文客户材料样例、输入与集成、私人数据与分享、周期草稿、响应式体验、当前实现差距、实施顺序、验收场景、指标及待决定事项。

所有页面图为内置 image_gen 生成的概念示意，人物、公司、数字及情境均为虚构。主栏目为 My assistant、Candidates、Roles、Submissions。Submissions 集中管理候选人推荐；Search update 从对应 Role 发起，汇报历史保留在职位内。

这份包是产品说明和设计资料，不是已上线功能清单。当前本地代码与目标范围的区别见第 22 章。具体业务规则以文字规格为准。引用材料及其证据边界见第 03 和第 27 章。

文件关系保持相对路径。移动或分享时请保留整个解压目录，尤其是 `images/`。
