(() => {
  'use strict';

  const storedTheme = localStorage.getItem('theme');
  const themeToggleBtn = document.getElementById('theme-toggle-btn');
  const themeIcon = document.getElementById('theme-icon'); // Get the icon element

  const getPreferredTheme = () => {
    if (storedTheme) {
      return storedTheme;
    }
    // Default to light if no system preference detected or if system prefers light
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  };

  const setTheme = (theme) => {
    if (theme === 'auto') {
        // Recalculate based on system preference
        theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }

    document.documentElement.setAttribute('data-bs-theme', theme);

    // Update the icon based on the theme *being set*
    if (themeIcon) {
        if (theme === 'dark') {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        } else {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
    }
  };

  // Set the initial theme on load
  const currentTheme = getPreferredTheme();
  setTheme(currentTheme);

  // Add event listener for the toggle button
  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const currentTheme = document.documentElement.getAttribute('data-bs-theme');
      const newTheme = currentTheme === 'light' ? 'dark' : 'light';
      localStorage.setItem('theme', newTheme); // Save the new preference
      setTheme(newTheme);
    });
  }

  // Optional: Listen for system theme changes if the user hasn't set an explicit preference
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    const storedTheme = localStorage.getItem('theme');
    if (!storedTheme) { // Only update if no explicit preference is stored
      setTheme(getPreferredTheme());
    }
  });

})();