(() => {
    const storedTheme = localStorage.getItem('theme');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const themeIcon = document.getElementById('theme-icon'); // Get the icon element

    const getPreferredTheme = () => {
        if (storedTheme) {
            return storedTheme;
        }
        // Default to light if no system preference detected or if system prefers light
        return window.matchMedia('(prefers-color-scheme: dark)').matches
            ? 'dark'
            : 'light';
    };

    const setTheme = (themeInput) => {
        let effectiveTheme = themeInput; // Use a local variable
        if (effectiveTheme === 'auto') {
            // Recalculate based on system preference
            effectiveTheme = window.matchMedia('(prefers-color-scheme: dark)')
                .matches
                ? 'dark'
                : 'light';
        }

        document.documentElement.setAttribute('data-bs-theme', effectiveTheme);

        // Update the icon based on the theme *being set*
        if (themeIcon) {
            if (effectiveTheme === 'dark') {
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
            const themeToSet =
                document.documentElement.getAttribute('data-bs-theme');
            const newTheme = themeToSet === 'light' ? 'dark' : 'light';
            localStorage.setItem('theme', newTheme); // Save the new preference
            setTheme(newTheme);
        });
    }

    // Optional: Listen for system theme changes if the user hasn't set an explicit preference
    window
        .matchMedia('(prefers-color-scheme: dark)')
        .addEventListener('change', () => {
            const newStoredTheme = localStorage.getItem('theme');
            if (!newStoredTheme) {
                // Only update if no explicit preference is stored
                setTheme(getPreferredTheme());
            }
        });
})();
