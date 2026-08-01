const navItems = document.querySelectorAll('[data-view]');
const views = document.querySelectorAll('.view-panel');
const breadcrumb = document.querySelector('#breadcrumb-current');
const labels = { overview: '总览', timeline: '时间线', today: '今日任务', review: '待复习', notes: '学习记录', settings: '设置' };

function showView(viewName) {
  views.forEach((view) => view.classList.toggle('is-visible', view.id === `view-${viewName}`));
  document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('is-active', item.dataset.view === viewName));
  breadcrumb.textContent = labels[viewName] || '总览';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

navItems.forEach((item) => item.addEventListener('click', () => showView(item.dataset.view)));

const toast = document.querySelector('#toast');
const toastCopy = document.querySelector('#toast-copy');
let toastTimer;
function showToast(message) {
  toastCopy.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
}

document.querySelectorAll('.filter-button').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('.filter-button').forEach((item) => item.classList.remove('is-active'));
    button.classList.add('is-active');
    document.querySelectorAll('.timeline-item').forEach((item) => {
      item.hidden = button.dataset.filter !== 'all' && item.dataset.status !== button.dataset.filter;
    });
  });
});

const overall = document.querySelector('#overall-progress');
const overallBar = document.querySelector('#overall-bar');
const tasks = [...document.querySelectorAll('.task-checkbox')];
const STORAGE_KEY = '408-atlas-today-v1';

function formatCompletionTime(date = new Date()) {
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function loadTaskState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    tasks.forEach((task) => {
      const state = saved[task.dataset.task];
      if (!state?.checked) return;
      task.checked = true;
      task.dataset.completedAt = state.completedAt;
      task.closest('.task-row').querySelector('.task-time').textContent = `完成 ${state.completedAt}`;
    });
  } catch {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function saveTaskState() {
  const state = Object.fromEntries(tasks.map((task) => [task.dataset.task, {
    checked: task.checked,
    completedAt: task.dataset.completedAt || null,
  }]));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function updateProgress() {
  const completed = tasks.filter((task) => task.checked).length;
  const value = 31 + completed * 2;
  overall.textContent = value;
  overallBar.style.width = `${value}%`;
  overallBar.parentElement.querySelector('i').style.left = `${value}%`;
  document.querySelector('.task-count').textContent = tasks.length - completed;
}
tasks.forEach((task) => task.addEventListener('change', () => {
  const timeLabel = task.closest('.task-row').querySelector('.task-time');
  if (task.checked) {
    task.dataset.completedAt = formatCompletionTime();
    timeLabel.textContent = `完成 ${task.dataset.completedAt}`;
  } else {
    delete task.dataset.completedAt;
    timeLabel.textContent = timeLabel.dataset.planned;
  }
  saveTaskState();
  updateProgress();
  showToast(task.checked ? '做得好，这一项已记入今天的进度' : '已恢复到今日任务');
}));

document.querySelector('#complete-next').addEventListener('click', () => {
  const next = tasks.find((task) => !task.checked);
  if (!next) return showToast('今天的三项任务都完成了，去休息一下吧');
  next.checked = true;
  next.dispatchEvent(new Event('change'));
});

const overlay = document.querySelector('#focus-overlay');
document.querySelector('#focus-button').addEventListener('click', () => {
  overlay.classList.add('is-open');
  overlay.setAttribute('aria-hidden', 'false');
});
document.querySelector('#dialog-close').addEventListener('click', () => {
  overlay.classList.remove('is-open');
  overlay.setAttribute('aria-hidden', 'true');
});
overlay.addEventListener('click', (event) => { if (event.target === overlay) document.querySelector('#dialog-close').click(); });
document.querySelector('#start-focus').addEventListener('click', () => {
  document.querySelector('#dialog-close').click();
  showToast('专注计时已开始，45 分钟后见');
});

document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && overlay.classList.contains('is-open')) document.querySelector('#dialog-close').click(); });

loadTaskState();
updateProgress();
