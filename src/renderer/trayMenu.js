const menu = document.getElementById('menu');
let items = [];
let active = -1;

function render() {
  menu.replaceChildren(
    ...items.map((it, i) => {
      const li = document.createElement('li');
      if (it.sep) {
        li.className = 'sep';
        return li;
      }
      li.className = 'item' + (it.danger ? ' danger' : '') + (i === active ? ' active' : '');
      li.innerHTML = '<span class="check"></span><span class="label"></span><span class="accel"></span>';
      li.children[0].textContent = it.checked ? '✓' : '';
      li.children[1].textContent = it.label;
      li.children[2].textContent = it.accel || '';
      li.addEventListener('mouseenter', () => setActive(i));
      li.addEventListener('click', () => window.trayMenu.select(it.id));
      return li;
    })
  );
}

function setActive(i) {
  active = i;
  [...menu.children].forEach((li, k) => li.classList.toggle('active', k === i));
}

function move(dir) {
  const n = items.length;
  let i = active;
  for (let step = 0; step < n; step++) {
    i = (i + dir + n) % n;
    if (!items[i].sep) return setActive(i);
  }
}

window.trayMenu.onItems((list) => {
  items = list;
  active = -1;
  render();
});

menu.addEventListener('mouseleave', () => setActive(-1));

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') window.trayMenu.close();
  else if (e.key === 'ArrowDown') move(1);
  else if (e.key === 'ArrowUp') move(-1);
  else if (e.key === 'Enter' && items[active] && !items[active].sep) window.trayMenu.select(items[active].id);
});
