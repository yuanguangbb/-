const fs = require('fs');
const path = require('path');

const CDP_PORT = process.env.CDP_PORT || '9233';
const SITE_URL = process.env.SITE_URL || 'http://127.0.0.1:4173/index.html';
const SCREENSHOT_DIR = 'C:\\Users\\26475\\.gstack\\projects\\personal-website\\designs\\design-audit-20260719\\screenshots';
const delay = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

async function connectPage() {
  let page;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      page = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/new?about:blank`, { method: 'PUT' })).json();
      if (page.webSocketDebuggerUrl) return page;
    } catch (_) {}
    await delay(200);
  }
  throw new Error('无法连接 Edge 调试端口');
}

async function main() {
  const page = await connectPage();
  const socket = new WebSocket(page.webSocketDebuggerUrl);
  let commandId = 0;
  const pending = new Map();
  const runtimeErrors = [];

  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.method === 'Runtime.exceptionThrown') {
      runtimeErrors.push(message.params.exceptionDetails.text);
    }
    if (!message.id) return;
    const callback = pending.get(message.id);
    if (!callback) return;
    pending.delete(message.id);
    if (message.error) callback.reject(new Error(message.error.message));
    else callback.resolve(message.result);
  };

  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++commandId;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
    return result.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('DOM.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1000,
    deviceScaleFactor: 1,
    mobile: false
  });
  await send('Page.navigate', { url: SITE_URL });
  await delay(1600);
  console.log('STEP loaded');

  const initial = await evaluate(`(() => {
    const level = document.querySelector('.skill-level');
    const oldDelete = document.querySelector('.skill-bar > .delete-btn');
    const actions = document.querySelector('.skill-item-actions');
    return {
      oldDeleteExists: Boolean(oldDelete),
      actionDisplay: getComputedStyle(actions).display,
      levelText: level.textContent.trim(),
      editorTop: Math.round(document.getElementById('editorDock').getBoundingClientRect().top)
    };
  })()`);

  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 120, y: 180, button: 'none' });
  await delay(200);
  const topReveal = await evaluate("document.getElementById('wallpaperReveal').className");
  const topWallpaperScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-wallpaper-top.png'), Buffer.from(topWallpaperScreenshot.data, 'base64'));
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 120, y: 820, button: 'none' });
  await delay(200);
  const bottomReveal = await evaluate("document.getElementById('wallpaperReveal').className");
  const bottomWallpaperScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-wallpaper-bottom.png'), Buffer.from(bottomWallpaperScreenshot.data, 'base64'));
  console.log('STEP wallpaper');

  const editState = await evaluate(`(() => {
    toggleEditMode(true);
    const hero = document.querySelector('[data-edit-key="heroName"]');
    hero.textContent = '测试姓名';
    hero.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: '测试姓名' }));
    hero.blur();
    return {
      editMode: document.body.classList.contains('edit-mode'),
      contentEditable: hero.contentEditable,
      skillActionDisplay: getComputedStyle(document.querySelector('.skill-item-actions')).display,
      panelHidden: document.getElementById('editorPanel').hidden
    };
  })()`);
  await delay(700);
  const savedContent = await evaluate("JSON.parse(localStorage.getItem('site_content_v1')).heroName");
  console.log('STEP edit');

  await evaluate("window.scrollTo(0, document.getElementById('skills').offsetTop - 70)");
  await delay(350);
  const editScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-edit-mode.png'), Buffer.from(editScreenshot.data, 'base64'));

  const crud = await evaluate(`(() => {
    const beforeSkills = document.querySelectorAll('#skill-software .skill-item').length;
    openAddSkillItem('software');
    document.getElementById('skill-name').value = 'SolidWorks';
    document.getElementById('skill-level').value = '学习中 · 三维建模';
    document.getElementById('skill-fill').value = '58';
    document.getElementById('skill-level-class').value = 'low';
    saveSkillItem({ preventDefault() {} });
    const afterSkills = document.querySelectorAll('#skill-software .skill-item').length;

    const beforeJourneys = document.querySelectorAll('#journey-list .journey-item').length;
    openAddJourney();
    document.getElementById('journey-time').value = '2026.07';
    document.getElementById('journey-title').value = '练气 · 完成界面重构';
    document.getElementById('journey-description').value = '验证长期编辑、备份和照片裁切流程。';
    document.getElementById('journey-marker').value = '练';
    saveJourney({ preventDefault() {} });
    const afterJourneys = document.querySelectorAll('#journey-list .journey-item').length;
    toggleEditMode(false);
    return {
      beforeSkills,
      afterSkills,
      beforeJourneys,
      afterJourneys,
      skillStored: JSON.parse(localStorage.getItem('site_skills')).software.some(item => item.name === 'SolidWorks'),
      journeyStored: JSON.parse(localStorage.getItem('site_journeys')).some(item => item.title.includes('界面重构'))
    };
  })()`);
  console.log('STEP crud');

  const documentNode = await send('DOM.getDocument');
  const inputNode = await send('DOM.querySelector', {
    nodeId: documentNode.root.nodeId,
    selector: '#portraitInput'
  });
  await send('DOM.setFileInputFiles', {
    nodeId: inputNode.nodeId,
    files: [path.join(process.cwd(), 'wallpaper-1.jpg')]
  });
  await evaluate("document.getElementById('portraitInput').dispatchEvent(new Event('change', { bubbles: true }))");
  await delay(1700);

  const cropOpen = await evaluate(`(() => ({
    active: document.getElementById('portrait-modal').classList.contains('active'),
    hasImage: Boolean(portraitCropState.image),
    sourceSaved: Boolean(localStorage.getItem('site_portrait_source'))
  }))()`);
  console.log('STEP crop-open');
  const cropScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-portrait-crop.png'), Buffer.from(cropScreenshot.data, 'base64'));

  const cropSaved = await evaluate(`(() => {
    rotatePortrait(-90);
    document.getElementById('portraitZoom').value = '1.25';
    document.getElementById('portraitZoom').dispatchEvent(new Event('input', { bubbles: true }));
    savePortraitCrop();
    const image = document.getElementById('portraitImg');
    return {
      modalActive: document.getElementById('portrait-modal').classList.contains('active'),
      portraitSaved: localStorage.getItem('site_portrait')?.startsWith('data:image/jpeg'),
      imageHidden: image.hidden,
      imageSrc: image.src.slice(0, 22)
    };
  })()`);
  console.log('STEP crop-save');

  const backupExport = await evaluate(`(() => {
    const backupData = buildSiteBackup();
    return {
      fileCreated: true,
      version: backupData?.version,
      hasContent: Boolean(backupData?.data?.content),
      hasProjects: Array.isArray(backupData?.data?.projects),
      hasSkills: Boolean(backupData?.data?.skills),
      hasJourneys: Array.isArray(backupData?.data?.journeys),
      hasPortrait: Boolean(backupData?.data?.portrait)
    };
  })()`);
  console.log('STEP backup');

  await evaluate("window.scrollTo(0, document.getElementById('about').offsetTop - 68)");
  await delay(350);
  const portraitResultScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-portrait-result.png'), Buffer.from(portraitResultScreenshot.data, 'base64'));

  await evaluate('localStorage.clear()');
  console.log('STEP portrait-result');
  await send('Emulation.setDeviceMetricsOverride', {
    width: 375,
    height: 812,
    deviceScaleFactor: 1,
    mobile: true
  });
  await send('Page.navigate', { url: SITE_URL });
  await delay(1200);
  const mobileHome = await evaluate(`(() => {
    const hero = document.querySelector('.hero-content').getBoundingClientRect();
    const menu = document.querySelector('.mobile-menu-btn');
    return {
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroRight: Math.round(hero.right),
      menuDisplay: getComputedStyle(menu).display,
      menuRight: Math.round(menu.getBoundingClientRect().right)
    };
  })()`);
  console.log('STEP mobile-home');
  const mobileHomeScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-mobile-home-cdp.png'), Buffer.from(mobileHomeScreenshot.data, 'base64'));

  await evaluate("window.scrollTo(0, document.getElementById('skills').offsetTop - 64)");
  await delay(500);
  const mobileSkills = await evaluate(`(() => {
    const group = document.querySelector('.skill-group').getBoundingClientRect();
    const level = document.querySelector('.skill-level').getBoundingClientRect();
    return {
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      groupRight: Math.round(group.right),
      levelRight: Math.round(level.right),
      deleteButtons: document.querySelectorAll('.skill-bar > .delete-btn').length
    };
  })()`);
  console.log('STEP mobile-skills');
  const mobileSkillsScreenshot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(path.join(SCREENSHOT_DIR, 'v2-mobile-skills-cdp.png'), Buffer.from(mobileSkillsScreenshot.data, 'base64'));

  const report = { initial, topReveal, bottomReveal, editState, savedContent, crud, cropOpen, cropSaved, backupExport, mobileHome, mobileSkills, runtimeErrors };
  console.log(JSON.stringify(report, null, 2));

  if (initial.oldDeleteExists) throw new Error('旧删除按钮仍然遮挡技能文字');
  if (initial.actionDisplay !== 'none') throw new Error('非编辑模式下仍显示管理按钮');
  if (!topReveal.includes('is-active') || topReveal.includes('is-bottom')) throw new Error('上方壁纸状态错误');
  if (!bottomReveal.includes('is-bottom')) throw new Error('下方壁纸状态错误');
  if (!editState.editMode || editState.contentEditable !== 'true' || editState.skillActionDisplay === 'none') throw new Error('统一编辑模式未生效');
  if (savedContent !== '测试姓名') throw new Error('可编辑文字未持久化');
  if (crud.afterSkills !== crud.beforeSkills + 1 || !crud.skillStored) throw new Error('技能增添或保存失败');
  if (crud.afterJourneys !== crud.beforeJourneys + 1 || !crud.journeyStored) throw new Error('履历增添或保存失败');
  if (!cropOpen.active || !cropOpen.hasImage) throw new Error('照片裁切器未打开');
  if (!cropSaved.portraitSaved || cropSaved.imageHidden) throw new Error('照片裁切结果未保存');
  if (!backupExport.fileCreated || backupExport.version !== 2 || !backupExport.hasContent || !backupExport.hasPortrait) throw new Error('网站备份导出失败');
  if (mobileHome.scrollWidth > mobileHome.clientWidth || mobileHome.heroRight > mobileHome.clientWidth) throw new Error('移动端首页出现横向溢出');
  if (mobileHome.menuDisplay === 'none' || mobileHome.menuRight > mobileHome.clientWidth) throw new Error('移动端菜单不可见');
  if (mobileSkills.scrollWidth > mobileSkills.clientWidth || mobileSkills.levelRight > mobileSkills.groupRight) throw new Error('移动端技能文字溢出');
  if (mobileSkills.deleteButtons) throw new Error('移动端仍存在遮挡文字的删除按钮');
  if (runtimeErrors.length) throw new Error(`页面运行异常：${runtimeErrors.join('; ')}`);

  await send('Browser.close');
  socket.close();
}

main().catch(error => {
  console.error(error.stack || error.message);
  process.exit(1);
});
