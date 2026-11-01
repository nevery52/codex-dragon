import test from 'node:test'; import assert from 'node:assert/strict'; import {createRequire} from 'node:module'; const require=createRequire(import.meta.url);
const {createVisibilityController}=require('../desktop/visibility.cjs');
test('owned window minimize/restore avoids explicit hide and delayed remap, while manual hide still works',()=>{
 let state={ready:true,host:{hostAlive:true,visible:true,attached:true,hostPid:1,window:'1',visibilityRevision:0}}, visible=true;
 const calls=[];const window={isDestroyed:()=>false,isVisible:()=>visible,hide(){calls.push('hide');visible=false},showInactive(){calls.push('show');visible=true}};
 const c=createVisibilityController({getWindow:()=>window,getState:()=>state,schedule:()=>{throw Error('restore must not schedule remap')}});
 c.update();calls.length=0;
 state.host={...state.host,visible:false,minimized:true,visibilityRevision:1};c.update();assert.deepEqual(calls,[]);
 state.host={...state.host,visible:true,minimized:false,visibilityRevision:2};c.update();assert.deepEqual(calls,[]);
 state.manuallyHidden=true;state.host.minimized=true;c.update();assert.deepEqual(calls,['hide']);
 c.dispose();
});

test('switching hosts after minimize keeps attachment recovery guards',()=>{
 let state={ready:true,host:{hostAlive:true,visible:true,attached:true,hostPid:1,window:'1',visibilityRevision:0}};
 const tasks=[],calls=[];let visible=true;
 const window={isDestroyed:()=>false,isVisible:()=>visible,hide(){visible=false;calls.push('hide')},showInactive(){visible=true;calls.push('show')}};
 const c=createVisibilityController({getWindow:()=>window,getState:()=>state,schedule:fn=>{tasks.push(fn);return fn},cancel:()=>{}});
 c.update();calls.length=0;
 state.host={...state.host,minimized:true,visible:false};c.update();
 state.host={...state.host,hostPid:2,window:'2',minimized:false,visible:true};c.update();
 assert.deepEqual(calls,['hide']);assert.equal(tasks.length,1);
 tasks.shift()();assert.deepEqual(calls,['hide','show']);c.dispose();
});
