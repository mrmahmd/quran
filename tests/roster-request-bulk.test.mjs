import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRosterRequests} from '../dist/assets/roster-request-bulk.mjs';
const row = (id, status = 'pending') => ({id, status, student_name:id, note:`note-${id}`});
test('only distinct pending requests are reviewed, with their individual notes', async () => {
  const calls=[];
  const result=await reviewRosterRequests([row('a'),row('b','approved'),row('a'),row('c')],true,async(id,approve,note)=>{
    calls.push([id,approve,note]);return {id,status:'approved'};
  });
  assert.deepEqual(calls,[['a',true,'note-a'],['c',true,'note-c']]);
  assert.deepEqual(result.succeeded,['a','c']);assert.equal(result.failed.length,0);
});
test('rejection uses the same checked decision path',async()=>{
  const result=await reviewRosterRequests([row('a')],false,async(id,approve)=>{
    assert.equal(approve,false);return {id,status:'rejected'};
  });
  assert.deepEqual(result.succeeded,['a']);
});
test('one stale or conflicting request does not prevent the other decisions',async()=>{
  const result=await reviewRosterRequests([row('a'),row('b'),row('c')],true,async id=>{
    if(id==='b')throw {code:'40001',message:'already reviewed'};return {id,status:'approved'};
  });
  assert.deepEqual(result.succeeded,['a','c']);assert.equal(result.failed[0].id,'b');assert.equal(result.uncertain,false);
});
test('connection failures and invalid save receipts stop without retrying or claiming success',async()=>{
  for(const failure of [()=>{throw new Error('network')},()=>({id:'wrong',status:'approved'}),()=>{throw {code:'42501'}}]){
    const called=[];
    const result=await reviewRosterRequests([row('a'),row('b'),row('c')],true,async id=>{
      called.push(id);if(id==='b')return failure();return {id,status:'approved'};
    });
    assert.deepEqual(called,['a','b']);assert.deepEqual(result.succeeded,['a']);assert.deepEqual(result.remaining,['c']);assert.equal(result.uncertain,true);
  }
});
