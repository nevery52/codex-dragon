import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
export async function verifyDragonFollow({window,dispatcher,output}) {
 fs.mkdirSync(output,{recursive:true}); const checks=[];
 const ev=s=>window.webContents.executeJavaScript(s);
 try {
  for(let i=0;i<100;i++){if(await ev("!!window.WhaleWSL && !!document.querySelector('.whale-wsl-panel')"))break;await delay(150);}
  assert.equal(await ev("document.documentElement.dataset.wsl"),'true');
  assert.equal(await ev("!!window.DragonAvatar && !!window.DragonAnchor"),true);
  checks.push('Original dragon panel, expressions and anchor controller loaded');
  let data;
  for(let i=0;i<100;i++){data=JSON.parse((await dispatcher.dispatch('/api/wsl')).body);if(data.status.connected && data.subscription.available)break;await delay(200);}
  assert.equal(data.status.connected,true,'local collector connected');
  assert.equal(data.subscription.available,true,'existing account quota available');
  checks.push('Existing local collector connected; quota available without a new login');
  const status=JSON.parse((await dispatcher.dispatch('/api/status')).body);
  assert.equal(status.desktopMode,'follow-codex');assert.equal(status.nativeFollowing,true);assert.equal(status.rendererReady,true);
  assert.ok(status.windowShape.length>0);assert.equal(status.windowShapeError,null);
  checks.push('Native following and bounded region active with original dragon features');
  if(await ev('DragonAnchor.config.bottomOnly')) {
   const original=await ev('({...DragonAnchor.config.anchor})');
   const before=await ev(`(()=>{const r=document.querySelector('.dshwv-root').getBoundingClientRect();return {x:r.x,y:r.y}})()`);
   const hit=await ev(`(()=>{const img=document.querySelector('.dshwv-img'),root=document.querySelector('.dshwv-root'),r=img.getBoundingClientRect();for(let y=r.top+5;y<r.bottom;y+=5)for(let x=r.left+5;x<r.right;x+=5)if(WhaleRendering.petInteraction.hit(img,root,x,y))return {x:Math.round(x),y:Math.round(y)};throw Error('No drag hit point')})()`);
   window.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...hit});await delay(80);
   const end={x:hit.x+(before.x>200?-100:100),y:hit.y-200};
   window.webContents.sendInputEvent({type:'mouseMove',...end});await delay(150);
   const during=await ev(`(()=>{const r=document.querySelector('.dshwv-root').getBoundingClientRect();return {x:r.x,y:r.y}})()`);
   window.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...end});await delay(200);
   assert.ok(Math.abs(during.y-before.y)<2,'upward dragging stays on bottom');
   assert.ok(Math.abs(during.x-before.x)>50,'horizontal dragging remains enabled');
   assert.equal(await ev('DragonAnchor.config.anchor.ay'),1);
   await ev(`DragonAnchor.save(${JSON.stringify(original)}).then(()=>dispatchEvent(new Event('resize')))`);
   checks.push('Bottom lock: real upward drag stays at bottom, horizontal movement and saved bottom anchor verified');
  }

  await ev("document.querySelector('.dshwv-menu-btn').click()");await delay(400);
  assert.equal(await ev("document.querySelector('.whale-wsl-panel').hidden"),true);
  await ev("document.querySelector('.dshwv-menu-btn').click()");await delay(400);
  await ev('WhaleWSL.openSettings()');await delay(250);assert.equal(await ev("!!document.querySelector('#wsl-settings[open]')"),true);
  await ev("document.querySelector('#wsl-settings').close()");
  await ev('WhaleWSL.openHistory()');await delay(250);assert.equal(await ev("!!document.querySelector('#dragon-history[open]')"),true);
  await ev("document.querySelector('#dragon-history').close()");await delay(500);
  checks.push('Original menu/card exclusion, settings and history dialogs work');
  fs.writeFileSync(path.join(output,'Codex龙娘-原版功能.png'),(await window.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(output,'live-checks.json'),JSON.stringify({ok:true,checks},null,2));
 } catch(e){fs.writeFileSync(path.join(output,'live-checks.json'),JSON.stringify({ok:false,checks,error:e.stack},null,2));}
}
