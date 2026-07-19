// ===================================
// 凡人修仙传主题个人网站 - 交互脚本
// ===================================

// 全局计数器，用于生成唯一ID
let projCounter = 3;
let skillCounter = 10;
let journeyCounter = 4;
let editModeEnabled = false;
let ownerModeEnabled = false;
let contentSaveTimer = null;

const STORAGE_KEYS = {
  content: 'site_content_v1',
  projects: 'site_projects',
  skills: 'site_skills',
  journeys: 'site_journeys',
  portrait: 'site_portrait',
  portraitSource: 'site_portrait_source',
  theme: 'theme'
};

document.addEventListener('DOMContentLoaded', () => {
  initOwnerMode();

  // 个人资料只在本机管理模式读取，公开网站始终展示已发布版本。
  if (ownerModeEnabled) loadData();
  prepareSkillEditors();
  if (ownerModeEnabled) {
    initEditableContent();
    initPortraitCropper();
  }
  refreshDerivedLinks();

  // 导航栏滚动效果
  const navbar = document.querySelector('.navbar');
  const handleScroll = () => {
    navbar.classList.toggle('scrolled', window.scrollY > 50);
  };
  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();

  // 移动端菜单
  const mobileMenuBtn = document.querySelector('.mobile-menu-btn');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => {
      const isActive = mobileMenu.classList.toggle('active');
      const spans = mobileMenuBtn.querySelectorAll('span');
      if (isActive) {
        spans[0].style.transform = 'rotate(45deg) translate(5px, 5px)';
        spans[1].style.opacity = '0';
        spans[2].style.transform = 'rotate(-45deg) translate(5px, -5px)';
      } else {
        spans.forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
      }
    });
    mobileMenu.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => {
        mobileMenu.classList.remove('active');
        mobileMenuBtn.querySelectorAll('span').forEach(s => { s.style.transform = ''; s.style.opacity = ''; });
      });
    });
  }

  // 平滑滚动
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        window.scrollTo({ top: target.offsetTop - navbar.offsetHeight, behavior: 'smooth' });
      }
    });
  });

  // 滚动显示动画
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
  document.querySelectorAll('.project-card, .about-content, .contact-content, .skill-group').forEach(el => {
    el.classList.add('fade-in');
    observer.observe(el);
  });

  // 导航链接高亮
  const highlightNav = () => {
    const scrollPos = window.scrollY + 100;
    document.querySelectorAll('section[id]').forEach(section => {
      const sectionId = section.getAttribute('id');
      const link = document.querySelector(`.nav-links a[href="#${sectionId}"]`);
      if (link) {
        link.classList.toggle('active',
          scrollPos >= section.offsetTop && scrollPos < section.offsetTop + section.offsetHeight);
      }
    });
  };
  window.addEventListener('scroll', highlightNav, { passive: true });
  highlightNav();

  document.addEventListener('click', (event) => {
    if (editModeEnabled && event.target.closest('a')) {
      event.preventDefault();
    }
  });
});

// ==================== 数据持久化 ====================

function initOwnerMode() {
  const localHosts = new Set(['localhost', '127.0.0.1', '::1']);
  ownerModeEnabled = window.location.protocol === 'file:' || localHosts.has(window.location.hostname);
  document.documentElement.classList.toggle('owner-mode', ownerModeEnabled);

  const editorDock = document.getElementById('editorDock');
  if (editorDock) editorDock.hidden = !ownerModeEnabled;
}

function loadData() {
  if (!ownerModeEnabled) return;

  // 加载头像
  const savedPortrait = localStorage.getItem('site_portrait');
  if (savedPortrait) {
    showPortrait(savedPortrait);
  }

  // 加载项目数据
  const projects = readStoredJSON(STORAGE_KEYS.projects, []);
  if (projects.length > 0) {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';
    projects.forEach(p => grid.appendChild(createProjectCard(p)));
    projCounter = Math.max(projCounter, ...projects.map(p => parseInt(p.id.replace(/\D/g, '') || '0') + 1));
  }

  // 加载技能数据
  const skills = readStoredJSON(STORAGE_KEYS.skills, {});
  Object.keys(skills).forEach(group => {
    const container = document.getElementById('skill-' + group);
    if (!container) return;
    container.innerHTML = '';
    skills[group].forEach(item => {
      if (item.type === 'bar') {
        container.appendChild(createSkillBar(item, group));
      } else if (item.type === 'cert') {
        container.appendChild(createCertBadge(item, group));
      } else if (item.type === 'course') {
        container.appendChild(createCourseTag(item, group));
      }
    });
  });
  const storedSkillIds = Object.values(skills).flat().map(item => Number(String(item.id).replace(/\D/g, '')) || 0);
  if (storedSkillIds.length) skillCounter = Math.max(skillCounter, ...storedSkillIds) + 1;

  const storedJourneys = readStoredJSON(STORAGE_KEYS.journeys, []);
  if (storedJourneys.length > 0) {
    const list = document.getElementById('journey-list');
    list.innerHTML = '';
    storedJourneys.forEach(item => list.appendChild(createJourneyItem(item)));
    journeyCounter = Math.max(journeyCounter, ...storedJourneys.map(item => Number(item.id.replace(/\D/g, '')) || 0)) + 1;
  }
}

