import assert from 'node:assert/strict';
import {test} from 'node:test';
import {alertPlan} from '../deploy/hirelix-alert.mjs';
test('operational alerts require one explicit recipient and stable per-hour idempotency',()=>{
 const env={HIRELIX_ALERT_TO:'operator@example.test',SEARCH_NOTIFICATIONS_FROM_EMAIL:'Hirelix <ops@example.test>'};
 const now=Date.UTC(2030,0,1,8,10);
 const first=alertPlan('hirelix-health.service',env,now);
 assert.deepEqual(alertPlan('hirelix-health.service',env,now+60000),first);
 assert.notEqual(alertPlan('hirelix-health.service',env,now+3600000).key,first.key);
 assert.notEqual(alertPlan('hirelix-backup.service',env,now).key,first.key);
 assert.equal(first.body.to.length,1);
 assert.match(first.body.text,/no customer data/);
 assert.throws(()=>alertPlan('other.service',env,now));
 assert.throws(()=>alertPlan('hirelix-health.service',{},now));
 assert.throws(()=>alertPlan('hirelix-health.service',{...env,HIRELIX_ALERT_TO:'one@example.test,two@example.test'},now));
 assert.throws(()=>alertPlan('hirelix-health.service',{...env,SEARCH_NOTIFICATIONS_FROM_EMAIL:'x\nBcc: x'},now));
});
