import test from 'node:test';
import assert from 'node:assert/strict';
import {restoreAccount} from '../dist/assets/session-restore.mjs';
test('reload restores a verified teacher or administrator session',async()=>{
 for(const role of ['teacher','admin']) {
  const user={id:role};let shown;
  const client={auth:{getSession:async()=>({data:{session:{user}}}),getUser:async()=>({data:{user}})}};
  assert.equal(await restoreAccount(client,async u=>{shown=u}),true);assert.equal(shown,user);
 }
});
test('network or account lookup failures do not sign the user out',async()=>{
 let signedOut=false;
 const client={auth:{getSession:async()=>({data:{session:{}}}),getUser:async()=>({data:{user:{id:'teacher'}}}),signOut:async()=>{signedOut=true}}};
 await assert.rejects(restoreAccount(client,async()=>{throw new Error('network')}));
 assert.equal(signedOut,false);
});
test('no saved session leaves the login screen available',async()=>{
 assert.equal(await restoreAccount({auth:{getSession:async()=>({data:{session:null}})}},()=>assert.fail()),false);
});
