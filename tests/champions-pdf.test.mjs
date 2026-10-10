import test from 'node:test';
import assert from 'node:assert/strict';
import {pagePlacement} from '../dist/assets/champions-pdf.mjs';
test('entire champions report fits one landscape page with safe margins for all report heights',()=>{
 for(const [w,h] of [[1180,800],[1180,1500],[390,2400]]){
  const box=pagePlacement(w,h);
  assert.ok(box.x>=8-0.001&&box.y>=8-0.001);
  assert.ok(box.x+box.width<=412.001&&box.y+box.height<=289.001);
  assert.ok(Math.abs(box.width/box.height-w/h)<0.001);
 }
});
