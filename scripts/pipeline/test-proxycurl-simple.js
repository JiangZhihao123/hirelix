/**
 * 简单测试 Proxycurl API Key
 */

const PROXYCURL_API_KEY = 'edd8f26a949b4cc6bdef8af8587ac454';

async function testProxycurlKey() {
  console.log('测试 Proxycurl API Key...\n');
  
  // 使用一个已知的 LinkedIn URL 测试
  const testUrl = 'https://www.linkedin.com/in/williamhgates';
  
  console.log('测试 URL:', testUrl);
  console.log('API Key:', PROXYCURL_API_KEY.substring(0, 10) + '...\n');
  
  // 尝试正确的 API 端点
  const apiUrl = `https://nubela.co/proxycurl/api/v2/linkedin?url=${encodeURIComponent(testUrl)}`;
  console.log('API 端点:', apiUrl, '\n');
  
  try {
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${PROXYCURL_API_KEY}`,
        'Accept': 'application/json'
      }
    });
    
    console.log('响应状态:', response.status);
    console.log('响应头:', Object.fromEntries(response.headers.entries()));
    
    const text = await response.text();
    console.log('\n响应内容:');
    console.log(text.substring(0, 500));
    
    if (response.ok) {
      console.log('\n✅ Proxycurl API Key 有效！');
      const data = JSON.parse(text);
      console.log('\n示例数据:');
      console.log('  姓名:', data.full_name);
      console.log('  职位:', data.occupation);
    } else {
      console.log('\n❌ Proxycurl API 调用失败');
      console.log('可能原因:');
      console.log('  1. API Key 无效或未激活');
      console.log('  2. 余额不足');
      console.log('  3. API 端点错误');
    }
    
  } catch (error) {
    console.error('错误:', error.message);
  }
}

testProxycurlKey();
