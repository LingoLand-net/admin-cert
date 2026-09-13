/* Lingo‑Ville — shared nav bar */
(function () {
  const HTML = `
    <header class="bg-teal text-white shadow-md sticky top-0 z-20">
      <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
        <a href="index.html" class="flex items-center gap-2 group">
          <img src="logo.png" alt=""
               class="w-8 h-8 rounded-full bg-white p-0.5 group-hover:scale-105 transition"
               onerror="this.style.display='none'" />
          <span class="font-extrabold text-lg">Lingo<span class="text-orange-300">Ville</span></span>
          <span class="text-white/50 mx-1 hidden sm:inline">·</span>
          <span id="navPageName" class="text-sm text-white/80 hidden sm:inline"></span>
        </a>

        <nav class="flex items-center gap-1 sm:gap-2 text-sm">
          <a href="index.html" data-nav="dashboard"
             class="px-3 py-1.5 rounded-lg hover:bg-white/15 transition">Dashboard</a>
          <a href="admin.html" data-nav="upload"
             class="px-3 py-1.5 rounded-lg hover:bg-white/15 transition">Upload</a>
          <button id="navLogoutBtn"
                  class="px-3 py-1.5 rounded-lg hover:bg-white/15 transition text-white/80">Logout</button>
        </nav>
      </div>
    </header>
  `;

  function mount() {
    const host = document.getElementById('navMount');
    if (!host) return;
    host.innerHTML = HTML;

    const page = document.body.dataset.page || '';
    document.getElementById('navPageName').textContent =
      page === 'upload' ? 'Upload' : 'Dashboard';

    document.querySelectorAll('[data-nav]').forEach(a => {
      if (a.dataset.nav === page) a.classList.add('bg-white/20', 'font-semibold');
    });

    document.getElementById('navLogoutBtn')
      ?.addEventListener('click', () => window.LVAuth.logout());
  }

  document.addEventListener('DOMContentLoaded', mount);
})();