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

        const labelKeys = {
            nav: {
                open: 'app.header.navToggle.open',
                close: 'app.header.navToggle.close'
            },
            imports: {
                open: 'app.header.importsMenu.open',
                close: 'app.header.importsMenu.close'
            },
            user: {
                open: 'app.header.userMenu.open',
                close: 'app.header.userMenu.close'
            }
        };

        const translate = (key) => {
            if (!key) {
                return '';
            }

            const i18n = window.I18n;
            if (i18n && typeof i18n.t === 'function') {
                return i18n.t(key);
            }

            return key;
        };

        const applyAriaLabel = (element, key) => {
            if (!element) {
                return;
            }

            const label = translate(key);
            if (label !== undefined && label !== null) {
                element.setAttribute('aria-label', label);
            }
        };

        const updateNavToggleState = (isOpen) => {
            if (!navToggle) {
                return;
            }

            navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            applyAriaLabel(navToggle, isOpen ? labelKeys.nav.close : labelKeys.nav.open);
        };

        const updateImportsToggleState = (isOpen) => {
            if (!importsToggle) {
                return;
            }

            importsToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            applyAriaLabel(importsToggle, isOpen ? labelKeys.imports.close : labelKeys.imports.open);
        };

        const updateUserMenuState = (isOpen) => {
            if (!userTrigger) {
                return;
            }

            userTrigger.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            applyAriaLabel(userTrigger, isOpen ? labelKeys.user.close : labelKeys.user.open);
        };

        const refreshLocalizedLabels = () => {
            updateNavToggleState(nav ? nav.classList.contains('is-open') : false);
            updateImportsToggleState(importsItem ? importsItem.classList.contains('nav-item--open') : false);
            updateUserMenuState(userMenu ? userMenu.classList.contains('is-open') : false);
        };

        const closeNav = () => {
            if (!nav) {
                return;
            }
            nav.classList.remove('is-open');
            updateNavToggleState(false);
        };

        const closeImportsMenu = () => {
            if (!importsItem || !importsToggle) {
                return;
            }
            importsItem.classList.remove('nav-item--open');
            updateImportsToggleState(false);
        };

        const closeUserMenu = () => {
            if (!userMenu || !userTrigger) {
                return;
            }
            userMenu.classList.remove('is-open');
            updateUserMenuState(false);
        };

        if (navToggle && nav) {
            navToggle.addEventListener('click', () => {
                const isOpen = nav.classList.toggle('is-open');
                updateNavToggleState(isOpen);

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
            updateImportsToggleState(expanded);

            importsToggle.addEventListener('click', () => {
                const willOpen = !importsItem.classList.contains('nav-item--open');
                importsItem.classList.toggle('nav-item--open', willOpen);
                updateImportsToggleState(willOpen);
            });
        }

        if (userMenu && userTrigger) {
            updateUserMenuState(userMenu.classList.contains('is-open'));

            userTrigger.addEventListener('click', () => {
                const willOpen = !userMenu.classList.contains('is-open');
                userMenu.classList.toggle('is-open', willOpen);
                updateUserMenuState(willOpen);
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

        refreshLocalizedLabels();

        const i18n = window.I18n;
        if (i18n && typeof i18n.onChange === 'function') {
            i18n.onChange(() => {
                refreshLocalizedLabels();
            });
        }

        if (mobileQuery.addEventListener) {
            mobileQuery.addEventListener('change', handleQueryChange);
        } else if (mobileQuery.addListener) {
            mobileQuery.addListener(handleQueryChange);
        }
    });
})();
