import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyDesktop({app,window,screen,setHost,setTestCursor,dataDir,errors,renderInfo}) {
 const out=process.env.WHALE_DESKTOP_VERIFY_DIR; fs.mkdirSync(out,{recursive:true});
 const checks=[], ev=s=>window.webContents.executeJavaScript(s);
 const wait=async(s)=>{for(let i=0;i<100;i++){if(await ev(`!!(${s})`))return;await delay(60);}throw Error('Timeout: '+s);};
 const snapshot=()=>ev(`(()=>{const r=document.querySelector('.dshwv-root').getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,W:innerWidth,H:innerHeight,anchor:DragonAnchor.config.anchor,flip:WhaleRendering.mirrorScale(document.querySelector('.dshwv-root'))}})()`);
 const verify=async(label)=>{await delay(400);const s=await snapshot();assert.ok(Math.abs(s.x-s.anchor.ax*Math.max(0,s.W-s.w))<2,label+JSON.stringify(s));assert.ok(Math.abs(s.y-s.anchor.ay*Math.max(0,s.H-s.h))<2,label+JSON.stringify(s)); const shape=renderInfo().windowShape;assert.ok(shape?.length>0 && shape.length<=64);checks.push({label,...s});};
 const host={hostAlive:true,visible:true,attached:true,hostPid:123456,window:'0'};
 const resize=async(width,height)=>{await setHost({...host,bounds:screen.dipToScreenRect(null,{x:70,y:70,width,height})});await delay(500);};
 try {
  await resize(1000,720); await wait("window.DragonAnchor && window.__whaleRenderTest && document.querySelector('.dshwv-img')?.naturalWidth>0");await delay(1000);
  const disk=JSON.parse(fs.readFileSync(new URL('../dragon.json',import.meta.url),'utf8').replace(/^\uFEFF/,''));
  assert.deepEqual((await snapshot()).anchor,disk.overlay.anchor);await verify('cold process startup restores persisted anchor');
  for(const [ax,ay] of [[0,0],[1,0],[0,1],[1,1],[0.37,0.62]]) {
   await ev(`DragonAnchor.save({ax:${ax},ay:${ay}}).then(()=>dispatchEvent(new Event('resize')))`);await verify('anchor '+ax+','+ay);
   const s=await snapshot();assert.equal(s.flip<0,ax<0.5);
  }
  await resize(640,480);await verify('resize preserves ratio');
  await resize(1000,720);await verify('restore preserves ratio');
  const before=await snapshot();
  await window.webContents.reload();await wait('window.DragonAnchor && window.__whaleRenderTest');await verify('renderer restart restores dragon.json');assert.equal((await snapshot()).anchor.ax,before.anchor.ax);
  await ev('DragonAnchor.config.flipOnTop=true; DragonAnchor.save({ax:0,ay:0}).then(()=>dispatchEvent(new Event("resize")))');await delay(400);
  assert.ok(await ev('new DOMMatrixReadOnly(getComputedStyle(document.querySelector(".dshwv-root")).transform).d<0'));checks.push({label:'vertical flip'});
  await ev('DragonAnchor.config.flipOnTop=false; DragonAnchor.save({ax:0.5,ay:0.5}).then(()=>dispatchEvent(new Event("resize")))');await delay(500);
  // Real Electron pointer events exercise the production drag handler without OS input.
  window.focus();
  const hit=await ev(`(()=>{const img=document.querySelector('.dshwv-img'),r=img.getBoundingClientRect();for(let y=r.top+5;y<r.bottom;y+=5)for(let x=r.left+5;x<r.right;x+=5)if(WhaleRendering.petInteraction.hit(img,document.querySelector('.dshwv-root'),x,y))return {x:Math.round(x),y:Math.round(y)};throw Error('No hit point')})()`);
  setTestCursor(hit);window.webContents.sendInputEvent({type:'mouseMove',...hit});await delay(100);
  window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...hit});await delay(70);
  const s=await snapshot(), end={x:Math.round(hit.x-s.x+5),y:Math.round(hit.y-s.y+5)};
  setTestCursor(end);window.webContents.sendInputEvent({type:'mouseMove',...end});await delay(100);
  window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...end});await delay(700);
  const dragged=await snapshot();assert.equal(dragged.anchor.ax,0);assert.equal(dragged.anchor.ay,0);await verify('pointer drag snaps to top-left');
  setTestCursor({x:500,y:350});await delay(150);assert.equal(renderInfo().inputEnabled,false);checks.push({label:'transparent center passes input'});
  fs.writeFileSync(path.join(out,'龙娘-吸附验收.png'),(await window.webContents.capturePage()).toPNG());
  await ev('DragonAnchor.save({ax:1,ay:1}).then(()=>dispatchEvent(new Event("resize")))');await verify('restore defaults');
  fs.writeFileSync(path.join(out,'龙娘-右下角.png'),(await window.webContents.capturePage()).toPNG());
  assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'electron-checks.json'),JSON.stringify({ok:true,checks},null,2));app.quit();
 } catch(e){fs.writeFileSync(path.join(out,'electron-checks.json'),JSON.stringify({ok:false,error:e.stack,checks,errors},null,2));app.exit(1);}
}
