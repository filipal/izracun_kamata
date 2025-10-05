document.addEventListener("DOMContentLoaded", function () {
    const article = document.querySelector("article.type-widget");
    const toggleButtons = document.querySelectorAll(".triggerFocusMode");
    const focusIndicator = document.getElementById("focusModeIndicator");

    if (!article) return;

    // Gumb za fokus mod (ulaz i izlaz)
    document.addEventListener("click", function (event) {
        const trigger = event.target.closest('[data-toggle="focus-mode"]');
        if (!trigger) return;

        const isFocused = article.hasAttribute("data-focus-mode");

        if (!isFocused) {
            article.setAttribute("data-focus-mode", "");
            document.getElementById("calculation-result")?.scrollIntoView({ behavior: "smooth", block: "start" });
        
            if (focusIndicator) {
                focusIndicator.hidden = false;
            }
        } else {
            article.removeAttribute("data-focus-mode");
            window.scrollTo({ top: 0, behavior: "smooth" });
        
            if (focusIndicator) {
                focusIndicator.hidden = true;
            }
        }
        // 🔁 Zamijeni prikaz gumba
        toggleButtons.forEach(btn => {
            const isOpen = btn.getAttribute("aria-label") === "Otvori puni zaslon";
            btn.hidden = isFocused ? !isOpen : isOpen;
        });
    });

    // Pritiskom ESC tipke izlazak iz fokus moda
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && article.hasAttribute("data-focus-mode")) {
            article.removeAttribute("data-focus-mode");
            toggleButtons.forEach(btn => {
                const isOpen = btn.getAttribute("aria-label") === "Otvori puni zaslon";
                btn.hidden = !isOpen;
            });
            if (focusIndicator) {
                focusIndicator.hidden = true;
            }
            window.scrollTo({ top: 0, behavior: "smooth" });
        }
    });
});
