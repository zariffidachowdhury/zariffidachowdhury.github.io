/* theme.js: applies a saved day/night choice before first paint. With no
   saved choice the page follows the system setting through CSS alone. */
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {}
})();
