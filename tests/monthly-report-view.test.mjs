import test from 'node:test';
import assert from 'node:assert/strict';
import {monthlyAmountMarkup,buildMonthlyReadingTable} from '../dist/assets/monthly-report-view.mjs';
import {emptyMonthly,monthlyRangeText,setMonthlyAbsent} from '../dist/assets/monthly-model.mjs';

test('structured quantities preserve both endpoints and verse numbers without mutating saved data',()=>{
 const range={from_surah:58,from_ayah:6,to_surah:59,to_ayah:15},value={none:false,range,text:monthlyRangeText(range)},before=structuredClone(value);
 const html=monthlyAmountMarkup(value,'memorization');
 assert.match(html,/سورة المجادلة/);assert.match(html,/سورة الحشر/);assert.match(html,/٦/);assert.match(html,/١٥/);
 assert.equal((html.match(/monthly-amount-endpoint/g)||[]).length,2);assert.deepEqual(value,before);
});
test('free text and mismatched legacy ranges remain literal and escaped; absence, none and missing stay distinct',()=>{
 const range={from_surah:2,from_ayah:1,to_surah:2,to_ayah:20};
 const html=monthlyAmountMarkup({none:false,range,text:'مقدار قديم <script>خاص</script>'},'revision');
 assert.match(html,/مقدار قديم &lt;script&gt;خاص&lt;\/script&gt;/);assert.doesNotMatch(html,/monthly-amount-endpoint|<script>/);
 assert.match(monthlyAmountMarkup({none:true,text:''},'memorization'),/لا يوجد حفظ خلال الشهر/);
 assert.match(monthlyAmountMarkup({none:false,text:''},'revision'),/لم تُسجّل المراجعة بعد/);
 assert.match(monthlyAmountMarkup({none:true,text:'',absent:true},'memorization'),/غائب — لم يحضر/);
});
test('monthly table pairs each student with saved amounts, status and note, including archived history',()=>{
 const a=emptyMonthly('a');a.memorization={none:true,text:''};a.revision={none:true,text:''};a.note='<ملاحظة>';
 const b=setMonthlyAbsent(emptyMonthly('b'),true),c=emptyMonthly('c');
 const html=buildMonthlyReadingTable({students:[{id:'a',full_name:'<أحمد>',active:false},{id:'b',full_name:'علي',active:true},{id:'c',full_name:'يوسف',active:true},{id:'d',full_name:'مستبعد'}],rows:new Map([['a',a],['b',b],['c',c]]),className:'5/A'});
 assert.match(html,/&lt;أحمد&gt;/);assert.match(html,/&lt;ملاحظة&gt;/);assert.match(html,/مؤرشف · تقرير محفوظ/);
 assert.match(html,/✓ مكتمل/);assert.match(html,/— غائب/);assert.match(html,/◷ بيانات ناقصة/);assert.match(html,/5\/A/);
 assert.equal((html.match(/scope="col"/g)||[]).length,5);assert.equal((html.match(/scope="row"/g)||[]).length,3);assert.doesNotMatch(html,/مستبعد/);
});