function readStoredJSON(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch (error) {
    console.warn(`无法读取 ${key}，已使用默认数据。`, error);
    return fallback;
  }
}

function saveProjects() {
  const cards = document.querySelectorAll('#projects-grid .project-card');
  const data = [];
  cards.forEach(card => {
    data.push({
      id: card.dataset.id,
      title: card.querySelector('.card-title').textContent,
      category: card.querySelector('.card-category').textContent,
      desc: card.querySelector('.card-description').textContent,
      tags: Array.from(card.querySelectorAll('.tag')).map(t => t.textContent),
      metrics: Array.from(card.querySelectorAll('.card-metric')).map(m => m.textContent),
      color: card.querySelector('.card-accent').className.replace('card-accent ', '')
    });
  });
  localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(data));
}

function saveSkills() {
  const data = {};
  ['software', 'data'].forEach(group => {
    const container = document.getElementById('skill-' + group);
    if (!container) return;
    data[group] = [];
    container.querySelectorAll('.skill-item').forEach(item => {
      data[group].push({
        id: item.dataset.id,
        type: 'bar',
        name: item.querySelector('.skill-name').textContent,
        level: item.querySelector('.skill-level').textContent,
        fill: item.querySelector('.skill-fill').style.width || '80%',
        levelClass: item.querySelector('.skill-fill').classList.contains('high') ? 'high' :
                    item.querySelector('.skill-fill').classList.contains('low') ? 'low' : 'medium'
      });
    });
  });
  ['certs', 'courses'].forEach(group => {
    const container = document.getElementById('skill-' + group);
    if (!container) return;
    data[group] = [];
    container.querySelectorAll('.badge-item').forEach(item => {
      const name = item.querySelector('.cert-name, .course-name')?.textContent.trim() || '';
      data[group].push({
        id: item.dataset.id,
        type: group === 'certs' ? 'cert' : 'course',
        name: name
      });
    });
  });
  localStorage.setItem(STORAGE_KEYS.skills, JSON.stringify(data));
}

// ==================== 项目 CRUD ====================

function createProjectCard(data) {
  const article = document.createElement('article');
  article.className = 'project-card editable-wrapper';
  article.dataset.id = data.id;
  article.innerHTML = `
    <div class="edit-toolbar edit-only">
      <button type="button" class="edit-btn" onclick="openEditProject('${data.id}')">编辑</button>
      <button type="button" class="delete-btn" onclick="deleteItem('${data.id}')">删除</button>
    </div>
    <div class="card-accent ${data.color || 'green'}"></div>
    <div class="card-header">
      <span class="card-category">${escapeHTML(data.category || '')}</span>
      <h3 class="card-title">${escapeHTML(data.title)}</h3>
    </div>
    <p class="card-description">${escapeHTML(data.desc)}</p>
    <div class="card-tags">${(data.tags || []).map(t => `<span class="tag">${escapeHTML(t)}</span>`).join('')}</div>
    ${data.metrics && data.metrics.length ? `
    <div class="card-details">
      ${data.metrics.map(m => `<p class="card-metric">${escapeHTML(m)}</p>`).join('')}
    </div>` : ''}
    <div class="card-actions">
      <span class="card-link">查看详情 →</span>
    </div>
  `;
  return article;
}

function openAddProject() {
  document.getElementById('project-modal-title').textContent = '添加新项目';
  document.getElementById('proj-edit-id').value = '';
  document.getElementById('proj-title').value = '';
  document.getElementById('proj-category').value = '';
  document.getElementById('proj-desc').value = '';
  document.getElementById('proj-tags').value = '';
  document.getElementById('proj-metrics').value = '';
  document.getElementById('proj-color').value = 'green';
  openModal('project-modal');
}

