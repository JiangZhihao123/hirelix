# 页面图片生成记录

生成日期：2026-09-24。方式：Codex 内置 `image_gen`，未使用 CLI/API fallback。最终图片共 6 张，PNG，均为 1586 × 992 像素。以下记录最终采用版本的提示词；用到的参考图只用于维持布局、颜色与字体风格。

图中文字为虚构业务情境的视觉演示，不可视为真实候选人资料或产品运行证据。具体字段、逻辑和文案以 `product-spec.md` 为准。已弃用的 Recruiting agent / Talent memory 版本未收录。

## 01 · My assistant

文件：`images/01-assistant-home.png`。视觉参考：`images/02-candidates.png`。

```text
Use case ui-mockup. NEW Hirelix home page, a PERSONAL PRIVATE AI ASSISTANT FOR PROFESSIONAL HEADHUNTERS. Use the reference solely for matching brand, white/pale-blue/navy/cobalt palette, typography and sidebar proportions. Flat 16:10 landscape screenshot. Sidebar exactly My assistant / Candidates / Roles / Client updates, My assistant selected. Eyebrow 'BUILT FOR HEADHUNTERS'. Heading exactly 'Your private AI assistant'. Subtitle 'Your candidates, assignments and client conversations, in one place.' Three action cards 'Find someone I know', 'Review a role', 'Prepare an update'. Dominant main chat: user asks 'Who should I revisit for Northstar’s VP Product role?' Answer shows ONE candidate Priya Desai with role exactly 'Product Leader · Ledgerly', reason exactly 'Your call note describes leading a product team of 18 and B2B product experience.' Source label 'Call note · 12 Sep 2026'. Second short paragraph exactly 'Confirm permission to share and compensation expectations before preparing a client introduction.' Right column 'Your work at a glance', candidates Priya Desai / Product Leader · Ledgerly and Daniel Kim / Product Manager · Finovo. Active role VP Product / Northstar. Small context card 'Client decision needed: compensation range'. Bottom input 'Ask about a candidate, role or client…' with context chip 'VP Product · Northstar'. Never use recruiting agent, talent memory, memory, ATS, pipeline. No stale 2023/2024 dates, no other candidate employers, no invented readiness. Footer 'Product concept · Fictional sample data'. Crisp natural English and calm professional UI.
```

## 02 · Candidates

文件：`images/02-candidates.png`。视觉参考：同系列前一版私人助理页面，仅参考设计系统；最终首页已更新以统一人名与经历。

```text
Use case: ui-mockup. NEW Hirelix page using attached image ONLY as brand/layout reference. High-fidelity flat 16:10 landscape desktop SaaS screenshot, white/light-blue/navy/cobalt, precise English typography. Sidebar must read exactly 'My assistant', 'Candidates', 'Roles', 'Client updates'; active Candidates. Main title exactly 'Your candidates'. Subtitle 'Keep the people, conversations and context that matter.' Top actions 'Import CVs', 'Add a candidate'; search 'Search names, companies, expertise or notes'. Left section is list of four fictional people with name, role, location, small skill tags and dated 'Last conversation'. Select Priya Desai, product leader in San Francisco. Right detail pane heading 'Priya Desai' with tabs 'Overview', 'Conversations', 'Related roles'. Show sections 'My notes', 'Profile sources', 'What to confirm'. Concise note exactly '12 Sep 2026 · Call note: Led a product team of 18. Interested in learning about the role; sharing permission not yet confirmed.' Separate profile source card 'CV uploaded · 10 Sep 2026'. What to confirm: 'Permission to share with Northstar', 'Compensation expectations'. Bottom button 'Ask my assistant'. No global candidate score. No statuses implying automatically verified facts. NEVER use 'memory', 'talent memory', 'recruiting agent', 'recruiting intelligence' anywhere. No photos, no browser/device frame. Small footer 'Product concept · Fictional sample data'. Professional, readable and understated.
```

## 03 · Role workspace

文件：`images/03-role-workspace.png`。视觉参考：`images/02-candidates.png`。

```text
Use case ui-mockup. NEW Hirelix 'Roles' page in the same exact design system as the reference: calm white/light-blue/navy/cobalt, sidebar, flat 16:10 landscape desktop screenshot. Sidebar labels 'My assistant', 'Candidates', 'Roles', 'Client updates'; Roles selected. Main title 'VP Product' with client 'Northstar' and small label 'Retained search'. Tabs 'Brief', 'Candidates', 'Activity', 'Client updates'; Brief selected. Primary header actions 'Add a note', 'Prepare client update'. Main column contains card 'What the client needs' with 3 short requirements: 'B2B product leadership', 'Experience scaling a team', 'San Francisco or hybrid'. Next card 'Where things stand' with 'Priya: sharing permission to confirm', 'Daniel: domain fit needs discussion', 'Client decision needed: compensation range'. Bottom activity timeline '21 Sep · Client call: team leadership is the priority', '22 Sep · Updated role brief', '24 Sep · Priya call note added'. Right column titled 'Work with your assistant' with conversational message 'What should I resolve before recommending Priya?' and concise answer 'Confirm permission to share, then clarify compensation and team scope.' Buttons 'Compare candidates', 'Draft recommendation'. Show clear source chips and timestamps. No kanban pipeline, fake success metrics, global fit score or auto-send. Never say 'memory', 'talent memory' or 'recruiting agent'. Keep text concise, professional and legible. Footer 'Product concept · Fictional sample data'.
```

