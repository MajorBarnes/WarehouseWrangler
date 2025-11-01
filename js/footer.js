const START_YEAR = 2024;
const currentYear = new Date().getFullYear();
const yearElements = document.querySelectorAll('[data-footer-year]');

if (yearElements.length > 0) {
    const yearLabel = currentYear > START_YEAR ? `${START_YEAR}\u2013${currentYear}` : `${START_YEAR}`;

    yearElements.forEach((element) => {
        element.textContent = yearLabel;
        element.setAttribute('data-current-year', String(currentYear));
    });
}