function openEditProject(id) {
  const card = document.querySelector(`#projects-grid [data-id="${id}"]`);
  if (!card) return;
  document.getElementById('project-modal-title').textContent = '编辑项目';
  document.getElementById('proj-edit-id').value = id;
  document.getElementById('proj-title').value = card.querySelector('.card-title').textContent;
  document.getElementById('proj-category').value = card.querySelector('.card-category').textContent;
  document.getElementById('proj-desc').value = card.querySelector('.card-description').textContent;
  document.getElementById('proj-tags').value = Array.from(card.querySelectorAll('.tag')).map(t => t.textContent).join(', ');
  document.getElementById('proj-metrics').value = Array.from(card.querySelectorAll('.card-metric')).map(m => m.textContent).join('\n');
  const accent = card.querySelector('.card-accent');
  let color = 'green';
  if (accent.classList.contains('purple')) color = 'purple';
  if (accent.classList.contains('silver')) color = 'silver';
  document.getElementById('proj-color').value = color;
  openModal('project-modal');
}

function saveProject(e) {
  e.preventDefault();
  const editId = document.getElementById('proj-edit-id').value;
  const data = {
    id: editId || ('proj-' + (projCounter++)),
    title: document.getElementById('proj-title').value,
    category: document.getElementById('proj-category').value,
    desc: document.getElementById('proj-desc').value,
    tags: document.getElementById('proj-tags').value.split(/[,，]/).map(t => t.trim()).filter(Boolean),
    metrics: document.getElementById('proj-metrics').value.split('\n').map(m => m.trim()).filter(Boolean),
    color: document.getElementById('proj-color').value
  };

  const grid = document.getElementById('projects-grid');
  if (editId) {
    const existing = grid.querySelector(`[data-id="${editId}"]`);
    if (existing) {
      existing.replaceWith(createProjectCard(data));
    }
  } else {
    grid.appendChild(createProjectCard(data));
  }
  closeModal('project-modal');
  saveProjects();
  showToast(editId ? '项目已更新' : '项目已添加');
}

// ==================== 技能项 CRUD ====================

function createSkillBar(data, group = data.group || 'software') {
  const div = document.createElement('div');
  div.className = 'skill-bar skill-item';
  div.dataset.id = data.id;
  div.dataset.group = group;
  const fillClass = data.levelClass || 'high';
  div.innerHTML = `
    <div class="skill-info">
      <span class="skill-name">${escapeHTML(data.name)}</span>
      <span class="skill-level">${escapeHTML(data.level || '')}</span>
    </div>
    <div class="skill-track">
      <div class="skill-fill ${fillClass}" style="width:${data.fill || '80%'}"></div>
    </div>
    ${skillActionMarkup(data.id, group)}
  `;
  return div;
}

function createCertBadge(data, group = 'certs') {
  const div = document.createElement('div');
  div.className = 'cert-badge badge-item';
  div.dataset.id = data.id;
  div.dataset.group = group;
  div.innerHTML = `
    <span class="cert-name">${escapeHTML(data.name)}</span>
    ${skillActionMarkup(data.id, group, true)}
  `;
  return div;
}

function createCourseTag(data, group = 'courses') {
  const span = document.createElement('span');
  span.className = 'course-tag badge-item';
  span.dataset.id = data.id;
  span.dataset.group = group;
  span.innerHTML = `<span class="course-name">${escapeHTML(data.name)}</span>${skillActionMarkup(data.id, group, true)}`;
  return span;
}

function skillActionMarkup(id, group, compact = false) {
  return `
    <span class="skill-item-actions edit-only${compact ? ' compact' : ''}">
      <button type="button" onclick="openEditSkillItem('${id}', '${group}')">编辑</button>
      <button type="button" class="danger" onclick="deleteSkillItem('${id}')">删除</button>
    </span>
  `;
}

function prepareSkillEditors() {
  document.querySelectorAll('.skill-item').forEach(item => {
    const group = item.closest('.skill-group')?.dataset.group || item.dataset.group || 'software';
    item.dataset.group = group;
    item.querySelectorAll('.delete-btn').forEach(button => button.remove());
    if (!item.querySelector('.skill-item-actions')) {
      item.insertAdjacentHTML('beforeend', skillActionMarkup(item.dataset.id, group));
    }
  });

  document.querySelectorAll('.badge-item').forEach(item => {
    const group = item.closest('.skill-group')?.dataset.group || item.dataset.group || 'certs';
    item.dataset.group = group;
    item.querySelectorAll('.badge-remove').forEach(button => button.remove());
    if (group === 'courses' && !item.querySelector('.course-name')) {
      const text = Array.from(item.childNodes).filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim();
      item.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) node.remove();
      });
      item.insertAdjacentHTML('afterbegin', `<span class="course-name">${escapeHTML(text)}</span>`);
    }
    if (!item.querySelector('.skill-item-actions')) {
      item.insertAdjacentHTML('beforeend', skillActionMarkup(item.dataset.id, group, true));
    }
  });
}

