# Bright Data 普通候选人链接小批验证

日期：2026-10-19（Asia/Shanghai）。结论：现有 LinkedIn people profiles Scraper API 能返回部分公开资料，但本轮没有返回任何工作经历，暂不满足可靠的 JD 匹配资料要求。未接入产品，未写候选人库。

## 范围与真实请求

用户明确授权小批真实读取与计费验证。选取 6 位普通职业人士：客户成功、产品、软件工程各 2 人。输入链接来自公开搜索结果及公开个人网站；不是随机抽样，存在搜索可发现性偏差。没有使用名人样本，也没有声称这些人正在求职。

- Scraper：`gd_l1viktl72bvl7bjuj0`，不是 Dataset Filter 历史数据筛选接口。
- 单次 `POST /datasets/v3/trigger?dataset_id=...&include_errors=true`，请求体为 6 个 `{url}`；没有指定输出字段过滤。
- Snapshot：`sd_mvfa0ozurotn8rnqq`。
- 提交时间：21:14:43；供应商 `collection_duration=89112` 毫秒，约 89 秒。取得并保存结果距提交约 98 秒，包含客户端轮询间隔，不是单人延迟。
- `ready`，`records=6`，`errors=0`。只提交一次，未重抓、未扩量。
- 分析直接读取原始 JSON，未经过产品适配器、LLM 补全或摘要加工。

## 字段完整度

下表统计本轮响应中的字段存在情况，不代表相对本人完整 LinkedIn 档案的召回率。缺字段不等于本人没有相关经历。

| 字段 | 有资料人数 / 6 | 说明 |
| --- | --- | --- |
| 姓名、地区、国家、采集时间 | 6 | 地区粒度不同，部分只有国家 |
| 当前公司 | 5 | 对象内有公司名 |
| 当前职位 `position` | 0 | 全部为 null |
| About 简介 | 6 | 5 份以省略号结束，只有约 78–89 个字符；另一份 90 字符 |
| 工作经历 `experience` | 0 | 全部为 null |
| 工作任职时间与职责描述 | 0 | 没有工作经历可供提取 |
| 具名教育经历 | 3 | 另有 4 个教育条目只有年月、缺院校名 |
| 独立 `skills` 字段 | 0 | 所有响应均未提供这个字段；不表示其他文本没有技能词 |
| 证书 | 4 | 部分提供证书名称、机构和时间 |
| 推荐语 | 3 | 存在完整推荐语，但不替代本人的工作职责记录 |
| 项目 | 1 | 软件工程样本有 2 项及具体技术描述 |

### 逐人结果

| 样本 | 输入链接 | 当前公司 | 具名教育条目 | 工作经历条目 | 其他有用内容 |
| --- | --- | --- | --- | --- | --- |
| CS1 Matt Vadala | https://www.linkedin.com/in/mattvadala | Gain Grow Retain | 0 | 0 | 10 项证书、2 条推荐语 |
| CS2 Kat H. | https://www.linkedin.com/in/kat-hern | Certinia | 1 | 0 | 5 项证书、2 条推荐语 |
| PM1 Adam Feldman | https://www.linkedin.com/in/adamrfeldman | Flooid | 0 | 0 | 简短且截断的简介 |
| PM2 Allison Broughton | https://www.linkedin.com/in/allison-broughton-906273107 | Transflo | 1 | 0 | 1 项证书 |
| SE1 Sahil K. | https://www.linkedin.com/in/sahil-k-98148a106 | 未返回 | 0 | 0 | 6 项证书、2 个项目，项目有技术细节 |
| SE2 Kyle Luke | https://www.linkedin.com/in/kylewluke | Roster-5 | 1 | 0 | 2 条推荐语 |

6 个返回 URL 的 `/in/` 路径与输入一致（忽略大小写、地区子域与尾斜杠），姓名与发现来源一致。返回域名分别包含 uk/nl/pt/mx/it/cl，不能用域名判断候选人所在国家。Kat 的返回地区为 United Kingdom，而搜索索引展示 Austin, Texas；现有证据无法确认哪一项更新，必须保留冲突，不能认定所有样本当前均在美国。

尝试直接通过网页检索表面读取这 6 个 LinkedIn 页面，返回 999/429，未绕过登录或访问控制。因此没有建立与登录后完整页面逐字段对照的基准；API 的本轮采集时间不证明所有职业信息都在本轮更新。

## 费用证据

`GET /customer/balance` 使用现有凭据成功。

| 观察 | 时间（北京时间） | balance | pending_costs |
| --- | --- | --- | --- |
| 提交前 | 21:14:43 | $7.03 | $0 |
| 首次完成后查询 | 约 21:16 | $7.03 | $0 |
| 延迟更新后 | 21:17:25 | $7.02 | $0.01 |

本轮实测账号余额减少 **$0.01**，待计费金额显示 **$0.01**；这两项不能相加当作 $0.02。接口结果目前仅显示到美分，不是逐 snapshot 发票，无法排除无关账号活动或舍入影响。公开按量价 `$1.50/1000` 成功记录对应本轮 **$0.009 估算**；不能用标价计算替代实际账单，也不能因刚完成时余额未变而宣称免费。

现有 Marketplace snapshot metadata 端点查询该 Scraper snapshot 返回 404；它不能作为此任务的费用证据。尝试通过 Chrome 查看控制台明细，当前已登录的 Google 身份返回 `login_not_registered=1`，没有新建账号、切换猜测其他身份或接受注册协议，故未取得更细的任务账单。

## 判断与下一步

本轮只有“供应商交付成功”，没有“履历读取充分”。数据不足在原始响应中已经存在，不是 Hirelix 建档或解析环节丢失。采集器为何没有返回经历仍未得到供应商解释，不能归因为单个候选人隐私设置或本机网络。

暂不把当前结果包装为“完整 LinkedIn 读取”tool。若后续验证改善，应至少分别返回身份与链接、原始内容、来源时间、缺失字段、明确的 partial 状态及成本证据，并由 Agent 结合实际资料判断是否足以用于特定 JD。

下一步先核对现有采集器的字段覆盖/访问范围或向供应商提供本次 snapshot 核查；不要先增加 LLM 推断或用更多付费样本掩盖共同缺失的字段。

## 可复现与证据位置

脚本：`scripts/integration/probe-linkedin-profiles.mjs`，支持 `start`、`collect`、`billing`、`analyze`。`start` 最多接受 10 个去重 URL，先写提交状态再发送一次 POST；检测到旧状态时禁止再次提交，避免超时后重复收费。`analyze` 只分析已保存原始响应，不联网。

本轮私有原始证据目录：`/Users/noah/projects/hirelix-local-archive/2026-10-19/bright-linkedin-probe/`。包含 `inputs.json` 和 `run/` 下的 `state.json`、`trigger-response.json`、`progress.json`、`raw-profiles.json`、`quality.json`、`balance-before.json`、`balance-after.json`。原始个人资料及账号余额不提交 Git，凭据未写入证据文件。

检查：`node --check scripts/integration/probe-linkedin-profiles.mjs` 与该脚本 ESLint 检查；真实服务回执如上。没有修改产品 runtime、工具列表、候选人数据或部署状态。

官方参考：

- https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests
- https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress
- https://docs.brightdata.com/products/scrapers/scrapers-library/faqs
- https://brightdata.com/pricing/web-scraper
