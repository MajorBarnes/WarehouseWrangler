(function () {
    function ready(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else {
            fn();
        }
    }

    ready(function () {
        const header = document.querySelector('[data-site-header]');
        if (!header) {
            return;
        }

        const nav = header.querySelector('[data-primary-nav]');
        const navToggle = header.querySelector('[data-nav-toggle]');
        const importsItem = header.querySelector('[data-imports]');
        const importsToggle = header.querySelector('[data-imports-toggle]');
        const userMenu = header.querySelector('[data-user-menu]');
        const userTrigger = header.querySelector('[data-user-menu-trigger]');

        const closeNav = () => {
            if (!nav) {
                return;
            }
            nav.classList.remove('is-open');
            if (navToggle) {
                navToggle.setAttribute('aria-expanded', 'false');
            }
        };

        const closeImportsMenu = () => {
            if (!importsItem || !importsToggle) {
                return;
            }
            importsItem.classList.remove('nav-item--open');
            importsToggle.setAttribute('aria-expanded', 'false');
        };

        const closeUserMenu = () => {
            if (!userMenu || !userTrigger) {
                return;
            }
            userMenu.classList.remove('is-open');
            userTrigger.setAttribute('aria-expanded', 'false');
        };

        if (navToggle && nav) {
            navToggle.addEventListener('click', () => {
                const isOpen = nav.classList.toggle('is-open');
                navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

                if (!isOpen) {
                    closeImportsMenu();
                    closeUserMenu();
                }
            });
        }

        if (importsItem && importsToggle) {
            const expanded = importsToggle.getAttribute('aria-expanded') === 'true';
            if (expanded) {
                importsItem.classList.add('nav-item--open');
            }

            importsToggle.addEventListener('click', () => {
                const willOpen = !importsItem.classList.contains('nav-item--open');
                importsItem.classList.toggle('nav-item--open', willOpen);
                importsToggle.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
        }

        if (userMenu && userTrigger) {
            userTrigger.addEventListener('click', () => {
                const willOpen = !userMenu.classList.contains('is-open');
                userMenu.classList.toggle('is-open', willOpen);
                userTrigger.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
            });
        }

        if (nav) {
            nav.addEventListener('click', (event) => {
                const target = event.target;
                if (target instanceof HTMLElement && target.closest('a')) {
                    closeNav();
                    closeImportsMenu();
                    closeUserMenu();
                }
            });
        }

        document.addEventListener('click', (event) => {
            const target = event.target;

            if (nav && nav.classList.contains('is-open') && navToggle && target instanceof Node) {
                if (!nav.contains(target) && !navToggle.contains(target)) {
                    closeNav();
                }
            }

            if (importsItem && importsItem.classList.contains('nav-item--open') && target instanceof Node) {
                if (!importsItem.contains(target)) {
                    closeImportsMenu();
                }
            }

            if (userMenu && userMenu.classList.contains('is-open') && target instanceof Node) {
                if (!userMenu.contains(target)) {
                    closeUserMenu();
                }
            }
        });

        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                closeNav();
                closeImportsMenu();
                closeUserMenu();
            }
        });

        const mobileQuery = window.matchMedia('(max-width: 960px)');
        const handleQueryChange = (query) => {
            if (!query.matches) {
                closeNav();
            }
        };

        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener('change', handleQueryChange);
        } else if (mobileQuery.addListener) {
            mobileQuery.addListener(handleQueryChange);
        }
    });
})();