function openAddSkillItem(group) {
  document.getElementById('skill-modal-title').textContent = '添加技能项';
  document.getElementById('skill-group-type').value = group;
  document.getElementById('skill-edit-id').value = '';
  renderSkillInputs(group);
  openModal('skill-modal');
}

function renderSkillInputs(group, values = {}) {
  const inputs = document.getElementById('skill-inputs');
  if (group === 'software' || group === 'data') {
    inputs.innerHTML = `
      <label>技能名称<input type="text" id="skill-name" required placeholder="如：SolidWorks" value="${escapeAttribute(values.name || '')}"></label>
      <label>熟练程度<input type="text" id="skill-level" placeholder="如：熟练 · 三维建模" value="${escapeAttribute(values.level || '')}"></label>
      <label>掌握程度（0-100）<input type="number" id="skill-fill" min="0" max="100" value="${Number.parseInt(values.fill, 10) || 80}"></label>
      <label>等级<select id="skill-level-class">
        <option value="high" ${values.levelClass === 'high' ? 'selected' : ''}>高（80%+）</option>
        <option value="medium" ${values.levelClass === 'medium' ? 'selected' : ''}>中（60-79%）</option>
        <option value="low" ${values.levelClass === 'low' ? 'selected' : ''}>入门（&lt;60%）</option>
      </select></label>
    `;
  } else if (group === 'certs') {
    inputs.innerHTML = `
      <label>证书名称<input type="text" id="skill-name" required placeholder="如：PMP项目管理" value="${escapeAttribute(values.name || '')}"></label>
    `;
  } else if (group === 'courses') {
    inputs.innerHTML = `
      <label>课程名称<input type="text" id="skill-name" required placeholder="如：机器学习基础" value="${escapeAttribute(values.name || '')}"></label>
    `;
  }
}

function openEditSkillItem(id, group) {
  const item = document.querySelector(`[data-id="${id}"]`);
  if (!item) return;
  const fill = item.querySelector('.skill-fill');
  const values = {
    name: item.querySelector('.skill-name, .cert-name, .course-name')?.textContent.trim() || '',
    level: item.querySelector('.skill-level')?.textContent.trim() || '',
    fill: fill?.style.width || '80%',
    levelClass: fill?.classList.contains('high') ? 'high' : fill?.classList.contains('low') ? 'low' : 'medium'
  };
  document.getElementById('skill-modal-title').textContent = '编辑技能项';
  document.getElementById('skill-group-type').value = group;
  document.getElementById('skill-edit-id').value = id;
  renderSkillInputs(group, values);
  openModal('skill-modal');
}

function saveSkillItem(e) {
  e.preventDefault();
  const group = document.getElementById('skill-group-type').value;
  const editId = document.getElementById('skill-edit-id').value;
  const name = document.getElementById('skill-name')?.value?.trim();
  if (!name) return;

  let data = { id: editId || 'sk-' + (skillCounter++), type: 'bar', name, group };

  if (group === 'software' || group === 'data') {
    data.level = document.getElementById('skill-level')?.value?.trim() || '';
    data.fill = document.getElementById('skill-fill')?.value + '%';
    data.levelClass = document.getElementById('skill-level-class')?.value || 'high';
  } else {
    data.type = group === 'certs' ? 'cert' : 'course';
  }

  const container = document.getElementById('skill-' + group);
  if (container) {
    const nextItem = group === 'certs' ? createCertBadge(data, group) :
                     group === 'courses' ? createCourseTag(data, group) :
                     createSkillBar(data, group);
    const existing = editId ? container.querySelector(`[data-id="${editId}"]`) : null;
    if (existing) existing.replaceWith(nextItem);
    else container.appendChild(nextItem);
  }
  closeModal('skill-modal');
  saveSkills();
  showToast(editId ? '技能项已更新' : '技能项已添加');
}

// ==================== 通用删除 ====================

function deleteItem(id) {
  if (!confirm('确定删除此项？')) return;
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  saveProjects();
  showToast('项目已删除');
}

function deleteSkillItem(id) {
  if (!confirm('确定删除此项？')) return;
  const el = document.querySelector(`[data-id="${id}"]`);
  if (el) el.remove();
  saveSkills();
  showToast('技能项已删除');
}

