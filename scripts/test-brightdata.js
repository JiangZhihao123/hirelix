const BRIGHTDATA_API_TOKEN = 'fde7d1e1-91d3-4f3c-baed-06a965a3f5f6';
const DATASET_ID = 'gd_l1viktl72bvl7bjuj0';

async function testBrightDataAPI() {
  console.log('Testing Bright Data LinkedIn Scraper API...\n');

  const testLinkedInURL = 'https://www.linkedin.com/in/williamhgates';
  console.log(`Testing with: ${testLinkedInURL}`);
  console.log(`Using Dataset ID: ${DATASET_ID}\n`);

  try {
    console.log('Step 1: Triggering new scraping job...');
    
    const triggerResponse = await fetch(
      `https://api.brightdata.com/datasets/v3/trigger?dataset_id=${DATASET_ID}&include_errors=true`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BRIGHTDATA_API_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify([
          { url: testLinkedInURL }
        ])
      }
    );

    if (!triggerResponse.ok) {
      const errorText = await triggerResponse.text();
      throw new Error(`Trigger failed: ${triggerResponse.status} - ${errorText}`);
    }

    const triggerData = await triggerResponse.json();
    console.log('Trigger response:', JSON.stringify(triggerData, null, 2));

    const snapshotId = triggerData.snapshot_id;
    console.log(`\nSnapshot ID: ${snapshotId}`);

    console.log('\nStep 2: Polling for results (max 2 minutes)...');
    
    let data;
    let attempts = 0;
    const maxAttempts = 4;
    
    while (attempts < maxAttempts) {
      attempts++;
      console.log(`Attempt ${attempts}/${maxAttempts}...`);
      
      await new Promise(resolve => setTimeout(resolve, 30000));
      
      const resultResponse = await fetch(
        `https://api.brightdata.com/datasets/v3/snapshot/${snapshotId}?format=json`,
        {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${BRIGHTDATA_API_TOKEN}`
          }
        }
      );

      if (!resultResponse.ok) {
        const errorText = await resultResponse.text();
        throw new Error(`Fetch failed: ${resultResponse.status} - ${errorText}`);
      }

      data = await resultResponse.json();
      
      if (data.status !== 'running') {
        console.log('\n✅ Scraping completed!');
        break;
      }
      
      console.log('Still running, waiting 30 more seconds...');
    }

    console.log('\n✅ Profile data retrieved successfully!\n');
    console.log('Full data:', JSON.stringify(data, null, 2));

    if (Array.isArray(data) && data.length > 0) {
      const profile = data[0];
      console.log('\n--- First Profile ---');
      console.log('Name:', profile.name);
      console.log('LinkedIn ID:', profile.linkedin_id);
      console.log('Location:', `${profile.city}, ${profile.country_code}`);
      console.log('Current Company:', profile.current_company);
      console.log('About:', profile.about?.substring(0, 100) + '...');
      console.log('Connections:', profile.connections);
      console.log('Followers:', profile.followers);
      console.log('\nTotal profiles:', data.length);
    }

    console.log('\n✅ Test successful!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error('Full error:', error);
  }
}

testBrightDataAPI();
