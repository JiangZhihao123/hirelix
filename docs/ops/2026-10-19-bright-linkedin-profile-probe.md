# Bright Data 普通候选人链接小批验证

日期：2026-10-19（Asia/Shanghai）。结论：现有 LinkedIn people profiles Scraper API 能返回部分公开资料，但本轮没有返回任何工作经历，暂不满足可靠的 JD 匹配资料要求。后续只读核查找到官方专项说明：职位、工作经历、教育受到 LinkedIn 公开访问限制，主要依赖历史缓存，并非遗漏请求参数。未接入产品，未写候选人库。

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

本轮只有“供应商交付成功”，没有“履历读取充分”。数据不足在原始响应中已经存在，不是 Hirelix 建档或解析环节丢失。后续发现官方已公开说明这一限制，具体证据见下一节；无需继续用同类付费请求重复验证已知边界。

暂不把当前结果包装为“完整 LinkedIn 读取”tool。若后续验证改善，应至少分别返回身份与链接、原始内容、来源时间、缺失字段、明确的 partial 状态及成本证据，并由 Agent 结合实际资料判断是否足以用于特定 JD。

若需要追查这 6 个具体人选为何没有历史缓存回填，需要供应商按 snapshot 检查缓存匹配及字段处理日志；客户端结果没有 cache-hit 或逐字段最后更新时间，不能进一步断定是“从未缓存”还是“缓存匹配失败”。不要先增加 LLM 推断或用更多付费样本掩盖共同缺失的字段。

## 后续原因排查：官方说明与接口核对

本节为同日只读排查，没有新增 Bright Data 抓取请求、任务或费用；未发送支持消息，未修改账号设置或产品。

### 接口用法

官方 `https://docs.brightdata.com/scrapers/gd_l1viktl72bvl7bjuj0.json` 的 `collect_by_url.input_schema` 只有一个必填字段 `url`。本轮使用正确的采集器 ID、Bearer 鉴权与 6 个 URL；没有传 `custom_output_fields` 截断字段。官方异步请求文档明确接受裸数组，请求不必包成 `{input: [...]}`。`/trigger` 和 `/scrape` 是同类请求的异步/同步交付方式，文档没有说明换成同步能恢复字段。

该机器可读 schema 直接给 `position`、`experience`、`education` 加了“2025-11-13 起受 LinkedIn 限制，通常为空”的说明。`about` 的说明也明确指出，只显示带省略号的公开简介时，采集器返回的就是该截断版本。这与本轮 5/6 简介截断一致。

### 账号权限

现有凭据已成功创建任务、取得 6 条结果并产生待计费记录，证明账号有该采集器的执行与下载能力。本轮不是 401/403/余额不足错误。官方输入 schema 没有“开启工作经历”“附加登录 Cookie”等选项，也未找到按账号套餐解锁这三个字段的说明。

因此没有证据表明当前问题由我们的 token scope 或少开一个字段权限造成。不过没有审计供应商内部权限系统，也没有向供应商确认任何未公开定制合同，不能声称排除了所有隐藏的账号差异。

### 上游公开访问限制与 Bright Data 的缓存模式

Bright Data 官方专项页 [LinkedIn data policy change](https://docs.brightdata.com/products/scrapers/linkedin/data-policy-change) 说明：

- 它在 2025-11-13 观察到 LinkedIn 把职位、工作经历、教育详细资料置于登录后访问范围；这三个字段的填充率由此前约 50–64% 降到约 2%。这些时间与比例是 Bright Data 的监测口径，非本轮六人测试统计，也非 LinkedIn 官方变更公告。
- 它仅采集公开资料，因此三个受影响字段主要返回历史缓存，最后刷新时间可能停留在 2025-11-13 或更早。
- 影响同时覆盖 Profiles Dataset、Enrich Employee Dataset 与实时 Scrapers；该说明明确表示，切换这几类 Bright Data 产品不能解决三个字段的填充率问题。
- 其他公开字段仍可刷新。因此“当前采集时间 + 姓名/地区/公司有值 + 工作经历为空”可以同时出现；返回教育记录也可能只是历史缓存，不证明教育信息实时。

官方把它描述为广泛影响公开资料供应商的限制；我们没有横测其他供应商，不能把这句话作为所有其他服务实际能力的独立验证。

### 可下的结论

本次 0/6 工作经历与官方已知限制高度一致，已足以判断当前标准采集器不能作为稳定获取普通候选人完整履历的依赖。没有必要通过更换同步端点、补一个未文档化参数、升级套餐或重复付费重抓来猜测解决方案。

未来选择其他方案时，必须区分当前公开数据、历史缓存、正式授权的招聘系统导入与用户提供的资料；不能因为返回了非空数组就认定履历完整且最新。

证据副本保存在上述私有证据目录的 `diagnosis/` 下：官方专项说明、简介、请求规范、机器可读 schema 与来源/获取时间记录。

## 可复现与证据位置

脚本：`scripts/integration/probe-linkedin-profiles.mjs`，支持 `start`、`collect`、`billing`、`analyze`。`start` 最多接受 10 个去重 URL，先写提交状态再发送一次 POST；检测到旧状态时禁止再次提交，避免超时后重复收费。`analyze` 只分析已保存原始响应，不联网。

本轮私有原始证据目录：`/Users/noah/projects/hirelix-local-archive/2026-10-19/bright-linkedin-probe/`。包含 `inputs.json` 和 `run/` 下的 `state.json`、`trigger-response.json`、`progress.json`、`raw-profiles.json`、`quality.json`、`balance-before.json`、`balance-after.json`。原始个人资料及账号余额不提交 Git，凭据未写入证据文件。

检查：`node --check scripts/integration/probe-linkedin-profiles.mjs` 与该脚本 ESLint 检查；真实服务回执如上。没有修改产品 runtime、工具列表、候选人数据或部署状态。

官方参考：

- https://docs.brightdata.com/api-reference/rest-api/scraper/asynchronous-requests
- https://docs.brightdata.com/api-reference/scrapers/management-apis/monitor-progress
- https://docs.brightdata.com/products/scrapers/scrapers-library/faqs
- https://brightdata.com/pricing/web-scraper
- https://docs.brightdata.com/products/scrapers/linkedin/data-policy-change
- https://docs.brightdata.com/products/scrapers/linkedin/introduction
- https://docs.brightdata.com/products/scrapers/linkedin/send-first-request
- https://docs.brightdata.com/scrapers/gd_l1viktl72bvl7bjuj0.json