// ==================== 修行履历 CRUD ====================

function createJourneyItem(data) {
  const article = document.createElement('article');
  article.className = 'journey-item editable-wrapper';
  article.dataset.id = data.id;
  article.innerHTML = `
    <div class="edit-toolbar edit-only">
      <button type="button" class="edit-btn" onclick="openEditJourney('${data.id}')">编辑</button>
      <button type="button" class="delete-btn" onclick="deleteJourney('${data.id}')">删除</button>
    </div>
    <div class="journey-marker">${escapeHTML((data.marker || '行').slice(0, 1))}</div>
    <div class="journey-content">
      <time class="journey-time">${escapeHTML(data.time || '')}</time>
      <h3 class="journey-title">${escapeHTML(data.title || '')}</h3>
      <p class="journey-description">${escapeHTML(data.description || '')}</p>
    </div>
  `;
  return article;
}

function getJourneysFromDOM() {
  return Array.from(document.querySelectorAll('#journey-list .journey-item')).map(item => ({
    id: item.dataset.id,
    marker: item.querySelector('.journey-marker')?.textContent.trim() || '行',
    time: item.querySelector('.journey-time')?.textContent.trim() || '',
    title: item.querySelector('.journey-title')?.textContent.trim() || '',
    description: item.querySelector('.journey-description')?.textContent.trim() || ''
  }));
}

function saveJourneys() {
  localStorage.setItem(STORAGE_KEYS.journeys, JSON.stringify(getJourneysFromDOM()));
}

function openAddJourney() {
  document.getElementById('journey-modal-title').textContent = '记录新收获';
  document.getElementById('journey-edit-id').value = '';
  document.getElementById('journey-time').value = '';
  document.getElementById('journey-title').value = '';
  document.getElementById('journey-description').value = '';
  document.getElementById('journey-marker').value = '行';
  openModal('journey-modal');
}

function openEditJourney(id) {
  const item = document.querySelector(`#journey-list [data-id="${id}"]`);
  if (!item) return;
  document.getElementById('journey-modal-title').textContent = '编辑修行记录';
  document.getElementById('journey-edit-id').value = id;
  document.getElementById('journey-time').value = item.querySelector('.journey-time').textContent.trim();
  document.getElementById('journey-title').value = item.querySelector('.journey-title').textContent.trim();
  document.getElementById('journey-description').value = item.querySelector('.journey-description').textContent.trim();
  document.getElementById('journey-marker').value = item.querySelector('.journey-marker').textContent.trim();
  openModal('journey-modal');
}

function saveJourney(event) {
  event.preventDefault();
  const editId = document.getElementById('journey-edit-id').value;
  const data = {
    id: editId || `journey-${journeyCounter++}`,
    time: document.getElementById('journey-time').value.trim(),
    title: document.getElementById('journey-title').value.trim(),
    description: document.getElementById('journey-description').value.trim(),
    marker: document.getElementById('journey-marker').value.trim() || '行'
  };
  const nextItem = createJourneyItem(data);
  const list = document.getElementById('journey-list');
  const existing = editId ? list.querySelector(`[data-id="${editId}"]`) : null;
  if (existing) existing.replaceWith(nextItem);
  else list.appendChild(nextItem);
  saveJourneys();
  closeModal('journey-modal');
  showToast(editId ? '修行记录已更新' : '新收获已记入玉简');
}

function deleteJourney(id) {
  if (!confirm('确定删除这条修行记录？')) return;
  document.querySelector(`#journey-list [data-id="${id}"]`)?.remove();
  saveJourneys();
  showToast('修行记录已删除');
}

// ==================== 弹窗管理 ====================

function openModal(id) {
  document.getElementById(id).classList.add('active');
}

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// 点击遮罩层关闭
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ESC 键关闭弹窗
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
  }
});

// ==================== 统一玉简编辑与备份 ====================

function initEditableContent() {
  loadEditableContent();
  document.querySelectorAll('[data-edit-key]').forEach(element => {
    element.classList.add('site-editable');
    element.addEventListener('input', handleEditableInput);
    element.addEventListener('blur', saveEditableContent);
  });
}

function loadEditableContent() {
  if (!ownerModeEnabled) return;

  const content = readStoredJSON(STORAGE_KEYS.content, {});
  document.querySelectorAll('[data-edit-key]').forEach(element => {
    const value = content[element.dataset.editKey];
    if (typeof value !== 'string') return;
    if (element.dataset.editFormat === 'html') element.innerHTML = value;
    else element.textContent = value;
  });
}

