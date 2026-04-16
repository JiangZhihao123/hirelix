/**
 * 测试数据源完整流程
 * 
 * 测试 JD: Senior Frontend Engineer
 * 流程: Serper → Proxycurl → Hunter.io
 */

const SERPER_API_KEY = '7c75b496bdecf7b09be1e9d8654ea8c1b08b05de';
const PROXYCURL_API_KEY = 'edd8f26a949b4cc6bdef8af8587ac454';
const HUNTER_API_KEY = '46678bf605f1f1033f158732a7b99a4bd5ca3e73';

// 测试 JD
const testJD = {
  title: 'Senior Frontend Engineer',
  skills: ['React', 'TypeScript', 'Node.js'],
  location: 'San Francisco',
  experience_years: 5
};

console.log('='.repeat(80));
console.log('测试数据源完整流程');
console.log('='.repeat(80));
console.log('\n测试 JD:', testJD);
console.log('\n');

// Step 1: Serper 搜索 LinkedIn URL
async function testSerper() {
  console.log('Step 1: Serper 搜索 LinkedIn URL');
  console.log('-'.repeat(80));
  
  const query = `site:linkedin.com/in ${testJD.title} ${testJD.skills.join(' ')} ${testJD.location}`;
  console.log('搜索查询:', query);
  
  try {
    const response = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: {
        'X-API-KEY': SERPER_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        q: query,
        num: 10
      })
    });
    
    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }
    
    const data = await response.json();
    const linkedinUrls = data.organic
      ?.filter(result => result.link?.includes('linkedin.com/in/'))
      .map(result => result.link)
      .slice(0, 5) || [];
    
    console.log(`\n找到 ${linkedinUrls.length} 个 LinkedIn URL:`);
    linkedinUrls.forEach((url, i) => {
      console.log(`${i + 1}. ${url}`);
    });
    
    return linkedinUrls;
  } catch (error) {
    console.error('Serper 错误:', error.message);
    return [];
  }
}

// Step 2: Proxycurl 获取详细资料
async function testProxycurl(linkedinUrl) {
  console.log('\n\nStep 2: Proxycurl 获取详细资料');
  console.log('-'.repeat(80));
  console.log('LinkedIn URL:', linkedinUrl);
  
  try {
    const response = await fetch(
      `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(linkedinUrl)}`,
      {
        headers: {
          'Authorization': `Bearer ${PROXYCURL_API_KEY}`
        }
      }
    );
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('API 响应:', response.status, errorText);
      throw new Error(`Proxycurl API error: ${response.status}`);
    }
    
    const profile = await response.json();
    
    console.log('\n候选人资料:');
    console.log('  姓名:', profile.full_name || 'N/A');
    console.log('  职位:', profile.occupation || 'N/A');
    console.log('  地点:', profile.city, profile.state, profile.country);
    console.log('  简介:', (profile.summary || 'N/A').substring(0, 200) + '...');
    
    if (profile.experiences && profile.experiences.length > 0) {
      console.log('\n  工作经历:');
      profile.experiences.slice(0, 3).forEach((exp, i) => {
        console.log(`    ${i + 1}. ${exp.title} @ ${exp.company}`);
        console.log(`       ${exp.starts_at?.year || '?'} - ${exp.ends_at?.year || 'Present'}`);
      });
    }
    
    if (profile.education && profile.education.length > 0) {
      console.log('\n  教育背景:');
      profile.education.slice(0, 2).forEach((edu, i) => {
        console.log(`    ${i + 1}. ${edu.degree_name || 'N/A'} @ ${edu.school}`);
        console.log(`       ${edu.field_of_study || 'N/A'}`);
      });
    }
    
    if (profile.skills && profile.skills.length > 0) {
      console.log('\n  技能:', profile.skills.slice(0, 10).join(', '));
    }
    
    return profile;
  } catch (error) {
    console.error('Proxycurl 错误:', error.message);
    return null;
  }
}

// Step 3: Hunter.io 查找邮箱
async function testHunter(profile) {
  console.log('\n\nStep 3: Hunter.io 查找邮箱');
  console.log('-'.repeat(80));
  
  if (!profile || !profile.experiences || profile.experiences.length === 0) {
    console.log('无法查找邮箱：缺少公司信息');
    return null;
  }
  
  const firstName = profile.first_name;
  const lastName = profile.last_name;
  const currentCompany = profile.experiences[0]?.company;
  
  console.log('查找邮箱:');
  console.log('  姓名:', firstName, lastName);
  console.log('  公司:', currentCompany);
  
  try {
    // 尝试从公司名获取域名
    const domainResponse = await fetch(
      `https://api.hunter.io/v2/domain-search?company=${encodeURIComponent(currentCompany)}&api_key=${HUNTER_API_KEY}&limit=1`
    );
    
    if (!domainResponse.ok) {
      throw new Error(`Hunter domain search error: ${domainResponse.status}`);
    }
    
    const domainData = await domainResponse.json();
    const domain = domainData.data?.domain;
    
    if (!domain) {
      console.log('  未找到公司域名');
      return null;
    }
    
    console.log('  公司域名:', domain);
    
    // 查找邮箱
    const emailResponse = await fetch(
      `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${firstName}&last_name=${lastName}&api_key=${HUNTER_API_KEY}`
    );
    
    if (!emailResponse.ok) {
      throw new Error(`Hunter email finder error: ${emailResponse.status}`);
    }
    
    const emailData = await emailResponse.json();
    const email = emailData.data?.email;
    const score = emailData.data?.score;
    
    console.log('\n  找到邮箱:', email || '未找到');
    if (score !== undefined) {
      console.log('  置信度:', score + '%');
    }
    
    return email;
  } catch (error) {
    console.error('Hunter 错误:', error.message);
    return null;
  }
}

// 主测试流程
async function runTest() {
  try {
    // Step 1: Serper
    const linkedinUrls = await testSerper();
    
    if (linkedinUrls.length === 0) {
      console.log('\n未找到 LinkedIn URL，测试结束');
      return;
    }
    
    // Step 2 & 3: 测试第一个候选人
    const firstUrl = linkedinUrls[0];
    const profile = await testProxycurl(firstUrl);
    
    if (profile) {
      await testHunter(profile);
    }
    
    // 总结
    console.log('\n\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));
    console.log('✅ Serper: 找到', linkedinUrls.length, '个 LinkedIn URL');
    console.log(profile ? '✅ Proxycurl: 成功获取详细资料' : '❌ Proxycurl: 失败');
    console.log('✅ Hunter.io: 尝试查找邮箱');
    console.log('\n数据质量评估:');
    console.log('  - LinkedIn 数据: ' + (profile ? '详细完整' : '失败'));
    console.log('  - 邮箱数据: 取决于 Hunter.io 结果');
    console.log('\n');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
runTest();
