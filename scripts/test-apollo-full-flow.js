/**
 * 测试完整数据流程：Serper + Apollo.io
 * 
 * 流程：
 * 1. Serper 搜索 LinkedIn URL
 * 2. Apollo.io 获取完整资料 + 邮箱
 * 3. 展示结果
 */

const SERPER_API_KEY = '7c75b496bdecf7b09be1e9d8654ea8c1b08b05de';
const APOLLO_API_KEY = 'IUzaLUa83xKOcqoE8unvTw';
const HUNTER_API_KEY = '46678bf605f1f1033f158732a7b99a4bd5ca3e73';

// 测试 JD
const testJD = {
  title: 'Senior Full Stack Engineer',
  skills: ['React', 'TypeScript', 'Node.js', 'PostgreSQL'],
  location: 'San Francisco',
  experience_years: 5
};

console.log('='.repeat(80));
console.log('测试完整数据流程：Serper + Apollo.io');
console.log('='.repeat(80));
console.log('\n测试 JD:', testJD);
console.log('\n');

// Step 1: Serper 搜索 LinkedIn URL
async function searchLinkedInUrls() {
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
        num: 5
      })
    });
    
    if (!response.ok) {
      throw new Error(`Serper API error: ${response.status}`);
    }
    
    const data = await response.json();
    const linkedinUrls = data.organic
      ?.filter(result => result.link?.includes('linkedin.com/in/'))
      .map(result => result.link)
      .slice(0, 3) || [];
    
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

// Step 2: Apollo.io 获取完整资料
async function enrichWithApollo(linkedinUrl) {
  console.log('\n\nStep 2: Apollo.io 获取完整资料');
  console.log('-'.repeat(80));
  console.log('LinkedIn URL:', linkedinUrl);
  
  try {
    const response = await fetch('https://api.apollo.io/v1/people/match', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Api-Key': APOLLO_API_KEY
      },
      body: JSON.stringify({
        linkedin_url: linkedinUrl
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log('API 响应:', response.status, errorText);
      throw new Error(`Apollo API error: ${response.status}`);
    }
    
    const data = await response.json();
    const person = data.person;
    
    if (!person) {
      console.log('未找到候选人数据');
      return null;
    }
    
    console.log('\n候选人资料:');
    console.log('  姓名:', person.first_name, person.last_name);
    console.log('  职位:', person.title || 'N/A');
    console.log('  公司:', person.organization?.name || 'N/A');
    console.log('  地点:', person.city, person.state, person.country);
    console.log('  邮箱:', person.email || 'N/A');
    
    if (person.employment_history && person.employment_history.length > 0) {
      console.log('\n  工作经历:');
      person.employment_history.slice(0, 3).forEach((exp, i) => {
        console.log(`    ${i + 1}. ${exp.title} @ ${exp.organization_name}`);
        console.log(`       ${exp.start_date || '?'} - ${exp.end_date || 'Present'}`);
      });
    }
    
    if (person.education && person.education.length > 0) {
      console.log('\n  教育背景:');
      person.education.slice(0, 2).forEach((edu, i) => {
        console.log(`    ${i + 1}. ${edu.degree} @ ${edu.school_name}`);
        console.log(`       ${edu.field_of_study || 'N/A'}`);
      });
    }
    
    return person;
  } catch (error) {
    console.error('Apollo 错误:', error.message);
    return null;
  }
}

// 主测试流程
async function runTest() {
  try {
    // Step 1: Serper 搜索
    const linkedinUrls = await searchLinkedInUrls();
    
    if (linkedinUrls.length === 0) {
      console.log('\n未找到 LinkedIn URL，测试结束');
      return;
    }
    
    // Step 2: Apollo 获取第一个候选人的资料
    const firstUrl = linkedinUrls[0];
    const person = await enrichWithApollo(firstUrl);
    
    // 总结
    console.log('\n\n' + '='.repeat(80));
    console.log('测试总结');
    console.log('='.repeat(80));
    console.log('✅ Serper: 找到', linkedinUrls.length, '个 LinkedIn URL');
    console.log(person ? '✅ Apollo.io: 成功获取完整资料' : '❌ Apollo.io: 失败');
    
    if (person) {
      console.log('\n数据质量评估:');
      console.log('  - 姓名: ' + (person.first_name && person.last_name ? '✅' : '❌'));
      console.log('  - 职位: ' + (person.title ? '✅' : '❌'));
      console.log('  - 公司: ' + (person.organization?.name ? '✅' : '❌'));
      console.log('  - 邮箱: ' + (person.email ? '✅' : '❌'));
      console.log('  - 工作经历: ' + (person.employment_history?.length > 0 ? '✅' : '❌'));
      console.log('  - 教育背景: ' + (person.education?.length > 0 ? '✅' : '❌'));
      
      console.log('\n✅ 数据方案可行！');
    } else {
      console.log('\n❌ 数据方案需要调整');
    }
    
    console.log('\n');
    
  } catch (error) {
    console.error('测试失败:', error);
  }
}

// 运行测试
runTest();