function collectEditableContent() {
  const content = {};
  document.querySelectorAll('[data-edit-key]').forEach(element => {
    const key = element.dataset.editKey;
    if (Object.prototype.hasOwnProperty.call(content, key)) return;
    content[key] = element.dataset.editFormat === 'html' ? element.innerHTML.trim() : element.textContent.trim();
  });
  return content;
}

function handleEditableInput(event) {
  const source = event.currentTarget;
  const key = source.dataset.editKey;
  const value = source.dataset.editFormat === 'html' ? source.innerHTML : source.textContent;
  document.querySelectorAll(`[data-edit-key="${CSS.escape(key)}"]`).forEach(element => {
    if (element === source) return;
    if (element.dataset.editFormat === 'html') element.innerHTML = value;
    else element.textContent = source.textContent;
  });
  refreshDerivedLinks();
  setEditorStatus('正在记录修改…');
  clearTimeout(contentSaveTimer);
  contentSaveTimer = setTimeout(saveEditableContent, 450);
}

function saveEditableContent() {
  if (!ownerModeEnabled) return;
  localStorage.setItem(STORAGE_KEYS.content, JSON.stringify(collectEditableContent()));
  setEditorStatus('已保存到当前浏览器');
}

function toggleEditMode(forceState) {
  if (!ownerModeEnabled) return;

  editModeEnabled = typeof forceState === 'boolean' ? forceState : !editModeEnabled;
  document.body.classList.toggle('edit-mode', editModeEnabled);
  document.getElementById('editorPanel').hidden = !editModeEnabled;
  document.getElementById('editModeLabel').textContent = editModeEnabled ? '正在编辑' : '玉简编辑';
  document.querySelectorAll('[data-edit-key]').forEach(element => {
    element.contentEditable = editModeEnabled ? 'true' : 'false';
    element.spellcheck = false;
  });
  if (!editModeEnabled) {
    saveAllSiteData(false);
    document.getSelection()?.removeAllRanges();
  } else {
    document.getElementById('wallpaperReveal')?.classList.remove('is-active');
    showToast('编辑模式已开启：点击虚线文字即可修改');
  }
}

function saveAllSiteData(showMessage = true) {
  if (!ownerModeEnabled) return;

  saveEditableContent();
  saveProjects();
  saveSkills();
  saveJourneys();
  if (showMessage) showToast('身份玉简已全部保存');
}

function exportSiteData() {
  if (!ownerModeEnabled) return;

  const backup = buildSiteBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `青竹小轩-身份玉简备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  showToast('备份文件已导出，请妥善保存');
}

function buildSiteBackup() {
  saveAllSiteData(false);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    site: '青竹小轩身份玉简',
    data: {
      content: readStoredJSON(STORAGE_KEYS.content, {}),
      projects: readStoredJSON(STORAGE_KEYS.projects, []),
      skills: readStoredJSON(STORAGE_KEYS.skills, {}),
      journeys: readStoredJSON(STORAGE_KEYS.journeys, []),
      portrait: localStorage.getItem(STORAGE_KEYS.portrait),
      portraitSource: localStorage.getItem(STORAGE_KEYS.portraitSource),
      theme: localStorage.getItem(STORAGE_KEYS.theme)
    }
  };
}

async function importSiteData(event) {
  if (!ownerModeEnabled) return;

  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    const backup = JSON.parse(await file.text());
    if (!backup?.data || !backup.version) throw new Error('备份结构不正确');
    const data = backup.data;
    if (data.content) localStorage.setItem(STORAGE_KEYS.content, JSON.stringify(data.content));
    if (data.projects) localStorage.setItem(STORAGE_KEYS.projects, JSON.stringify(data.projects));
    if (data.skills) localStorage.setItem(STORAGE_KEYS.skills, JSON.stringify(data.skills));
    if (data.journeys) localStorage.setItem(STORAGE_KEYS.journeys, JSON.stringify(data.journeys));
    if (data.portrait) localStorage.setItem(STORAGE_KEYS.portrait, data.portrait);
    if (data.portraitSource) localStorage.setItem(STORAGE_KEYS.portraitSource, data.portraitSource);
    if (data.theme) localStorage.setItem(STORAGE_KEYS.theme, data.theme);
    showToast('备份导入成功，正在重新载入');
    setTimeout(() => window.location.reload(), 500);
  } catch (error) {
    alert(`无法导入备份：${error.message}`);
  }
}

function resetSiteData() {
  if (!ownerModeEnabled) return;

  if (!confirm('确定恢复默认内容？当前浏览器中的自定义文字、项目、技能、履历和照片都会清除。建议先导出备份。')) return;
  Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
  window.location.reload();
}

function refreshDerivedLinks() {
  const phone = document.querySelector('[data-edit-key="phoneValue"]')?.textContent.trim();
  const email = document.querySelector('[data-edit-key="emailValue"]')?.textContent.trim();
  const phoneLink = document.querySelector('[data-contact-type="phone"]');
  const emailLink = document.querySelector('[data-contact-type="email"]');
  if (phoneLink && phone) phoneLink.href = `tel:${phone.replace(/\s/g, '')}`;
  if (emailLink && email) emailLink.href = `mailto:${email}`;
}

function setEditorStatus(message) {
  const status = document.getElementById('editorSaveStatus');
  if (status) status.textContent = message;
}

function showToast(message) {
  const toast = document.getElementById('siteToast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]);
}

function escapeAttribute(value = '') {
  return escapeHTML(value).replace(/`/g, '&#96;');
}