## 04 · Candidate submission

文件：`images/04-candidate-submission.png`。视觉参考：`images/03-role-workspace.png`。

```text
Use case ui-mockup. New Hirelix 'Candidate submission' desktop screen. Same white, pale blue, navy and cobalt design as reference. 16:10 landscape flat screenshot. Navigation exactly: My assistant / Candidates / Roles / Client updates. Client updates selected. Heading 'Candidate submission' with 'Northstar · VP Product' and badge 'Draft · Not shared'. Center a clean document titled 'Priya Desai', subtitle 'Product Leader · Ledgerly · San Francisco'. Sections 'Why consider Priya', 'Relevant experience', 'Points to discuss'. Concise evidence: led product team of 18; B2B product experience. Missing facts: compensation and role scope to confirm. Cite 'CV · 10 Sep 2026' and 'Call note · 12 Sep 2026'. Right assistant revision panel with message 'Make this shorter and lead with team leadership.' A small reminder 'Permission to share with Northstar needs confirmation'. Header actions Save draft / Preview. No Send button. Never use the words memory, recruiting agent, talent memory, weekly brief. No invented confirmed interest. Footer 'Product concept · Fictional sample data'. All UI text natural English, sharp and readable, beautiful restrained B2B layout.
```

## 05 · Search update

文件：`images/05-search-update.png`。视觉参考：`images/04-candidate-submission.png`。

```text
Use case ui-mockup. NEW Hirelix page for a periodic client SEARCH PROGRESS UPDATE, not a candidate recommendation. Match reference sidebar and exact calm white/light-blue/navy/cobalt design. 16:10 landscape desktop flat screenshot. Sidebar 'My assistant', 'Candidates', 'Roles', 'Client updates'; Client updates active. Page title 'Search update'; subtitle 'Northstar · VP Product · 21–24 Sep 2026'. Tabs 'Candidate submissions', 'Search updates' with Search updates selected. Top actions 'Save draft', 'Preview'. Main document sections: 'Progress since our last update' with 'Role priorities clarified with the client' and 'Two candidate conversations reviewed'; 'Candidate submissions' with exact sentence 'No new candidates submitted in this period.'; 'Decision needed' with 'Please confirm the compensation range.'; 'Next steps' with 'Confirm Priya’s permission to share' and 'Discuss Daniel’s domain experience'. No invented market counts or activities outside this scenario. Right panel 'Update schedule' with 'Every Friday · 16:00 New York', small text 'Prepare a draft for my review'; another panel 'Ask my assistant' with 'Lead with the decision the client needs to make.' Clearly show draft badge; no Send or automatically-shared status. Footer 'Product concept · Fictional sample data'. Never use memory, recruiting agent, talent memory, weekly brief. Professional natural English text, fine typography, realistic document editing layout.
```

## 06 · Import review

文件：`images/06-import-review.png`。视觉参考：`images/02-candidates.png`。

```text
Use case ui-mockup. New Hirelix screen 'Review your import' in same white/light blue/navy/cobalt design and sidebar. 16:10 landscape flat desktop screenshot, English. Sidebar My assistant / Candidates / Roles / Client updates, Candidates selected. Header 'Review your import', subtitle 'Check the records before adding them to your candidates.' Top stepper 'Upload' completed, 'Review' active, 'Finish'. Small summary: '12 records · 9 new · 2 possible matches · 1 needs review'. Main preview table with columns 'Candidate', 'Source', 'Result', 'Action'. Rows Priya Desai, Marcus Tan, Elena Rossi, Daniel Kim, with statuses New, Possible match, Needs review; source tags CV or CSV; action selectors Add new / Merge / Skip. Right panel selected possible duplicate 'Priya Desai' compares 'Existing candidate' and 'Imported CV'; same email noted as match reason, headline difference highlighted without overwriting. Clear text 'Your notes and files will be kept.' Primary bottom action 'Confirm import', secondary 'Back'. Small error note 'One record has no name. Add it or skip this record.' No global quality score. Never say memory, talent memory, recruiting agent. Footer 'Product concept · Fictional sample data'. Natural readable English, careful grid and typography, credible professional software rather than marketing poster.
```
