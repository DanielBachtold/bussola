// Aplica o tema escolhido antes da primeira pintura, sem piscar.
(function () {
  try {
    var t = localStorage.getItem('bussola-theme');
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t;
  } catch {}
})();