// ==================== 联系表单 ====================

function handleSubmit(event) {
  event.preventDefault();
  const name = event.target.name.value.trim();
  const senderEmail = event.target.email.value.trim();
  const message = event.target.message.value.trim();
  const receiver = document.querySelector('[data-edit-key="emailValue"]')?.textContent.trim();
  if (!receiver) {
    alert('请先在玉简编辑模式中填写联系邮箱。');
    return;
  }
  const subject = encodeURIComponent(`个人网站传音：${name}`);
  const body = encodeURIComponent(`称呼：${name}\n回复邮箱：${senderEmail}\n\n${message}`);
  window.location.href = `mailto:${receiver}?subject=${subject}&body=${body}`;
  showToast('已打开本机邮箱应用，请确认后发送');
}

// ==================== 主题切换 ====================

(function loadSavedTheme() {
  if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
})();

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    localStorage.setItem(STORAGE_KEYS.theme, 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem(STORAGE_KEYS.theme, 'dark');
  }
}

// ==================== 头像上传与显示 ====================

const portraitCropState = {
  image: null,
  zoom: 1,
  rotation: 0,
  offsetX: 0,
  offsetY: 0,
  dragging: false,
  lastX: 0,
  lastY: 0
};

async function handlePortraitUpload(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    alert('请选择 JPG、PNG、WebP 等图片文件。');
    return;
  }
  if (file.size > 20 * 1024 * 1024) {
    alert('图片文件过大，请选择 20MB 以内的照片。');
    return;
  }

  try {
    const originalData = await fileToDataURL(file);
    const sourceData = await compressImageSource(originalData, 1800, 0.9);
    try {
      localStorage.setItem(STORAGE_KEYS.portraitSource, sourceData);
    } catch (error) {
      console.warn('原始照片较大，只保存最终裁切结果。', error);
      localStorage.removeItem(STORAGE_KEYS.portraitSource);
    }
    await loadPortraitIntoCropper(sourceData);
    openModal('portrait-modal');
  } catch (error) {
    alert(`无法读取照片：${error.message}`);
  }
}

function showPortrait(src) {
  const img = document.getElementById('portraitImg');
  const placeholder = document.getElementById('portraitPlaceholder');
  if (img && placeholder) {
    img.src = src;
    img.hidden = false;
    placeholder.hidden = true;
  }
}

function fileToDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('文件读取失败'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片解码失败'));
    image.src = src;
  });
}

