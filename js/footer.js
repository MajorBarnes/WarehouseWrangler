const START_YEAR = 2024;
const yearElements = document.querySelectorAll('[data-footer-year]');

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
    window.I18n.onChange(renderFooterYear);
}
