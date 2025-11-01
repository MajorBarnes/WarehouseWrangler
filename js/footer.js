const START_YEAR = 2024;
const SUPPORT_EMAIL = 'support@threegents.biz';
const yearElements = document.querySelectorAll('[data-footer-year]');
const footerRoot = document.querySelector('.site-footer');
const DEFAULT_COPY_MESSAGES = {
    success: 'Support email copied to the clipboard.',
    failure: 'Unable to copy the support email. Please copy it manually.',
};

const translateFooter = (key, fallback) => {
    const i18n = window.I18n;
    if (i18n && typeof i18n.t === 'function') {
        return i18n.t(key, null, { defaultValue: fallback });
    }

    return fallback;
};

const updateSupportFeedback = (section, key, fallback) => {
    if (!section) {
        return;
    }

    const feedback = section.querySelector('.site-footer__support-feedback');
    if (!feedback) {
        return;
    }

    feedback.textContent = translateFooter(key, fallback);
    feedback.setAttribute('data-message-key', key);
};

const refreshSupportFeedback = () => {
    if (!footerRoot) {
        return;
    }

    const feedbackElements = footerRoot.querySelectorAll('.site-footer__support-feedback');
    feedbackElements.forEach((feedback) => {
        const key = feedback.getAttribute('data-message-key');
        if (!key) {
            return;
        }

        const fallback = key === 'app.footer.copySuccess'
            ? DEFAULT_COPY_MESSAGES.success
            : DEFAULT_COPY_MESSAGES.failure;

        feedback.textContent = translateFooter(key, fallback);
    });
};

const copySupportEmail = async () => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        try {
            await navigator.clipboard.writeText(SUPPORT_EMAIL);
            return true;
        } catch (error) {
            // Fallback to manual copy below when clipboard API fails.
        }
    }

    const textarea = document.createElement('textarea');
    const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    textarea.value = SUPPORT_EMAIL;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    textarea.style.opacity = '0';

    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    let copied = false;

    try {
        copied = document.execCommand('copy');
    } catch (error) {
        copied = false;
    }

    textarea.remove();

    if (activeElement && typeof activeElement.focus === 'function') {
        activeElement.focus();
    }

    return copied;
};

const renderFooterYear = () => {
    if (yearElements.length === 0 || !window.I18n || typeof window.I18n.t !== 'function') {
        return;
    }

    const currentYear = new Date().getFullYear();
    const hasRange = currentYear > START_YEAR;
    const translationKey = hasRange ? 'app.footer.yearRange' : 'app.footer.singleYear';
    const replacements = hasRange
        ? { startYear: START_YEAR, endYear: currentYear }
        : { year: START_YEAR };
    const yearLabel = window.I18n.t(translationKey, replacements);

    yearElements.forEach((element) => {
        element.textContent = yearLabel;
        element.setAttribute('data-current-year', String(currentYear));
    });
};

renderFooterYear();

if (window.I18n && typeof window.I18n.onChange === 'function') {
    window.I18n.onChange(() => {
        renderFooterYear();
        refreshSupportFeedback();
    });
}

if (footerRoot) {
    footerRoot.addEventListener('click', (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
            return;
        }

        const button = target.closest('.site-footer__copy-email');
        if (!button) {
            return;
        }

        event.preventDefault();

        const supportSection = button.closest('.site-footer__support');

        copySupportEmail()
            .then((copied) => {
                const key = copied ? 'app.footer.copySuccess' : 'app.footer.copyFailure';
                const fallback = copied ? DEFAULT_COPY_MESSAGES.success : DEFAULT_COPY_MESSAGES.failure;
                updateSupportFeedback(supportSection, key, fallback);
            })
            .catch(() => {
                updateSupportFeedback(supportSection, 'app.footer.copyFailure', DEFAULT_COPY_MESSAGES.failure);
            });
    });
}