async function compressImageSource(src, maxDimension, quality) {
  const image = await loadImage(src);
  const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

function initPortraitCropper() {
  const canvas = document.getElementById('portraitCropCanvas');
  const zoom = document.getElementById('portraitZoom');
  if (!canvas || !zoom) return;

  zoom.addEventListener('input', () => {
    portraitCropState.zoom = Number(zoom.value);
    drawPortraitCrop();
  });

  canvas.addEventListener('pointerdown', event => {
    if (!portraitCropState.image) return;
    portraitCropState.dragging = true;
    portraitCropState.lastX = event.clientX;
    portraitCropState.lastY = event.clientY;
    canvas.setPointerCapture(event.pointerId);
  });

  canvas.addEventListener('pointermove', event => {
    if (!portraitCropState.dragging) return;
    const rect = canvas.getBoundingClientRect();
    const factorX = canvas.width / rect.width;
    const factorY = canvas.height / rect.height;
    portraitCropState.offsetX += (event.clientX - portraitCropState.lastX) * factorX;
    portraitCropState.offsetY += (event.clientY - portraitCropState.lastY) * factorY;
    portraitCropState.lastX = event.clientX;
    portraitCropState.lastY = event.clientY;
    drawPortraitCrop();
  });

  const stopDragging = event => {
    portraitCropState.dragging = false;
    if (event.pointerId !== undefined && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
  };
  canvas.addEventListener('pointerup', stopDragging);
  canvas.addEventListener('pointercancel', stopDragging);
}

async function openPortraitEditor() {
  const source = localStorage.getItem(STORAGE_KEYS.portraitSource) || localStorage.getItem(STORAGE_KEYS.portrait);
  if (!source) {
    document.getElementById('portraitInput').click();
    return;
  }
  await loadPortraitIntoCropper(source);
  openModal('portrait-modal');
}

async function loadPortraitIntoCropper(src) {
  portraitCropState.image = await loadImage(src);
  resetPortraitCrop();
}

function resetPortraitCrop() {
  portraitCropState.zoom = 1;
  portraitCropState.rotation = 0;
  portraitCropState.offsetX = 0;
  portraitCropState.offsetY = 0;
  const zoom = document.getElementById('portraitZoom');
  if (zoom) zoom.value = '1';
  drawPortraitCrop();
}

function rotatePortrait(degrees) {
  portraitCropState.rotation = (portraitCropState.rotation + degrees + 360) % 360;
  portraitCropState.offsetX = 0;
  portraitCropState.offsetY = 0;
  drawPortraitCrop();
}

function getPortraitBaseScale(canvas, image, rotation) {
  const quarterTurn = Math.abs(rotation % 180) === 90;
  const rotatedWidth = quarterTurn ? image.naturalHeight : image.naturalWidth;
  const rotatedHeight = quarterTurn ? image.naturalWidth : image.naturalHeight;
  return Math.max(canvas.width / rotatedWidth, canvas.height / rotatedHeight);
}

function drawPortraitCrop() {
  const canvas = document.getElementById('portraitCropCanvas');
  const image = portraitCropState.image;
  if (!canvas || !image) return;
  const context = canvas.getContext('2d');
  const baseScale = getPortraitBaseScale(canvas, image, portraitCropState.rotation);
  const scale = baseScale * portraitCropState.zoom;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#E8E0D0';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.save();
  context.translate(canvas.width / 2 + portraitCropState.offsetX, canvas.height / 2 + portraitCropState.offsetY);
  context.rotate(portraitCropState.rotation * Math.PI / 180);
  context.scale(scale, scale);
  context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);
  context.restore();
}

function savePortraitCrop() {
  const canvas = document.getElementById('portraitCropCanvas');
  if (!canvas || !portraitCropState.image) return;
  const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
  try {
    localStorage.setItem(STORAGE_KEYS.portrait, dataUrl);
    showPortrait(dataUrl);
    closeModal('portrait-modal');
    showToast('个人照片构图已保存');
  } catch (error) {
    alert('照片保存失败，浏览器存储空间可能不足。请换一张尺寸更小的照片。');
  }
}

// ==================== 壁纸悬停揭示效果（Mimo-style） ====================

(function initWallpaperReveal() {
  const layer = document.getElementById('wallpaperReveal');
  if (!layer) return;

  const protectedTextSelector = [
    'h1', 'h2', 'h3', 'p', 'span', 'a', 'button',
    'label', 'input', 'textarea', 'select'
  ].join(',');

  let pointerX = window.innerWidth / 2;
  let pointerY = window.innerHeight / 2;
  let animationFrame = null;

  const renderPointer = () => {
    layer.style.setProperty('--reveal-x', pointerX + 'px');
    layer.style.setProperty('--reveal-y', pointerY + 'px');
    layer.classList.toggle('is-bottom', pointerY >= window.innerHeight / 2);
    animationFrame = null;
  };

  const handlePointerMove = (event) => {
    if (event.pointerType && event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
    if (editModeEnabled) {
      layer.classList.remove('is-active');
      return;
    }
    pointerX = event.clientX;
    pointerY = event.clientY;
    layer.classList.add('is-active');
    layer.classList.toggle(
      'is-text-protected',
      event.target instanceof Element && Boolean(event.target.closest(protectedTextSelector))
    );

    if (animationFrame === null) {
      animationFrame = window.requestAnimationFrame(renderPointer);
    }
  };

  const hideWallpaper = () => {
    layer.classList.remove('is-active', 'is-text-protected');
  };

  window.addEventListener('pointermove', handlePointerMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', hideWallpaper);
  window.addEventListener('blur', hideWallpaper);
})();
