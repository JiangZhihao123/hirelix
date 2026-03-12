/**
 * 测试免费方案：Serper + Apollo People Search + Hunter.io
 * 
 * 流程：
 * 1. Serper 搜索 LinkedIn URL
 * 2. Apollo People Search 获取基本资料（无邮箱）
 * 3. Hunter.io 查找邮箱
 */

const SERPER_API_KEY = '7c75b496bdecf7b09be1e9d8654ea8c1b08b05de';
const APOLLO_API_KEY = 'LR62oFanzQy1214hpcampA';
const HUNTER_API_KEY = '46678bf605f1f1033f158732a7b99a4bd5ca3e73';

const testJD = {
  title: 'Senior Full Stack Engineer',
  skills: ['React', 'TypeScript', 'Node.js'],
  location: 'San Francisco',
  experience_years: 5
};

console.log('='.repeat(80));
console.log('测试免费方案：Serper + Apollo People Search + Hunter.io');
console.log('='.repeat(80));
console.log('\n测试 JD:', testJD);
console.log('\n');

// Step 1: Serper 搜索
async function searchLinkedInUrls() {
  console.log('Step 1: Serper 搜索 LinkedIn URL');
  console.log('-'.repeat(80));
  
  const query = `site:linkedin.com/in ${testJD.title} ${testJD.skills.join(' ')} ${testJD.location}`;
  console.log('搜索查询:', query);
  
  const response = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ q: query, num: 15 })
  });
  
  const data = await response.json();
  const urls = data.organic
    ?.filter(r => r.link?.includes('linkedin.com/in/'))
    .map(r => r.link) || [];
  
  console.log(`\n找到 ${urls.length} 个 LinkedIn URL`);
  urls.forEach((url, i) => console.log(`${i + 1}. ${url}`));
  
  return urls;
}

// Step 2: Apollo People Search
async function searchWithApollo() {
  console.log('\n\nStep 2: Apollo People Search（免费）');
  console.log('-'.repeat(80));
  
  const response = await fetch('https://api.apollo.io/v1/mixed_people/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Api-Key': APOLLO_API_KEY
    },
    body: JSON.stringify({
      q_keywords: testJD.title,
      person_locations: [testJD.location],
      page: 1,
      per_page: 2
    })
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    console.log('API 响应:', response.status, errorText);
    return [];
  }
  
  const data = await response.json();
  const people = data.people || [];
  
  console.log(`\n找到 ${people.length} 个候选人`);
  people.forEach((p, i) => {
    console.log(`\n候选人 ${i + 1}:`);
    console.log('  姓名:', p.first_name, p.last_name);
    console.log('  职位:', p.title || 'N/A');
    console.log('  公司:', p.organization?.name || 'N/A');
    console.log('  地点:', p.city, p.state);
  });
  
  return people;
}

// Step 3: Hunter.io 查找邮箱
async function findEmailWithHunter(person) {
  console.log('\n\nStep 3: Hunter.io 查找邮箱');
  console.log('-'.repeat(80));
  
  const firstName = person.first_name;
  const lastName = person.last_name;
  const company = person.organization?.name;
  
  if (!company) {
    console.log('无公司信息，无法查找邮箱');
    return null;
  }
  
  console.log('查找:', firstName, lastName, '@', company);
  
  // 先获取公司域名
  const domainResponse = await fetch(
    `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(company)}&api_key=${HUNTER_API_KEY}&limit=1`
  );
  
  if (!domainResponse.ok) {
    console.log('Hunter domain search 失败:', domainResponse.status);
    return null;
  }
  
  const domainData = await domainResponse.json();
  const domain = domainData.data?.domain;
  
  if (!domain) {
    console.log('未找到公司域名');
    return null;
  }
  
  console.log('公司域名:', domain);
  
  // 查找邮箱
  const emailResponse = await fetch(
    `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${HUNTER_API_KEY}`
  );
  
  if (!emailResponse.ok) {
    console.log('Hunter email finder 失败:', emailResponse.status);
    return null;
  }
  
  const emailData = await emailResponse.json();
  const email = emailData.data?.email;
  const score = emailData.data?.score;
  
  console.log('\n邮箱:', email || '未找到');
  if (score !== undefined) {
    console.log('置信度:', score + '%');
  }
  
  return email;
}

// 主流程
async function runTest() {
  try {
    // Step 1
    const urls = await searchLinkedInUrls();
    
    // Step 2
    const people = await searchWithApollo();
    
    if (people.length === 0) {
      console.log('\n未找到候选人');
      return;
    }
    
    // Step 3
    const firstPerson = people[0];
    const email = await findEmailWithHunter(firstPerson);
    
    // 总结
    console.log('\n\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));
    console.log('✅ Serper: 找到', urls.length, '个 LinkedIn URL');
    console.log(people.length > 0 ? '✅ Apollo People Search: 成功' : '❌ Apollo: 失败');
    console.log(email ? '✅ Hunter.io: 找到邮箱' : '⚠️  Hunter.io: 未找到邮箱');
    
    console.log('\n数据质量:');
    console.log('  - 基本信息: ✅');
    console.log('  - 邮箱: ' + (email ? '✅' : '⚠️'));
    
    console.log('\n' + (email ? '✅ 免费方案可行！' : '⚠️  免费方案部分可行（邮箱可能缺失）'));
    console.log('\n成本: 几乎免费（M1-M6: ~$5）');
    console.log('\n');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

runTest();
