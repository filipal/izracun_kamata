// Dohvaćanje kamata iz API-ja s error handlingom
let kamateCache = null;  // Keširanje podataka

async function dohvatiKamate() {
    if (kamateCache) return kamateCache; // Ako su već dohvaćene, koristi keširane podatke  

    try {
        let response = await fetch("/kamate");
        if (!response.ok) throw new Error(`Greška: ${response.statusText}`);

        let data = await response.json();
        kamateCache = data;  // Spremi u cache
        return data;
    } catch (error) {
        console.error("Greška pri dohvaćanju kamata:", error);
        return null;
    }
}


function parseDatum(datumStr) {
    let parts = datumStr.split(".");
    let dan = parts[0].padStart(2, "0"); 
    let mjesec = parts[1].padStart(2, "0");
    let godina = parts[2];
    return new Date(`${godina}-${mjesec}-${dan}`); // yyyy-mm-dd format
}

function formatirajDatum(datum) {
    if (!datum) return "";

    // Ako je već u dd.mm.yyyy formatu, ne diraj
    if (datum.includes(".") && datum.split(".")[0].length === 2) {
        return datum;
    }

    // Inače pretvori iz ISO formata
    const [godina, mjesec, dan] = datum.split("-");
    return `${dan}.${mjesec}.${godina}`;
}

function dohvatiValutu() {
    let currencyElement = document.getElementById("currency-list");
    if (!currencyElement) {
        console.warn("Element #currency-list nije pronađen! Koristi se default: EUR");
        return "EUR";
    }
    return currencyElement.value;
}



// Funkcija za generiranje HTML sadržaja za PDF
function generirajHtmlZaPdf(outputSection) {
    if (!outputSection) {
        console.error("Greška: Nema podataka za PDF.");
        return "";
    }

    // Kloniram outputSection kako ne bi mijenjala originalni DOM
    let tempDiv = outputSection.cloneNode(true);

    let taskbar = tempDiv.querySelector("#taskbar");
    if (taskbar) taskbar.remove();


    return `
    <!DOCTYPE html>
    <html lang="hr">
    <head>
        <meta charset="UTF-8">
        <title>Izračun kamata</title>
        <style>
            body { font-family: "Arial", sans-serif; font-size: 12pt; color: #3e474f; }
            table { width: 100%; border-collapse: collapse; }
            th, td { border: 1px solid black; padding: 8px; text-align: left; }
            th { background-color: #f2f2f2; font-weight: bold; }
            #taskbar, .taskbar { display: none; } /* Sakrij taskbar */
        </style>
    </head>
    <body>
        ${outputSection.outerHTML}
    </body>
    </html>
    `;
}


// Funkcija za prikaz PDF-a u novom tabu
function prikaziPDF() {
    console.log("Generiram PDF...");

    let outputSection = document.querySelector('[data-tabpanel="interest"]');
    if (!outputSection) {
        alert("Greška: Nema podataka za PDF.");
        return;
    }

    let htmlContent = generirajHtmlZaPdf(outputSection);

    fetch("/preuzmi_pdf?prikazi=true", { // Otvaranje u novom tabu
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlContent })
    })
    .then(response => response.blob())
    .then(blob => {
        let url = URL.createObjectURL(blob);
        window.open(url, "_blank"); // Otvori PDF u novom tabu
    })
    .catch(error => console.error("Greška kod generiranja PDF-a:", error));
}

// Funkcija za preuzimanje PDF-a
function preuzmiPDF(event) {
    console.log("Klik na gumb za preuzimanje PDF-a!");

    if (event) {
        event.preventDefault();
        event.stopPropagation();
    }

    let outputSection = document.querySelector('[data-tabpanel="interest"]');
    if (!outputSection) {
        alert("Greška: Nema podataka za PDF.");
        return;
    }

    let htmlContent = generirajHtmlZaPdf(outputSection);

    let timestamp = new Date().getTime(); // Sprječavam keširanje

    fetch(`/preuzmi_pdf?prikazi=false&timestamp=${timestamp}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ html: htmlContent })
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        return response.blob();
    })
    .then(blob => {
        console.log("Generiran PDF blob:", blob);
        
        let url = URL.createObjectURL(blob);
        let a = document.createElement("a");
        a.href = url;
        a.download = "izracun.pdf"; 
        document.body.appendChild(a);

        setTimeout(() => {
            a.click();
        }, 100); // Dodajem malo kašnjenja prije klika

        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 1000);
    })
    .catch(error => console.error("Greška kod preuzimanja PDF-a:", error));

    return false;
}


// Globalna referenca na event handler
function handlePdfClick(event) {
    if (event.target.closest("[data-generate='pdf']")) {
        prikaziPDF();
    }
    if (event.target.closest("[data-download='pdf']")) {
        preuzmiPDF(event);
    }
}

// Funkcija za ponovno postavljanje event listenera za PDF
function dodajEventListenereZaPDF() {
    console.log("Ponovno postavljam event listenere za PDF gumbe...");

    // Ukloni postojeći listener (koristim istu referencu na funkciju)
    document.removeEventListener("click", handlePdfClick);
    
    // Ponovno dodaj listener
    document.addEventListener("click", handlePdfClick);
}

// Inicijalizacija event listenera pri učitavanju stranice
dodajEventListenereZaPDF();


// Globalna referenca na event handler
function handleCSVClick(event) {
    if (event.target.closest("[data-download='csv']")) {
        preuzmiCSV(event);
    }
}

// Funkcija za ponovno postavljanje event listenera za CSV
function dodajEventListenereZaCSV() {
    console.log("Ponovno postavljam event listenere za CSV gumbe...");

    // Ukloni postojeći listener (koristim istu referencu na funkciju)
    document.removeEventListener("click", handleCSVClick);
    
    // Ponovno dodaj listener
    document.addEventListener("click", handleCSVClick);
}

// Inicijalizacija event listenera pri učitavanju stranice
dodajEventListenereZaCSV();



function generirajCSV() {
    console.log("Funkcija generirajCSV() pozvana!");

    let table = document.querySelector("table[data-table='interests-detailed']");
    if (!table) {
        console.error("Tablica nije pronađena!");
        return;
    }
    
    console.log("Tablica pronađena:", table);

    let tbody = table.querySelector("tbody");

    if (!tbody || tbody.children.length === 0) {
        console.warn("`tbody` postoji, ali nema redova!");
        return;
    }

    let rows = tbody.querySelectorAll("tr");
    console.log("Broj redova u `tbody` tablici:", rows.length);

    rows.forEach((row, index) => {
        console.log(`Red ${index}:`, row.innerHTML); // Dodano za provjeru!
    });

    let csvContent = "data:text/csv;charset=utf-8,";
    let separator = ";";

    // 1 Zaglavlja iz thead
    let headers = Array.from(table.querySelectorAll("thead th")).map(th => th.innerText.trim());
    console.log("Zaglavlja CSV-a:", headers);
    csvContent += headers.join(separator) + "\n";

    // 2 Dodaj redove iz tbody
    rows.forEach((row, index) => {
        let cells = Array.from(row.querySelectorAll("td")).map(td => td.innerText.trim());
        console.log(`Podaci iz reda ${index + 1}:`, cells);
        csvContent += cells.join(separator) + "\n";
    });

    // 3 Kreiraj preuzimanje CSV-a
    let encodedUri = encodeURI(csvContent);
    let link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "izracun_kamata.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log("CSV generiran i preuzet.");
}


function dodajDropdownZaGodine(instance, retries = 5) {
    if (!instance.config || !instance.config.minDate) {
        if (retries > 0) {
            setTimeout(() => dodajDropdownZaGodine(instance, retries - 1), 50);
        } else {
            console.warn("Nije uspjelo dohvatiti minDate nakon više pokušaja.");
        }
        return;
    }

    let minGodina = new Date(instance.config.minDate).getFullYear();
    let maxGodina;
    if (instance.config.maxDate) {
        maxGodina = new Date(instance.config.maxDate).getFullYear();
    } else {
        let trenutnaGodina = instance.currentYear || new Date().getFullYear();
        let referentnaGodina = Math.max(trenutnaGodina, new Date().getFullYear());
        maxGodina = referentnaGodina + 100;
    }
    let trenutnaGodina = instance.currentYear;

    // Pronađi postojeći custom dropdown ako postoji i ukloni ga (sprječava duplikate)
    let existingDropdown = instance.calendarContainer.querySelector(".flatpickr-monthDropdown-months.custom-select");
    if (existingDropdown) {
        existingDropdown.remove();
    }

    // Kreiraj <select> element za odabir godine
    let selectGodina = document.createElement("select");
    selectGodina.classList.add("flatpickr-monthDropdown-months", "custom-select");

    // Popuni opcije godina u padajućem izborniku
    for (let godina = minGodina; godina <= maxGodina; godina++) {
        let opcija = document.createElement("option");
        opcija.value = godina;
        opcija.textContent = godina;
        if (godina === trenutnaGodina) {
            opcija.selected = true;
        }
        selectGodina.appendChild(opcija);
    }

    // Sakrij originalni Flatpickr unos godine
    let originalniUnos = instance.currentYearElement;
    if (originalniUnos) {
        originalniUnos.style.display = "none";

        // Dodaj novi dropdown umjesto starog
        originalniUnos.after(selectGodina);
    }

    // Promjena godine mijenja datum u Flatpickr-u
    selectGodina.addEventListener("change", function () {
        instance.currentYear = parseInt(this.value);
        instance.redraw();
    });
}

function azurirajGodinu(instance) {
    let selectGodina = instance.calendarContainer.querySelector(".flatpickr-yearDropdown");
    if (selectGodina) {
        selectGodina.value = instance.currentYear;
    }
}

// Funkcija za dodavanje event listenera za decimalne brojeve
function addDecimalFormatForInputs(entry) {
    // Dodaj event listener za .js-with-decimals unutar novog računa
    const fieldsWithDecimals = entry.querySelectorAll(".js-with-decimals");
    fieldsWithDecimals.forEach((field) => {
        field.addEventListener("change", function () {
            formatDecimalInput(field);
        });

        // Opcionalno: odmah formatiraj broj prilikom učitavanja
        formatDecimalInput(field);
    });
}

// Funkcija za formatiranje broja na 2 decimalna mjesta
function formatDecimalInput(inputElement) {
    let value = inputElement.value.trim();

    // Dozvoli samo brojeve, decimalni zarez i točku
    value = value.replace(/[^0-9.,-]/g, '');

    // Ako sadrži zarez, zamijeni ga točkom
    value = value.replace(',', '.');

    // Sprječavanje više od jedne točke u broju
    let parts = value.split('.');
    if (parts.length > 2) {
        value = parts[0] + '.' + parts.slice(1).join(''); // Zadrži samo prvu točku
    }

    // Pretvori u broj
    let numberValue = parseFloat(value);

    // Ako je broj ispravan, formatiraj na 2 decimale
    if (!isNaN(numberValue)) {
        inputElement.value = numberValue.toFixed(2);
    } else {
        inputElement.value = ""; // Prazno polje ako unos nije valjan broj
    }
}

function addDecimalFormatForInputs(container) {
    // Pronađi sva polja unutar container koja trebaju decimalni unos
    let fieldsWithDecimals = container.querySelectorAll(".js-with-decimals, ._amount input");

    fieldsWithDecimals.forEach((input) => {
        // Postavi type="text" i inputmode="decimal" kako bi izbjegli probleme s number tipom
        input.setAttribute("type", "text");
        input.setAttribute("inputmode", "decimal");

        // Omogući unos samo brojeva, točke i zareza
        input.addEventListener("input", function () {
            let rawValue = this.value.replace(/[^0-9.,-]/g, ''); // Dozvoli samo brojeve, zarez i točku
            this.value = rawValue;
        });

        // Formatiraj broj TEK nakon što korisnik završi unos
        input.addEventListener("blur", function () {
            formatDecimalInput(this);
        });
    });
}


function izvuciPeriod(opis) {
    let regex = /(\d{2}\.\d{2}\.\d{4}) - (\d{2}\.\d{2}\.\d{4})/;  // Regex za prepoznavanje perioda
    let match = opis.match(regex);
    
    if (match) {
        let period_long = `${match[1]} - ${match[2]}`;  // Dugi format: dd.mm.yyyy - dd.mm.yyyy
        let period_short = `${match[1].slice(0, 5)} - ${match[2].slice(0, 5)}`;  // Kratki format: dd.mm - dd.mm
        
        return { period_long, period_short };
    } 

    return { period_long: "N/A", period_short: "N/A" };
}

// Definiraj funkciju globalno (izvan DOMContentLoaded)
async function osvjeziBrojIzracuna() {
    try {
        console.log("Dohvaćam broj izračuna...");
        let response = await fetch("/izracuni_broj");
        let data = await response.json();
        let brojIzracuna = data.broj_izracuna;

        console.log("Broj izračuna:", brojIzracuna);

        let buttonCounter = document.getElementById("buttonCounter");
        if (buttonCounter) {
            buttonCounter.textContent = brojIzracuna;
        } else {
            console.warn("Element #buttonCounter nije pronađen u DOM-u!");
        }
    } catch (error) {
        console.error("Greška pri dohvaćanju broja izračuna:", error);
    }
}


document.addEventListener("DOMContentLoaded", function () {
    console.log("DOM potpuno učitan - dodajem event listenere za decimalne unose.");
    console.log("DOM potpuno učitan! Prikupljam vjerovnika i dužnika...");

    // Dodaj event listenere za decimalne in. pri učitavanju stranice
    addDecimalFormatForInputs(document);

    osvjeziBrojIzracuna()
    inicijalizirajLinkZaMoratorij();
    inicijalizirajSveModale();
    popuniFormuIzracunom();

    const path = window.location.pathname.replace(/\/$/, "");

    const pickerButton = document.getElementById("calculationPicker");
    const pickerLabel = document.querySelector("#calculationName");
    const listLink = document.querySelector('a[href="/izracuni"].button--secondary');

    // Dohvati aktivni naziv iz data-naziv atributa
    const aktivniNaziv = pickerLabel?.dataset?.naziv || "Novi izračun";

    if (pickerLabel) {
        pickerLabel.textContent = aktivniNaziv; // Postavi naziv u gumb
        postaviAktivanIzracun(aktivniNaziv); // Postavi kvačicu u dropdown
    }

    // Osvježi klasu is-active ovisno o ruti
    pickerButton?.classList.remove("is-active");
    listLink?.classList.remove("is-active");

    if (path === "/izracuni") {
        listLink?.classList.add("is-active");
    } else {
        pickerButton?.classList.add("is-active");
    }


    let deleteButtons = document.querySelectorAll("button[data-id]");

    deleteButtons.forEach(button => {
        button.addEventListener("click", function (event) {
            event.preventDefault();

            let izracunId = this.getAttribute("data-id");
            let modal = document.getElementById("modal");
            let hiddenInput = document.getElementById("deleteCalculationId");
            let deleteForm = document.getElementById("deleteForm");
            
            if (!izracunId) {
                console.error("Greška: ID izračuna nije ispravan!", izracunId);
                return;
            }

            if (modal && hiddenInput && deleteForm) {
                hiddenInput.value = izracunId;  // Postavi ID u skriveno polje
                deleteForm.action = `/obrisi_izracun/${izracunId}`;  // Ažuriraj formu

                // Otvori modal pravilno
                modal.style.display = "block";
                modal.classList.add("open");

                // Ako koristim Bootstrap modal:
                if (typeof $ !== "undefined") {
                    $("#modal").modal("show");
                }
            } else {
                console.error("Modal, hidden input ili forma nisu pronađeni!");
            }
        });
    });

    // Zatvaranje modala kada kliknem "Odustani"
    let closeModalButtons = document.querySelectorAll("[data-dismiss='modal']");
    closeModalButtons.forEach(button => {
        button.addEventListener("click", function () {
            let modal = document.getElementById("modal");
            if (modal) {
                modal.style.display = "none";
                modal.classList.remove("open");

                // Ako koristiš Bootstrap:
                if (typeof $ !== "undefined") {
                    $("#modal").modal("hide");
                }
            }
        });
    });

    let searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keyup", filtrirajIzracune);
    }

    let deleteForm = document.getElementById("deleteForm");

    if (deleteForm) {
        deleteForm.addEventListener("submit", function (event) {
            event.preventDefault(); // Spriječi reload

            let izracunId = document.getElementById("deleteCalculationId").value;
            if (!izracunId) {
                alert("Greška: ID izračuna nije postavljen!");
                return;
            }

            fetch(`/obrisi_izracun/${izracunId}`, { method: "DELETE" })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        let row = document.querySelector(`tr[data-calculation-id='${izracunId}']`);
                        if (row) row.remove();  // Ukloni iz DOM-a

                        document.getElementById("modal").classList.remove("open"); // Zatvori modal
                        alert("Izračun uspješno izbrisan!");
                    } else {
                        alert("Greška pri brisanju.");
                    }
                })
                .catch(error => {
                    console.error("Greška:", error);
                    alert("Došlo je do greške. Pokušajte ponovo.");
                });
        });
    }

    document.getElementById("fileSelect")?.addEventListener("change", function (e) {
        const file = e.target.files[0];
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const reader = new FileReader();

        // Ako je CSV, koristi readAsText s UTF-8
        if (fileName.endsWith(".csv")) {
            reader.onload = function (e) {
                const csv = e.target.result;
                const workbook = XLSX.read(csv, { type: "string" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                resetirajUnose(); // očisti prije učitavanja
                ucitajPodatkeIzExcelTabele(rows);
            };
            reader.readAsText(file, "utf-8"); // KLJUČNI DIO za pravilna slova ćčšđž

        } else {
            // Za xlsx, xls, ods koristi readAsArrayBuffer
            reader.onload = function (e) {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: "array" });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

                resetirajUnose(); // očisti prije učitavanja
                ucitajPodatkeIzExcelTabele(rows);
            };
            reader.readAsArrayBuffer(file);
        }
    });
    


    document.querySelectorAll(".site-message-close").forEach(button => {
        button.addEventListener("click", function () {
            let msg = button.closest(".site-messages");
            if (msg) {
                msg.classList.add("hide");
                setTimeout(() => {
                    msg.style.display = "none";
                    msg.classList.remove("hide");
                }, 300);
            }
        });
    });



    document.querySelectorAll(".calculation-entry").forEach((entry, index) => {
        let idInput = entry.querySelector(".js-calculationID");
        
        if (!idInput) {
            console.warn(`Račun #${index + 1} nema ID, dodajem automatski...`);

            let newIdInput = document.createElement("input");
            newIdInput.type = "hidden";
            newIdInput.classList.add("js-calculationID");
            newIdInput.name = `calculation[${index}][id]`;
            newIdInput.value = index + 1;

            entry.prepend(newIdInput);
        }
    });

    document.querySelectorAll(".calculation-entry").forEach((entry) => {
        entry.querySelectorAll("._payment").forEach(paymentEntry => {
            let datum = paymentEntry.querySelector(".js-paymentDate")?.value || "";
            let iznosUplate = parseFloat(paymentEntry.querySelector(".js-paymentAmount")?.value) || 0;
            let uplataId = paymentEntry.dataset.uplataId || crypto.randomUUID(); // Dodaj UUID ako ne postoji
        
            if (datum && iznosUplate) {
                let novaUplata = {
                    id: uplataId, // Svaka uplata sada ima jedinstveni ID
                    id_racuna: idRacuna,
                    datum: datum,
                    iznos: iznosUplate
                };
        
                racun.uplate.push(novaUplata);
                paymentEntry.dataset.uplataId = uplataId; // Spremamo ID u DOM
            }
        });
    });

    inicijalizirajDropdown();  // Odmah inicijaliziraj dropdown na početku

    console.log("Dodajem event listenere za PDF gumbe...");
    dodajEventListenereZaPDF(); // Pozivam funkciju za dodavanje listenera

    console.log("Tražim gumbe...");

    // Inicijalizacija Decimalnog Formata odmah na prvom polju
    const firstField = document.querySelector(".js-with-decimals");
    if (firstField) {
        formatDecimalInput(firstField);  // Formatiraj prvi unos
        firstField.addEventListener("change", function () {
            formatDecimalInput(firstField); // Dodaj listener na promjene
        });
    }
    
    // Pokreni dohvaćanje kamata pri učitavanju stranice
    dohvatiKamate();

    // Automatski postavi današnji datum u formatu dd.mm.yyyy
    let dateInput = document.getElementById("datepicker0");
    if (dateInput) {
        let danas = new Date();
        let dan = String(danas.getDate()).padStart(2, "0");
        let mjesec = String(danas.getMonth() + 1).padStart(2, "0");
        let godina = danas.getFullYear();
        
        dateInput.value = `${dan}.${mjesec}.${godina}`;
    }

    // SVGInject za sve SVG ikone
    setTimeout(() => SVGInject(document.querySelectorAll(".injectable-svg")), 500);


    // Inicijalizacija Flatpickr samo ako postoji
    if (typeof flatpickr !== "undefined") {
        flatpickr(".datepicker", {
            locale: "hr",
            dateFormat: "d.m.Y",
            minDate: "30.05.1994",
            disableMobile: true,
            allowInput: true,
            onReady: function (selectedDates, dateStr, instance) {
                if (typeof dodajDropdownZaGodine === "function") {
                    dodajDropdownZaGodine(instance);
                } else {
                    console.error("Funkcija dodajDropdownZaGodine nije definirana!");
                }
            },
            onMonthChange: function (selectedDates, dateStr, instance) {
                azurirajGodinu(instance);
            }
        });
    } else {
        console.warn("Flatpickr nije učitan, preskačem inicijalizaciju.");
    }

    // Funkcija za ažuriranje valute u data-field
    function azurirajValutu() {
        let odabranaValuta = document.querySelector(".js-currency-list")?.value;
        if (!odabranaValuta) return;

        document.querySelectorAll('.has-helper').forEach(label => {
            label.setAttribute("data-field", odabranaValuta);
        });
    }

    // Dodaj event listener samo ako dropdown postoji
    let valutaDropdown = document.querySelector(".js-currency-list");
    if (valutaDropdown) {
        azurirajValutu();
        valutaDropdown.addEventListener("change", azurirajValutu);
    }

    // Observer za automatsko ažuriranje valute ako se DOM mijenja
    new MutationObserver(azurirajValutu).observe(document.body, { childList: true, subtree: true });

    // Event delegation: presrećemo SVE klikove na `document`
    document.addEventListener("click", async function (event) {
        const target = event.target;
        
        // Novi izračun — reset forme i UI-a
        const pageReloadTrigger = target.closest("[data-page-reload]");
        if (pageReloadTrigger) {
            event.preventDefault();

        // Resetiraj samo unose (glavnica + uplate)
        resetirajUnose();

            // Resetiraj formu
            const form = document.querySelector("#form");
            if (form) {
                form.reset();
            }

            // Očisti tablice i prikaz izračuna
            const output = document.querySelector("#calculation-result");
            if (output) {
                output.classList.add("hidden"); // Sakrij sekciju s rezultatima
                output.querySelector(".section.output.interests")?.removeAttribute("data-display");
                output.querySelector(".interests-detailed-wrapper")?.remove();
            }

            // Ukloni sve .is-active akordeone
            document.querySelectorAll(".panel.is-active").forEach(panel => {
                panel.classList.remove("is-active");
            });

            // Očisti greške i poruke
            document.getElementById("errorAlert")?.style.setProperty("display", "none");
            document.getElementById("successMessage")?.style.setProperty("display", "none");

            // (opcionalno) Scroll na vrh
            window.scrollTo({ top: 0, behavior: "smooth" });

            console.log("Novi izračun — stanje je resetirano.");
            return; // Spriječi daljnje izvršavanje
        }


        let otvoreniDropdown = document.querySelector(".dropdown.open");

        // Ako postoji otvoreni dropdown i klik nije bio unutar dropdowna ili njegovog gumba, zatvori ga
        if (otvoreniDropdown && !event.target.closest(".dropdown")) {
            console.log("Klik izvan dropdowna - zatvaram sve dropdownove...");
            zatvoriSveDropdownove();
        }

        // Provjera data-toggle atributa (exposable i collapsible elementi)
        let toggleType = target.getAttribute("data-toggle");
        let targetId = target.getAttribute("data-target");
        let targetElement = document.getElementById(targetId);

        if (toggleType && targetElement) {
            switch (toggleType) {
                case "exposable":
                    target.classList.toggle("active");
                    targetElement.classList.toggle("exposed");
                    break;
                case "collapsible":
                    target.classList.toggle("active");
                    targetElement.classList.toggle("collapsed");
                    break;
                case "collapsible":
                    target.classList.toggle("active");
                    targetElement.classList.toggle("collapsed");
                    break;
            }
            return; // Prekidam dalje izvršavanje jer sam obradila ovaj slučaj
        }

        // Accordion otvaranje/zatvaranje (mora ići PRVO)
        const panelHeader = target.closest(".panel-heading");
        if (panelHeader) {
            const panel = panelHeader.closest("[data-accordion-item]");
            const accordion = panelHeader.closest("[data-accordion]");
            if (!panel || !accordion) return;

            const isActive = panel.classList.contains("is-active");
            const multiExpand = accordion.dataset.accordion?.includes("multiExpand: true");

            if (!multiExpand) {
                accordion.querySelectorAll(".is-active").forEach(openPanel => {
                    openPanel.classList.remove("is-active");
                });
            }

            panel.classList.toggle("is-active", !isActive);
            return; // Prekini dalje
        }

        // Dodaj gumb "Spremi izračun" u eventMap
        if (target.closest("#storeCalculation")) {
            event.preventDefault();
            console.log("Kliknut gumb za spremanje izračuna!");

            let calculationNameInput = document.getElementById("calculation-name");
            let errorMessage = calculationNameInput.nextElementSibling; // Pronalazi <span> s greškom
            let errorAlert = document.getElementById("errorAlert");
            let nazivIzracuna = calculationNameInput.value.trim();
    
            // Ako polje nije popunjeno, zaustavljam spremanje i prikazujem poruku
            if (nazivIzracuna === "") {
                calculationNameInput.classList.add("invalid"); // Dodaj crveni okvir na input
                if (errorMessage) errorMessage.style.display = "inline";
                showErrorAlert("Naziv izračuna je obavezan.");

                // Pomicanje stranice na vrh
                window.scrollTo({ top: 0, behavior: "smooth" });

                const rezultatWrapper = document.getElementById("calculation-result");
                if (rezultatWrapper) {
                    rezultatWrapper.classList.add("hidden");
                }

                let otvoreniDropdown = document.querySelector(".dropdown.open");
                if (otvoreniDropdown) {
                    otvoreniDropdown.classList.remove("open");
                }

                return; // Prekidam izvršavanje funkcije, podaci se NE šalju na server
            } else {
                calculationNameInput.classList.remove("invalid"); // Makni crveni okvir
                // Provjeri postoji li errorMessage prije nego što mu mijenjaš stil
                if (errorMessage) errorMessage.style.display = "none"; 
                // Provjeri postoji li errorAlert prije nego što ga sakriješ
                if (errorAlert) errorAlert.style.display = "none";
            }
    
            // Ako je validacija prošla, nastavljamo s POST zahtjevom
            try {
                console.log("Šaljem podatke na /spremi_izracun:", JSON.stringify(window.jsonResponse, null, 2));
    
                let spremiResponse = await fetch("/spremi_izracun", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(window.jsonResponse) // Šaljem podatke na backend
                });
    
                if (!spremiResponse.ok) {
                    throw new Error(`Greška pri spremanju: ${spremiResponse.status} ${spremiResponse.statusText}`);
                }
    
                let result = await spremiResponse.json();
                console.log("Spremanje u bazu:", result);
    
                // Prikazujem poruku o uspješnom spremanju
                successMessage.style.display = "block";

                // Pomicanje stranice na vrh da korisnik vidi poruku
                window.scrollTo({ top: 0, behavior: "smooth" });

                // Ažuriraj broj izračuna nakon spremanja
                osvjeziBrojIzracuna();

            } catch (error) {
                console.error("Greška pri spremanju:", error);
                alert("Došlo je do greške pri spremanju. Pokušajte ponovo.");
            }
            return; // Prekidam izvršavanje jer sam obradila ovaj slučaj
        }

        // 3 Event mapiranje za ostale akcije (modal, računi, uplate, PDF, CSV)
        let eventMap = {
            "[data-toggle='modal']": otvoriModal,
            "[data-dismiss='modal']": zatvoriModal,
            "[data-item-bill-add]": dodajRacun,
            "[data-item-payment-add]": dodajUplatu,
            "[data-item-bill-remove]": obrisiRacun,
            "[data-item-payment-delete]": obrisiUplatu,
            "[data-item-bill-copy]": kopirajRacun,
            "[data-item-payment-copy]": kopirajUplatu,
            "[data-generate='pdf']": prikaziPDF,
            "[data-download='pdf']": preuzmiPDF,
            "[data-download='csv']": generirajCSV,
        };

        for (let selector in eventMap) {
            const trigger = target.closest(selector);  // Pronađi pravi "okidač"
            if (trigger) {
                event.preventDefault();
                eventMap[selector](trigger);  // Proslijedi ga funkciji
                return;
            }
        }

        // Klik izvan dropdowna zatvara sve otvorene dropdown menije
        if (!target.closest(".dropdown")) {
            zatvoriSveDropdownove();
        }
    });


    // Inicijalizacija dropdowna
    inicijalizirajDropdown();

    // Pokreni dohvaćanje kamata pri učitavanju stranice
    dohvatiKamate();

    console.log("Event delegation za PDF i CSV postavljen.");


    // Escape tipka zatvara modal
    document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") {
            zatvoriModal();
        }
    });

    document.querySelectorAll(".js-calculationDate, .js-paymentDate").forEach(dateInput => {
        flatpickr(dateInput, {
            locale: "hr",
            dateFormat: "d.m.Y",
            minDate: "30.05.1994",
            disableMobile: true,
            allowInput: true,
            onReady: function (selectedDates, dateStr, instance) {
                dodajDropdownZaGodine(instance);
            },
            onMonthChange: function (selectedDates, dateStr, instance) {
                azurirajGodinu(instance);
            }
        });
    });

    // Rukovanje submit eventom forme
    let form = document.getElementById("form");
    if (form) {
        form.addEventListener("submit", async function (event) {
            event.preventDefault(); // Sprječava ponovno učitavanje stranice

            // Sakrij prethodnu poruku ako postoji
            const errorAlert = document.getElementById("errorAlert");
            if (errorAlert) {
                errorAlert.style.display = "none";
            }

            let podaci = {
                naziv_izracuna: document.getElementById("calculation-name")?.value.trim() || "Izračun",
                opis_izracuna: document.getElementById("calculation-description")?.value.trim() || "",
                vjerovnik: {
                    naziv: document.getElementById("creditor-name")?.value.trim() || "",
                    adresa: document.getElementById("creditor-address")?.value.trim() || "",
                    mjesto: document.getElementById("creditor-city")?.value.trim() || "",
                    oib: document.getElementById("creditor-oib")?.value.trim() || "" // Nema validacije OIB-a, korisnik može upisati bilo što
                },
                duznik: {
                    naziv: document.getElementById("debtor-name")?.value.trim() || "",
                    adresa: document.getElementById("debtor-address")?.value.trim() || "",
                    mjesto: document.getElementById("debtor-city")?.value.trim() || "",
                    oib: document.getElementById("debtor-oib")?.value.trim() || "" // Nema validacije OIB-a
                },
                datum_kraja: document.getElementById("datepicker0")?.value || "",
                valuta: document.getElementById("currency-list")?.value || "EUR",
                tip_subjekta: document.querySelector('input[name="calculation-type"]:checked')?.value || "natural-person",
                vrsta_izracuna: document.querySelector("input[name='calculation-type']:checked")?.nextElementSibling.textContent.replace(/\s+/g, " ").trim() || "Nije odabrano",
                moratorium: document.getElementById("moratorium")?.checked || false,
                racuni: []
            };

            let globalnoValidno = true;
            let uplataPrijeGlavnice = false;
            // Očisti stare greške
            document.querySelectorAll(".invalid-feedback").forEach(el => el.remove());
            document.querySelectorAll(".invalid").forEach(el => el.classList.remove("invalid"));

            podaci.racuni = [];

            document.querySelectorAll(".calculation-entry").forEach((entry, index) => {
                const idInput = entry.querySelector(".js-calculationID");
                const idRacuna = idInput?.value?.trim();

                if (!idRacuna) {
                    console.warn(`Nema ID-a za račun #${index + 1}`);
                    return;
                }

                const iznosInput = entry.querySelector(".js-calculationAmount");
                const datumInput = entry.querySelector(".js-calculationDate");

                const iznos = iznosInput?.value?.trim();
                const datum = datumInput?.value?.trim();

                // Validacija glavnice
                if (!iznos || parseFloat(iznos) === 0) {
                    dodajPorukuGreske(iznosInput);
                    globalnoValidno = false;
                }
                if (!datum) {
                    dodajPorukuGreske(datumInput);
                    globalnoValidno = false;
                }

                const racun = {
                    id_racuna: idRacuna,
                    iznos: parseFloat(iznos) || 0,
                    datum_pocetka: datum,
                    glavnica_naziv: entry.querySelector(".js-calculationDescription")?.value || "Neimenovani račun",
                    uplate: []
                };

                entry.querySelectorAll("._payment").forEach(paymentEntry => {
                    const datumUplateInput = paymentEntry.querySelector(".js-paymentDate");
                    const iznosUplateInput = paymentEntry.querySelector(".js-paymentAmount");

                    const datumUplate = datumUplateInput?.value?.trim();
                    const iznosUplate = iznosUplateInput?.value?.trim();

                    if (!datumUplate) {
                        dodajPorukuGreske(datumUplateInput);
                        globalnoValidno = false;
                    }

                    if (!iznosUplate || parseFloat(iznosUplate) === 0) {
                        dodajPorukuGreske(iznosUplateInput);
                        globalnoValidno = false;
                    }

                    // Uplata ne smije biti prije glavnice
                    if (datum && datumUplate) {
                        const [d, m, y] = datum.split(".");
                        const [du, mu, yu] = datumUplate.split(".");
                        const datumGl = new Date(y, m - 1, d);
                        const datumUp = new Date(yu, mu - 1, du);

                        if (datumUp < datumGl) {
                            uplataPrijeGlavnice = true;
                        }
                    }

                    // Uplata u JSON ako sve postoji
                    if (datumUplate && iznosUplate) {
                        const uplataId = paymentEntry.getAttribute("data-uplata-id") || crypto.randomUUID();
                        paymentEntry.setAttribute("data-uplata-id", uplataId);

                        racun.uplate.push({
                            id: uplataId,
                            id_racuna: idRacuna,
                            datum: datumUplate,
                            iznos: parseFloat(iznosUplate) || 0
                        });
                    }
                });

                podaci.racuni.push(racun);
            });

            if (uplataPrijeGlavnice) {
                showErrorAlert("Datum uplate ne smije biti raniji od datuma dospijeća osnove za plaćanje.");
                return;
            }

            // Ako validacija ne prolazi – samo JEDNOM pokaži poruku
            if (!globalnoValidno) {
                showErrorAlert("Ispravite naznačene pogreške i pokušajte ponovno.");
                return;
            }

            console.log("FINALNI PODACI PRIJE SLANJA:", JSON.stringify(podaci, null, 2));

            try {
                let response = await fetch("/izracun", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(podaci)
                });

                const result = await response.json();

                if (!response.ok && result?.error) {
                    showErrorAlert(result.error);  // Prikaz poruke iz backenda
                    return;
                }

                window.jsonResponse = result;  // Spremi rezultat globalno
                console.log("Spremljen JSON odgovor u window.jsonResponse:", window.jsonResponse);


                if (result.error) {
                    showErrorAlert(result.error);
                    alert("Greška: " + result.error);
                    return;
                }

                const warningMessages = result.warning_messages || result.warnings || result.warning || [];
                let combinedWarning = "";
                if (Array.isArray(warningMessages)) {
                    combinedWarning = warningMessages.join("<br>");
                } else if (typeof warningMessages === "string") {
                    combinedWarning = warningMessages;
                }

                if (combinedWarning) {
                    showErrorAlert(combinedWarning);
                }

                console.log("Finalni podaci prije prikaza:", result);
                prikaziRezultate(result);  // Proslijedi cijeli result, ne samo rezultat!

                let storeButton = document.getElementById("storeCalculation");
                if (storeButton) storeButton.disabled = false;
            
                // Ponovo postavi event listenere za PDF gumbe nakon ažuriranja DOM-a
                setTimeout(dodajEventListenereZaPDF, 100);  

            } catch (error) {
                console.error("Greška pri izračunu:", error);
                showErrorAlert("Došlo je do greške. Pokušajte ponovno.");
            }
        });
    }

    function postaviAktivanIzracun(naziv) {
        // Sakrij sve kvačice i makni .dropdown-menu-link--selected sa svih gumba
        document.querySelectorAll(".dropdown-menu-item button").forEach(btn => {
            const icon = btn.querySelector(".check-icon");
            if (icon) icon.style.visibility = "hidden";
    
            btn.classList.remove("dropdown-menu-link--selected");
        });
    
        // Nađi aktivni gumb prema data-name
        const activeButton = Array.from(document.querySelectorAll('.dropdown-menu-item button'))
            .find(btn => btn.dataset.name === naziv);
    
        if (activeButton) {
            const icon = activeButton.querySelector(".check-icon");
            if (icon) icon.style.visibility = "visible";
    
            activeButton.classList.add("dropdown-menu-link--selected");
        }
    }

    // Preuzimanje zadnjeg generiranog CSV-a
    function postaviEventListener() {
        let downloadButton = document.getElementById("downloadCsv");

        if (downloadButton) {
            console.log("Gumb za preuzimanje CSV-a pronađen!");
            dodajClickEvent(downloadButton);
        } else {
            console.log("Gumb za preuzimanje CSV-a nije pronađen! Pratim promjene u DOM-u...");

            // Ako gumb ne postoji, koristim MutationObserver
            let observer = new MutationObserver(function (mutations, obs) {
                let button = document.getElementById("downloadCsv");
                if (button) {
                    console.log("Gumb za preuzimanje CSV-a se sada pojavio!");
                    dodajClickEvent(button);
                    obs.disconnect(); // Prekidam praćenje jer sam pronašla gumb
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });
        }
    }

    function inicijalizirajLinkZaMoratorij() {
        const moratoriumLink = document.querySelector('a[data-toggle="modal"][data-target="moratorium"]');
    
        if (moratoriumLink) {
            moratoriumLink.addEventListener("click", function (event) {
                event.preventDefault(); // spriječi skakanje na vrh
                console.log("Kliknut 'Saznaj više' link za moratorij");
                otvoriModal(moratoriumLink); // koristi postojeću funkciju za modal
            });
        } else {
            console.warn("Link za moratorij nije pronađen u DOM-u.");
        }
    }

    function inicijalizirajSveModale() {
        document.querySelectorAll('[data-toggle="modal"]').forEach(trigger => {
            trigger.addEventListener("click", function (event) {
                event.preventDefault();
                console.log("Klik na modal trigger:", trigger.getAttribute("data-target"));
                otvoriModal(trigger);
            });
        });
    }

    function dodajClickEvent(button) {
        button.addEventListener("click", function (event) {
            event.preventDefault();
            console.log("Kliknut gumb za preuzimanje CSV-a");


            // Promijeni tekst gumba dok se CSV preuzima
            button.innerHTML = "Preuzimam CSV...";
            button.classList.add("loading");

            // Pokreni preuzimanje
            window.location.href = "/preuzmi_csv";

            // Vrati originalni tekst nakon 2 sekunde
            setTimeout(() => {
                button.innerHTML = "Preuzmi CSV";
                button.classList.remove("loading");
            }, 2000);
        });

        // Postavi ispravan href kako bi izbjegao vraćanje na vrh stranice
        button.setAttribute("href", "/preuzmi_csv");
    }

    postaviEventListener(); // Pokušaj odmah


    if (window.ucitaniIzracun) {
        console.log("Učitani izračun pronađen:", window.ucitaniIzracun);
        popuniFormuIzracunom(window.ucitaniIzracun);
    }
});

// Funkcije za rukovanje elementima
function otvoriModal(target) {
    let modal = document.getElementById("modal");
    let modalUrl = "/" + target.getAttribute("data-target");

    console.log("Otvaram modal sa URL-om:", modalUrl);

    fetch(modalUrl)
        .then(response => response.text())
        .then(html => {
            modal.innerHTML = html;
            modal.classList.add("open");
            document.body.classList.add("modal-open");
            inicijalizirajModalBrisanja();
            inicijalizirajModalAzuriranjaKamata();
        })
        .catch(error => console.error("Greška pri otvaranju modala:", error));
}

// Escape tipka zatvara modal
function zatvoriModal() {
    let modal = document.getElementById("modal");
    modal.classList.remove("open");
    document.body.classList.remove("modal-open");
    setTimeout(() => (modal.innerHTML = ""), 300);  // Nakon zatvaranja, obriši sadržaj
}

function inicijalizirajModalBrisanja() {
    let form = document.getElementById("deleteForm");
    if (!form) return;

    form.addEventListener("submit", function (event) {
        event.preventDefault();


        let id = document.getElementById("deleteCalculationId").value;

        fetch(`/obrisi_izracun/${id}`, { method: "DELETE" })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    let row = document.querySelector(`tr[data-calculation-id='${id}']`);
                    if (row) row.remove();

                    document.getElementById("modal").classList.remove("open");
                    document.body.classList.remove("modal-open");

                    // Prikaži poruku o uspješnom brisanju
                    const msg = document.getElementById("successMessage");
                    if (msg) {
                        msg.style.display = "block";
                        window.scrollTo({ top: 0, behavior: "smooth" });
                    }

                } else {
                    alert("Greška pri brisanju!");
                }
            })
            .catch(err => {
                console.error("Greška pri brisanju:", err);
                alert("Dogodila se greška. Pokušajte ponovno.");
            });
    });
}

function inicijalizirajModalAzuriranjaKamata() {
    const modal = document.querySelector('[data-modal="interest-update"]');
    if (!modal) return;

    const form = modal.querySelector('[data-form="interest-period-create"]');
    const listContainer = modal.querySelector('[data-list="interest-periods"]');
    const formSection = modal.querySelector('[data-section="interest-form"]');
    const messageElement = modal.querySelector('[data-message="interest-update"]');
    const toggleButton = modal.querySelector('[data-action="toggle-interest-form"]');
    const hasToggleButton = Boolean(toggleButton);
    if (!hasToggleButton) {
        console.warn("Gumb za otvaranje forme kamata nije pronađen. Preskačem povezanu logiku.");
    }
    const dateRegex = /^\d{2}\.\d{2}\.\d{4}$/;
    const rateRegex = /^\d+\.\d{2}$/;

    let hideTimeoutId = null;

    const hideMessage = () => {
        if (!messageElement) return;
        messageElement.hidden = true;
        if (hideTimeoutId) {
            clearTimeout(hideTimeoutId);
            hideTimeoutId = null;
        }
    };

    const showMessage = (type, text) => {
        if (!messageElement) return;
        if (hideTimeoutId) {
            clearTimeout(hideTimeoutId);
            hideTimeoutId = null;
        }
        messageElement.textContent = text;
        messageElement.hidden = false;
        messageElement.classList.remove("alert--error", "alert--success");
        messageElement.classList.add(type === "success" ? "alert--success" : "alert--error");

        if (type === "success") {
            hideTimeoutId = setTimeout(() => {
                if (messageElement) {
                    messageElement.hidden = true;
                }
                hideTimeoutId = null;
            }, 3000);
        }
    };

    const validateInputs = ({ datum_pocetka, datum_kraja, fizicke_osobe, pravne_osobe }) => {
        if (
            !dateRegex.test(datum_pocetka) ||
            !dateRegex.test(datum_kraja) ||
            !rateRegex.test(fizicke_osobe) ||
            !rateRegex.test(pravne_osobe)
        ) {
            showMessage("error", "Format za unos datuma mora biti 01.01.2025 a za unos kamata 99.99");
            return false;
        }

        hideMessage();
        return true;
    };

    const formatRate = value => `${Number(value).toFixed(2)} %`;

    const setToggleButtonState = () => {
        if (!hasToggleButton) return;
        toggleButton.textContent = formSection && !formSection.hidden
            ? "Zatvori unos"
            : "Dodaj novo razdoblje";
    };

    const updatePeriodTitles = () => {
        if (!listContainer) return;
        const items = listContainer.querySelectorAll(".interest-period");
        items.forEach((item, index) => {
            const orderCell = item.querySelector('[data-column="order"]');
            if (orderCell) {
                orderCell.textContent = index + 1;
            }
        });
    };

    const createPeriodElement = data => {
        const { id, datum_pocetka, datum_kraja, fizicka_osoba, pravna_osoba } = data;
        const element = document.createElement("tr");
        element.className = "interest-period";
        element.dataset.id = id;
        element.innerHTML = `
            <td class="interest-period__id">${id}</td>
            <td class="interest-period__cell" data-column="datum_pocetka">${datum_pocetka}</td>
            <td class="interest-period__cell" data-column="datum_kraja">${datum_kraja}</td>
            <td class="interest-period__cell" data-column="fizicke_osobe">${formatRate(fizicka_osoba)}</td>
            <td class="interest-period__cell" data-column="pravne_osobe">${formatRate(pravna_osoba)}</td>
            <td class="interest-period__actions">
                <button type="button" class="button button--tiny button--secondary" data-action="edit-interest-period">Uredi razdoblje</button>
                <button type="button" class="button button--tiny button--plain" data-action="delete-interest-period">Obriši razdoblje</button>
            </td>
        `;

        return element;
    };

    const ensureListExists = () => {
        if (!listContainer) return null;

        let list = listContainer.querySelector(".interest-periods-list");
        if (!list) {
            const wrapper = document.createElement("div");
            wrapper.className = "interest-periods__table-wrapper";

            const table = document.createElement("table");
            table.className = "interest-periods-table";
            table.innerHTML = `
                <thead>
                    <tr>
                        <th scope="col">ID</th>
                        <th scope="col">Datum početka</th>
                        <th scope="col">Datum završetka</th>
                        <th scope="col">Fizičke osobe</th>
                        <th scope="col">Pravne osobe</th>
                        <th scope="col" class="interest-periods-table__actions">Radnje</th>
                    </tr>
                </thead>
                <tbody class="interest-periods-list"></tbody>
            `;

            wrapper.appendChild(table);
            listContainer.innerHTML = "";
            listContainer.appendChild(wrapper);
            list = table.querySelector(".interest-periods-list");
        }

        return list;
    };

    const parseDisplayValue = value => value.replace(" %", "").trim();

    const collectInputs = container => {
        const payload = {};
        container.querySelectorAll("input[data-field]").forEach(input => {
            payload[input.dataset.field] = input.value.trim();
        });
        return payload;
    };

    if (hasToggleButton && formSection) {
        toggleButton.addEventListener("click", () => {
            formSection.hidden = !formSection.hidden;
            setToggleButtonState();

            if (!formSection.hidden) {
                const firstInput = formSection.querySelector("input");
                if (firstInput) {
                    firstInput.focus();
                }
            }
        });
        setToggleButtonState();
    }

    if (form && formSection) {
        if (listContainer && listContainer.querySelector(".interest-periods__empty")) {
            formSection.hidden = false;
        }
        if (hasToggleButton) {
            setToggleButtonState();
        }
    }

    if (form) {
        form.addEventListener("submit", async event => {
            event.preventDefault();

            const payload = {
                datum_pocetka: form.querySelector('[data-input="date-start"]').value.trim(),
                datum_kraja: form.querySelector('[data-input="date-end"]').value.trim(),
                fizicke_osobe: form.querySelector('[data-input="rate-physical"]').value.trim(),
                pravne_osobe: form.querySelector('[data-input="rate-legal"]').value.trim(),
            };

            if (!validateInputs(payload)) {
                return;
            }

            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) submitButton.disabled = true;

            try {
                const response = await fetch("/kamate", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                });

                const data = await response.json();

                if (!response.ok) {
                    showMessage("error", data.error || "Dogodila se greška. Pokušajte ponovno.");
                    return;
                }

                form.reset();
                hideMessage();

                const list = ensureListExists();
                if (list) {
                    const listItem = createPeriodElement(data);
                    const first = list.firstElementChild;
                    if (first) {
                        list.insertBefore(listItem, first);
                    } else {
                        list.appendChild(listItem);
                    }

                    while (list.children.length > 10) {
                        list.removeChild(list.lastElementChild);
                    }
                }

                kamateCache = null;
                dohvatiKamate();

                showMessage("success", "Razdoblje je uspješno dodano.");
                updatePeriodTitles();

                if (formSection) {
                    formSection.hidden = true;
                    if (hasToggleButton) {
                        setToggleButtonState();
                    }
                }
            } catch (error) {
                console.error("Greška pri dodavanju kamate:", error);
                showMessage("error", "Dogodila se greška. Pokušajte ponovno.");
            } finally {
                if (submitButton) submitButton.disabled = false;
            }
        });
    } else if (hasToggleButton) {
        setToggleButtonState();
    }

    modal.addEventListener("click", async event => {
        const editButton = event.target.closest('[data-action="edit-interest-period"]');
        const deleteButton = event.target.closest('[data-action="delete-interest-period"]');

        if (editButton) {
            const listItem = editButton.closest(".interest-period");
            if (!listItem) return;

            const details = listItem.querySelectorAll(".interest-period__cell[data-column]");
            const fields = ["datum_pocetka", "datum_kraja", "fizicke_osobe", "pravne_osobe"];

            if (listItem.dataset.editing === "true") {
                const payload = collectInputs(listItem);

                if (!validateInputs(payload)) {
                    return;
                }

                editButton.disabled = true;

                try {
                    const response = await fetch(`/kamate/${listItem.dataset.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(payload),
                    });

                    const data = await response.json();

                    if (!response.ok) {
                        showMessage("error", data.error || "Dogodila se greška. Pokušajte ponovno.");
                        return;
                    }

                    details.forEach((cell, index) => {
                        if (index < 2) {
                            cell.textContent = data[fields[index]] || payload[fields[index]];
                        } else {
                            const key = index === 2 ? "fizicka_osoba" : "pravna_osoba";
                            cell.textContent = formatRate(data[key] || payload[fields[index]]);
                        }
                    });

                    listItem.dataset.editing = "false";
                    editButton.textContent = "Uredi razdoblje";
                    showMessage("success", "Razdoblje je uspješno ažurirano.");

                    const deleteActionButton = listItem.querySelector('[data-action="delete-interest-period"]');
                    if (deleteActionButton) {
                        deleteActionButton.disabled = false;
                    }

                    kamateCache = null;
                    dohvatiKamate();
                    updatePeriodTitles();
                } catch (error) {
                    console.error("Greška pri ažuriranju kamate:", error);
                    showMessage("error", "Dogodila se greška. Pokušajte ponovno.");
                } finally {
                    editButton.disabled = false;
                }

                return;
            }

            details.forEach((cell, index) => {
                const value = index < 2 ? cell.textContent.trim() : parseDisplayValue(cell.textContent);

                const input = document.createElement("input");
                input.type = "text";
                input.value = value;
                input.dataset.field = fields[index];
                input.placeholder = index < 2 ? "01.01.2025" : "99.99";
                cell.textContent = "";
                cell.appendChild(input);
            });

            listItem.dataset.editing = "true";
            editButton.textContent = "Spremi";

            const deleteActionButton = listItem.querySelector('[data-action="delete-interest-period"]');
            if (deleteActionButton) {
                deleteActionButton.disabled = true;
            }

            return;
        }

        if (deleteButton) {
            const listItem = deleteButton.closest(".interest-period");
            if (!listItem) return;

            if (!confirm("Jeste li sigurni da želite obrisati ovo razdoblje?")) {
                return;
            }

            deleteButton.disabled = true;

            try {
                const response = await fetch(`/kamate/${listItem.dataset.id}`, {
                    method: "DELETE",
                });

                const data = await response.json();

                if (!response.ok || data.success !== true) {
                    showMessage("error", data.error || "Dogodila se greška. Pokušajte ponovno.");
                    return;
                }

                listItem.remove();

                const list = listContainer.querySelector(".interest-periods-list");
                if (list && list.children.length === 0) {
                    listContainer.innerHTML = '<p class="interest-periods__empty">Trenutačno nema zabilježenih razdoblja.</p>';
                    if (formSection) {
                        formSection.hidden = false;
                        if (hasToggleButton) {
                            setToggleButtonState();
                        }
                    }
                } else {
                    updatePeriodTitles();
                }

                kamateCache = null;
                dohvatiKamate();

                showMessage("success", "Razdoblje je uspješno obrisano.");
            } catch (error) {
                console.error("Greška pri brisanju kamate:", error);
                showMessage("error", "Dogodila se greška. Pokušajte ponovno.");
            } finally {
                deleteButton.disabled = false;
            }
        }
    });
}

function resetirajUnose() {
    const entryContainer = document.querySelector(".calculation-entries-body");

    if (!entryContainer) return;

    const entries = Array.from(entryContainer.querySelectorAll(".calculation-entry"));

    entries.forEach((entry, index) => {
        if (index === 0) {
            entry.querySelectorAll("input, textarea, select").forEach(el => {
                el.value = "";
            });
            entry.querySelectorAll("._payment").forEach(uplata => {
                uplata.remove();
            });
        } else {
            entry.remove();
        }
    });
}

// Dodavanje novog računa (bill)
function dodajRacun(target = null, dug = null) {
    console.log("dodajRacun pozvan za dug:", dug);
    let container = document.querySelector(".calculation-entries-body");
    
    let newEntry = document.createElement("div");
    newEntry.classList.add("calculation-entry");

    // Pronađi koliko već ima računa i dodaj novi ID
    let sviRacuni = document.querySelectorAll(".calculation-entry");
    let idRacuna = 1;

    if (sviRacuni.length > 0) {
        let zadnjiRacun = sviRacuni[sviRacuni.length - 1];
        let zadnjiID = parseInt(zadnjiRacun.querySelector(".js-calculationID")?.value || 0, 10);
        idRacuna = zadnjiID + 1; // Osigurava da ID bude jedinstven
    }

    newEntry.innerHTML = `
        <div class="_principal">
            <input class="js-calculationID" name="calculation[${idRacuna}][id]" type="hidden" value="${idRacuna}">
            <div class="calculation-entry-field _counter"></div>
            <div class="calculation-entry-field _name">
                <label class="field-label">Osnova za plaćanje</label>
                <input class="js-calculationDescription"
                    name="calculation[${idRacuna}][principal][description]" 
                    type="text" 
                    placeholder="npr. Troškovi">
                <input class="js-calculationItem" 
                    name="calculation[${idRacuna}][principal][item]" 
                    type="hidden" value="principal">
            </div>
            <div class="calculation-entry-field _amount">
                <label class="field-label has-helper" data-field="${dohvatiValutu()}">Iznos</label>
                <input class="js-calculationAmount js-with-decimals" 
                    name="calculation[${idRacuna}][principal][amount]" 
                    type="number" placeholder="npr. 15 000,00">
            </div>
            <div class="calculation-entry-field _date">
                <label class="field-label">Datum dospijeća</label>
                <input class="js-calculationDate datepicker has-icon has-icon--calendar" 
                    name="calculation[${idRacuna}][principal][date]" 
                    type="text" placeholder="npr. 1.12.2014" value="">
            </div>
            <div class="calculation-entry-field _actions">
                <button type="button" class="button button--pill button--tiny" data-item-payment-add>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/plus-circle.svg">
                        <path d="M9 6V12M6 9H12M16.5 9C16.5 13.1421 13.1421 16.5 9 16.5C4.85786 16.5 1.5 13.1421 1.5 9C1.5 4.85786 4.85786 1.5 9 1.5C13.1421 1.5 16.5 4.85786 16.5 9Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <span>Uplata</span>
                </button>
                <button type="button" class="button button--icon _animate _small tip" data-item-bill-copy aria-label="Kopiraj stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/copy.svg">
                        <path d="M12 12V14.1C12 14.9401 12 15.3601 11.8365 15.681C11.6927 15.9632 11.4632 16.1927 11.181 16.3365C10.8601 16.5 10.4401 16.5 9.6 16.5H3.9C3.05992 16.5 2.63988 16.5 2.31901 16.3365C2.03677 16.1927 1.8073 15.9632 1.66349 15.681C1.5 15.3601 1.5 14.9401 1.5 14.1V8.4C1.5 7.55992 1.5 7.13988 1.66349 6.81901C1.8073 6.53677 2.03677 6.3073 2.31901 6.16349C2.63988 6 3.05992 6 3.9 6H6M8.4 12H14.1C14.9401 12 15.3601 12 15.681 11.8365C15.9632 11.6927 16.1927 11.4632 16.3365 11.181C16.5 10.8601 16.5 10.4401 16.5 9.6V3.9C16.5 3.05992 16.5 2.63988 16.3365 2.31901C16.1927 2.03677 15.9632 1.8073 15.681 1.66349C15.3601 1.5 14.9401 1.5 14.1 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V9.6C6 10.4401 6 10.8601 6.16349 11.181C6.3073 11.4632 6.53677 11.6927 6.81901 11.8365C7.13988 12 7.55992 12 8.4 12Z"
                            stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
                <button type="button" class="button button--icon _animate _small tip" data-item-bill-remove aria-label="Izbriši stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/trash.svg">
                        <path d="M12 4.5V3.9C12 3.05992 12 2.63988 11.8365 2.31901C11.6927 2.03677 11.4632 1.8073 11.181 1.66349C10.8601 1.5 10.4401 1.5 9.6 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V4.5M2.25 4.5H15.75M14.25 4.5V12.9C14.25 14.1601 14.25 14.7902 14.0048 15.2715C13.789 15.6948 13.4448 16.039 13.0215 16.2548C12.5402 16.5 11.9101 16.5 10.65 16.5H7.35C6.08988 16.5 5.45982 16.5 4.97852 16.2548C4.55516 16.039 4.21095 15.6948 3.99524 15.2715C3.75 14.7902 3.75 14.1601 3.75 12.9V4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
        </div>
    `;

    container.appendChild(newEntry); // Dodaj novi račun u DOM

    // Ako dug dolazi iz baze
    if (dug) {

        const opisInput = newEntry.querySelector(".js-calculationDescription");
        const iznosInput = newEntry.querySelector(".js-calculationAmount");
        const dateInput = newEntry.querySelector(".js-calculationDate");
    
        if (opisInput) opisInput.value = dug.opis || "";
        if (iznosInput) iznosInput.value = dug.iznos || "";


        if (dateInput && dug.datum) {
            const formatted = formatirajDatum(dug.datum); // koristi helper kao kod uplata
            console.log("Dug datum iz baze:", dug.datum);
            console.log("Formatirano:", formatted);
            if (dateInput._flatpickr) {
                dateInput._flatpickr.setDate(formatted, true, "d.m.Y");
            } else {
                dateInput.value = formatted;
            }
        } else {
            console.warn("Nema dateInput ili datum nije definiran!");
        }
    }

    // SVGInject za sve SVG ikone (ako koristite SVGInject)
    setTimeout(() => SVGInject(newEntry.querySelectorAll("svg[data-inject-url]")), 500);

    // Uklanjanje readonly atributa
    let dateInput = newEntry.querySelector(".js-calculationDate");
    dateInput.removeAttribute("readonly");

     // Ponovno inicijaliziraj Flatpickr za novi unos
    if (typeof flatpickr !== "undefined") {
        let instance = flatpickr(dateInput, {
            locale: "hr",
            dateFormat: "d.m.Y",
            minDate: "30.05.1994",
            disableMobile: true,
            allowInput: true,
            onReady: function (selectedDates, dateStr, instance) {
                dodajDropdownZaGodine(instance);
            },
            onMonthChange: function (selectedDates, dateStr, instance) {
                azurirajGodinu(instance);
            }
        });
        // Ručno dodaj dropdown za godine ako se nije ispravno učitao
        setTimeout(() => dodajDropdownZaGodine(instance), 10);
    }
    // Dodaj event listener za unos decimalnih brojeva
    addDecimalFormatForInputs(newEntry);  
    // Dodaj return na kraju
    return newEntry;
}

function dodajUplatu(target = null, uplata = null) {
    let entry = target ? target.closest(".calculation-entry") : document.querySelector(".calculation-entry:last-of-type");
    if (!entry) return;

    let idInput = entry.querySelector(".js-calculationID");
    if (!idInput) {
        console.error("Greška: Račun nema ID! Provjeri dodavanje ID-a.");
        return;
    }

    let idRacuna = idInput?.value || "1"; // fallback ako nema

    let newPayment = document.createElement("div");
    newPayment.classList.add("_payment");
    newPayment.innerHTML = `
        <div class="calculation-entry-field _placeholder _uplata-marker"></div>
            <div class="calculation-entry-field _name">
                <p class="payment-heading">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"
                        data-inject-url="http://127.0.0.1:5000/static/images/corner-down-right.svg">
                        <path
                            d="M3 3v1.05c0 2.52 0 3.78.49 4.743a4.5 4.5 0 0 0 1.967 1.966c.963.491 2.223.491 4.743.491H15m0 0L11.25 7.5M15 11.25 11.25 15"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <span>Uplata</span>
                </p>
                <input class="js-paymentItem" name="calculation[${idRacuna}][payment][item]" type="hidden" value="payment">
            </div>
            <div class="calculation-entry-field _amount">
                <label for="" class="has-helper" data-field="${dohvatiValutu()}"></label>
                <input class="js-paymentAmount js-with-decimals" name="calculation[${idRacuna}][payment][amount]" type="text" inputmode="decimal" placeholder="npr. 1 000,00" value="">
            </div>
            <div class="calculation-entry-field _date">
                <label for="" class="sr-only">Datum uplate</label>
                <input class="js-paymentDate datepicker has-icon has-icon--calendar" name="calculation[${idRacuna}][payment][date]" type="text" placeholder="npr. 1.12.2014" value="">
            </div>
            <div class="calculation-entry-field _actions">
                <button type="button" class="button button--icon _animate _small tip" data-item-payment-copy=""
                    aria-label="Kopiraj stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"
                        data-inject-url="http://127.0.0.1:5000/static/images/copy.svg">
                        <path
                            d="M12 12V14.1C12 14.9401 12 15.3601 11.8365 15.681C11.6927 15.9632 11.4632 16.1927 11.181 16.3365C10.8601 16.5 10.4401 16.5 9.6 16.5H3.9C3.05992 16.5 2.63988 16.5 2.31901 16.3365C2.03677 16.1927 1.8073 15.9632 1.66349 15.681C1.5 15.3601 1.5 14.9401 1.5 14.1V8.4C1.5 7.55992 1.5 7.13988 1.66349 6.81901C1.8073 6.53677 2.03677 6.3073 2.31901 6.16349C2.63988 6 3.05992 6 3.9 6H6M8.4 12H14.1C14.9401 12 15.3601 12 15.681 11.8365C15.9632 11.6927 16.1927 11.4632 16.3365 11.181C16.5 10.8601 16.5 10.4401 16.5 9.6V3.9C16.5 3.05992 16.5 2.63988 16.3365 2.31901C16.1927 2.03677 15.9632 1.8073 15.681 1.66349C15.3601 1.5 14.9401 1.5 14.1 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V9.6C6 10.4401 6 10.8601 6.16349 11.181C6.3073 11.4632 6.53677 11.6927 6.81901 11.8365C7.13988 12 7.55992 12 8.4 12Z"
                            stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
                <button type="button" class="button button--icon _animate _small tip" data-item-payment-delete=""
                    aria-label="Izbriši stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"
                        data-inject-url="http://127.0.0.1:5000/static/images/trash.svg">
                        <path
                            d="M12 4.5V3.9C12 3.05992 12 2.63988 11.8365 2.31901C11.6927 2.03677 11.4632 1.8073 11.181 1.66349C10.8601 1.5 10.4401 1.5 9.6 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V4.5M2.25 4.5H15.75M14.25 4.5V12.9C14.25 14.1601 14.25 14.7902 14.0048 15.2715C13.789 15.6948 13.4448 16.039 13.0215 16.2548C12.5402 16.5 11.9101 16.5 10.65 16.5H7.35C6.08988 16.5 5.45982 16.5 4.97852 16.2548C4.55516 16.039 4.21095 15.6948 3.99524 15.2715C3.75 14.7902 3.75 14.1601 3.75 12.9V4.5"
                            stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>

    `;

    entry.appendChild(newPayment);
    animateEntry(newPayment); // Animacija za uplatu


    // Ako uplata dolazi iz baze (npr. prilikom učitavanja spremljenog izračuna)
    if (uplata) {
        const dateInput = newPayment.querySelector(".js-paymentDate");
        const amountInput = newPayment.querySelector(".js-paymentAmount");

        console.log("Dodajem uplatu iz baze:", uplata);
        console.log("Uplata datum iz baze:", uplata.datum);
        console.log("Formatirano:", formatirajDatum(uplata.datum));

        if (amountInput) {
            amountInput.value = uplata.iznos || "";
        }

        // Postavi datum
        if (dateInput && uplata.datum) {
            const formatted = formatirajDatum(uplata.datum);
    
            if (dateInput._flatpickr) {
                dateInput._flatpickr.setDate(formatted, true, "d.m.Y");
            } else {
                dateInput.value = formatted;
            }
        } else {
            console.warn("Nema dateInput ili datum nije definiran!");
        }
    }

    // Flatpickr za novo polje datuma
    setTimeout(() => {
        const dateField = newPayment.querySelector(".js-paymentDate");
        if (dateField) {
            flatpickr(dateField, {
                locale: "hr",
                dateFormat: "d.m.Y",
                minDate: "30.05.1994",
                disableMobile: true,
                allowInput: true,
                onReady: function (selectedDates, dateStr, instance) {
                    dodajDropdownZaGodine?.(instance);
                },
                onMonthChange: function (selectedDates, dateStr, instance) {
                    azurirajGodinu?.(instance);
                }
            });
        }
    }, 10);

    // Dodajem event listener za decimalne brojeve
    addDecimalFormatForInputs(newPayment);

    // Vraćam element natrag pozivatelju (npr. kopirajUplatu)
    return newPayment;
}

function kopirajRacun(target) {
    const original = target.closest(".calculation-entry");
    if (!original) return;

    // Dohvati podatke iz originalne stavke
    const opis = original.querySelector(".js-calculationDescription")?.value || "";
    const iznos = original.querySelector(".js-calculationAmount")?.value || "";
    const datum = original.querySelector(".js-calculationDate")?.value || "";

    // Dodaj novi račun kao da je kliknuto na "Dodaj stavku"
    const novi = dodajRacun();

    // Postavi vrijednosti
    novi.querySelector(".js-calculationDescription").value = opis;
    novi.querySelector(".js-calculationAmount").value = iznos;

    // Postavi datum ako postoji
    const dateInput = novi.querySelector(".js-calculationDate");
    if (dateInput && datum) {
        if (dateInput._flatpickr) {
            dateInput._flatpickr.setDate(datum, true, "d.m.Y");
        } else {
            dateInput.value = datum;
        }
    }

    // Dodaj animaciju
    animateEntry?.(novi);
}


function kopirajUplatu(target) {
    const originalPayment = target.closest("._payment");
    if (!originalPayment) return;

    const entry = target.closest(".calculation-entry");
    if (!entry) return;

    const idRacuna = entry.querySelector(".js-calculationID")?.value;
    if (!idRacuna) return;

    // Dohvati vrijednosti iz originala
    const iznos = originalPayment.querySelector(".js-paymentAmount")?.value || "";
    const datum = originalPayment.querySelector(".js-paymentDate")?.value || "";

    // Dodaj novu uplatu pomoću postojeće funkcije
    const newPayment = dodajUplatu(entry);

    if (!newPayment) return;

    // Postavi vrijednosti
    newPayment.querySelector(".js-paymentAmount").value = iznos;

    const dateInput = newPayment.querySelector(".js-paymentDate");
    if (dateInput && datum) {
        if (dateInput._flatpickr) {
            dateInput._flatpickr.setDate(datum, true, "d.m.Y");
        } else {
            dateInput.value = datum;
        }
    }

    animateEntry?.(newPayment);
}


function obrisiRacun(target) {
    let entry = target.closest(".calculation-entry");
    if (entry) {
        entry.remove();
        updateRemoveButtons(); // Ažuriraj gumbe za brisanje nakon uklanjanja
    }
}

function obrisiUplatu(target) {
    let payment = target.closest("._payment");
    if (payment) {
        payment.remove();
    }
}

// Funkcija za onemogućavanje brisanja na prvom računu
function updateRemoveButtons() {
    let allEntries = document.querySelectorAll(".calculation-entry");

    allEntries.forEach((entry, index) => {
        let removeBtn = entry.querySelector("[data-item-bill-remove]");
        if (removeBtn) {
            removeBtn.disabled = index === 0; // Prvi račun se ne može obrisati
        }
    });
}

// Funkcija za animaciju dodavanja novog unosa (glatko otvaranje)
function animateEntry(entry) {
    entry.style.opacity = "0"; // Početna nevidljivost
    entry.style.maxHeight = "0px";
    entry.style.overflow = "hidden"; // Sprječava nagli skok visine

    setTimeout(() => {
        entry.style.opacity = "1"; // Postupno prikazivanje
        entry.style.maxHeight = entry.scrollHeight + "px";
        entry.style.transition = "max-height 0.5s ease-out, opacity 0.5s ease-out";
    }, 10);
}

// Funkcija za animaciju brisanja unosa (glatko zatvaranje)
function animateRemoval(entry) {
    entry.style.opacity = "0";
    entry.style.maxHeight = "0px";
    entry.style.transition = "max-height 0.5s ease-in, opacity 0.5s ease-in";

    setTimeout(() => {
        entry.remove(); // Ukloni element nakon animacije
        updateRemoveButtons(); // Ponovno provjeri može li se nešto obrisati
    }, 500); // Pričekaj da animacija završi
}


// Funkcija za zatvaranje svih otvorenih dropdown menija
function zatvoriSveDropdownove() {
    document.querySelectorAll(".dropdown.open").forEach(dropdown => {
        dropdown.classList.remove("open");
        let content = dropdown.querySelector(".dropdown-content");
        if (content) content.classList.remove("open");
    });
    document.body.classList.remove("overlay");
}


document.querySelectorAll("#creditor-oib, #debtor-oib").forEach(oibField => {
    oibField.addEventListener("input", function () {
        if (this.validity.patternMismatch || this.value.length !== 11) {
            this.setCustomValidity("OIB mora sadržavati točno 11 znamenki.");
        } else {
            this.setCustomValidity(""); // Resetiraj poruku ako je unos ispravan
        }
    });
});



// Funkcija za prikaz podataka u calculation-entries-body
function prikaziRezultate(entries) {
    let calculationBody = document.querySelector(".calculation-entries-body");
    if (!calculationBody) return;

    calculationBody.innerHTML = ""; // Očisti stari prikaz prije dodavanja novih rezultata

    entries.forEach((entry) => {
        let idRacuna = racunID++; // 🆕 Dodijeli novi ID računa
        let newEntry = document.createElement("div");
        newEntry.classList.add("calculation-entry");

        // Dodaj _principal (glavnica)
        newEntry.innerHTML = `
        <div class="_principal">
            <input class="js-calculationID" name="calculation[${idRacuna}][id]" type="hidden" value="${idRacuna}">
            <div class="calculation-entry-field _counter">${idRacuna}</div>
            <div class="calculation-entry-field _name">
                <label class="field-label">Osnova za plaćanje</label>
                <input class="js-calculationDescription"
                    name="calculation[${idRacuna}][principal][description]" 
                    type="text" 
                    placeholder="npr. Troškovi" value="${originalPrincipal.querySelector('.js-calculationDescription').value  || ''}">
                <input class="js-calculationItem" 
                    name="calculation[${idRacuna}][principal][item]" 
                    type="hidden" value="principal">
            </div>
            <div class="calculation-entry-field _amount">
                <label class="field-label has-helper" data-field="${dohvatiValutu()}">Iznos</label>
                <input class="js-calculationAmount js-with-decimals" 
                    name="calculation[${idRacuna}][principal][amount]" 
                    type="number" placeholder="npr. 15 000,00" value="${entry.iznos || ''}">
            </div>
            <div class="calculation-entry-field _date">
                <label class="field-label">Datum dospijeća</label>
                <input class="js-calculationDate datepicker has-icon has-icon--calendar" 
                    name="calculation[${idRacuna}][principal][date]" 
                    type="text" placeholder="npr. 1.12.2014" value="${entry.datum || ''}">
            </div>
            <div class="calculation-entry-field _actions">
                <button type="button" class="button button--pill button--tiny" data-item-payment-add>
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/plus-circle.svg">
                        <path d="M9 6V12M6 9H12M16.5 9C16.5 13.1421 13.1421 16.5 9 16.5C4.85786 16.5 1.5 13.1421 1.5 9C1.5 4.85786 4.85786 1.5 9 1.5C13.1421 1.5 16.5 4.85786 16.5 9Z" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                    <span>Uplata</span>
                </button>
                <button type="button" class="button button--icon _animate _small tip" data-item-bill-copy aria-label="Kopiraj stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/copy.svg">
                        <path d="M12 12V14.1C12 14.9401 12 15.3601 11.8365 15.681C11.6927 15.9632 11.4632 16.1927 11.181 16.3365C10.8601 16.5 10.4401 16.5 9.6 16.5H3.9C3.05992 16.5 2.63988 16.5 2.31901 16.3365C2.03677 16.1927 1.8073 15.9632 1.66349 15.681C1.5 15.3601 1.5 14.9401 1.5 14.1V8.4C1.5 7.55992 1.5 7.13988 1.66349 6.81901C1.8073 6.53677 2.03677 6.3073 2.31901 6.16349C2.63988 6 3.05992 6 3.9 6H6M8.4 12H14.1C14.9401 12 15.3601 12 15.681 11.8365C15.9632 11.6927 16.1927 11.4632 16.3365 11.181C16.5 10.8601 16.5 10.4401 16.5 9.6V3.9C16.5 3.05992 16.5 2.63988 16.3365 2.31901C16.1927 2.03677 15.9632 1.8073 15.681 1.66349C15.3601 1.5 14.9401 1.5 14.1 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V9.6C6 10.4401 6 10.8601 6.16349 11.181C6.3073 11.4632 6.53677 11.6927 6.81901 11.8365C7.13988 12 7.55992 12 8.4 12Z"
                            stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
                <button type="button" class="button button--icon _animate _small tip" data-item-bill-remove aria-label="Izbriši stavku">
                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" data-inject-url="/static/images/trash.svg">
                        <path d="M12 4.5V3.9C12 3.05992 12 2.63988 11.8365 2.31901C11.6927 2.03677 11.4632 1.8073 11.181 1.66349C10.8601 1.5 10.4401 1.5 9.6 1.5H8.4C7.55992 1.5 7.13988 1.5 6.81901 1.66349C6.53677 1.8073 6.3073 2.03677 6.16349 2.31901C6 2.63988 6 3.05992 6 3.9V4.5M2.25 4.5H15.75M14.25 4.5V12.9C14.25 14.1601 14.25 14.7902 14.0048 15.2715C13.789 15.6948 13.4448 16.039 13.0215 16.2548C12.5402 16.5 11.9101 16.5 10.65 16.5H7.35C6.08988 16.5 5.45982 16.5 4.97852 16.2548C4.55516 16.039 4.21095 15.6948 3.99524 15.2715C3.75 14.7902 3.75 14.1601 3.75 12.9V4.5" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
        </div>
        `;

        // Dodaj _payment (uplate) ispod odgovarajuće glavnice
        if (entry.uplate && entry.uplate.length > 0) {
            entry.uplate.forEach((payment, paymentIndex) => {
                let paymentDiv = document.createElement("div");
                paymentDiv.classList.add("_payment");

                paymentDiv.innerHTML = `
                    <input class="js-calculationID" type="hidden" value="${idRacuna}">
                    <div class="calculation-entry-field _placeholder"></div>
                    <div class="calculation-entry-field _name">
                        <p class="payment-heading">
                            <span>Uplata</span>
                        </p>
                        <input class="js-paymentItem" name="calculation[${idRacuna}][payment][${paymentIndex}][item]" 
                            type="hidden" value="payment">
                    </div>
                    <div class="calculation-entry-field _amount">
                        <label class="has-helper" data-field="${dohvatiValutu()}"></label>
                        <input class="js-paymentAmount js-with-decimals change" 
                            name="calculation[${idRacuna}][payment][${paymentIndex}][paymentAmount]" 
                            type="number" value="${payment.iznos || ''}">
                    </div>
                    <div class="calculation-entry-field _date">
                        <label class="sr-only">Datum uplate</label>
                        <input class="js-paymentDate datepicker has-icon has-icon--calendar" 
                            name="calculation[${idRacuna}][payment][${paymentIndex}][date]" 
                            type="text" value="${payment.datum || ''}">
                    </div>
                `;

                newEntry.appendChild(paymentDiv);
            });
        }

        calculationBody.appendChild(newEntry);
    });
}


// Funkcija koja dodaje event listenere kada se dropdown generira
function inicijalizirajDropdown() {
    console.log("Funkcija inicijalizirajDropdown() JE POZVANA!");

    document.querySelectorAll("[data-toggle='dropdown']").forEach(button => {
        console.log("Pronađen dropdown button:", button);

        button.addEventListener("click", function (event) {
            event.preventDefault();  // Sprječava neželjeno reloadanje ili skakanje na vrh
            event.stopPropagation();

            console.log("Kliknut dropdown:", this);

            let targetId = this.getAttribute("data-target");
            let dropdown = document.getElementById(targetId);
            let parentDropdown = this.closest(".dropdown");
            
            console.log("Dropdown element:", dropdown);

            if (!dropdown || !parentDropdown) {
                console.warn("Dropdown ili parentDropdown ne postoji!", targetId);
                return;
            }

            let isOpen = parentDropdown.classList.contains("open");
            console.log("Dropdown status prije klika:", isOpen ? "OTVOREN" : "ZATVOREN");

            // **Premještam ovo ovdje!** (zatvori sve dropdownove PRIJE otvaranja novog)
            if (!isOpen) {
                zatvoriSveDropdownove(); 
            }

            // Ako dropdown NIJE otvoren, otvori ga
            if (!isOpen) {
                parentDropdown.classList.add("open");
                dropdown.classList.add("open");
                console.log("Dropdown OTVOREN");
            } else {
                console.log("Dropdown već bio otvoren, sada zatvoren");
            }
        });
    });
}



// Funkcija za generiranje HTML-a izračuna
function generirajHtmlZaRacun(idRacuna, opis, iznos, datum) {
    return `
        <div class="_principal">
            <input class="js-calculationID" name="calculation[${idRacuna}][id]" type="hidden" value="${idRacuna}">
            <div class="calculation-entry-field _counter">${idRacuna}</div>
            <div class="calculation-entry-field _name">
                <label class="field-label">Osnova za plaćanje</label>
                <input class="js-calculationDescription"
                    name="calculation[${idRacuna}][principal][description]" 
                    type="text" value="${opis || "Neimenovani račun"}">
            </div>
            <div class="calculation-entry-field _amount">
                <label class="field-label has-helper" data-field="${dohvatiValutu()}">Iznos</label>
                <input class="js-calculationAmount js-with-decimals" 
                    name="calculation[${idRacuna}][principal][amount]" 
                    type="number" value="${iznos || 0}">
            </div>
            <div class="calculation-entry-field _date">
                <label class="field-label">Datum dospijeća</label>
                <input class="js-calculationDate datepicker" 
                    name="calculation[${idRacuna}][principal][date]" 
                    type="text" value="${datum || ""}">
            </div>
        </div>
    `;
}


function generirajTaskbar() {
    return `
                <div id="taskbar" class="taskbar">
                    <div class="dropdown">
                        <button class="button button--pill-ghost button--tiny button--chevron" data-toggle="dropdown" data-target="saveCalculation">
                            <span>Spremi izračun</span>
                            <img src="/static/images/chevron-down.svg" onload="SVGInject(this)" class="dropdown-indicator" />
                        </button>
                        <div id="saveCalculation" class="dropdown-content" style="min-width: 200px">
                            <ul class="dropdown-menu">
                                <li class="dropdown-menu-item">
                                    <button id="storeCalculation" form="form" class="dropdown-menu-link button--plain" formaction="/spremi_izracun" name="formAction">
                                        <img src="/static/images/save.svg" onload="SVGInject(this)" />
                                        <span>Spremi</span>
                                    </button>
                                </li>
                                <li class="dropdown-menu-item">
                                    <button class="dropdown-menu-link button--plain" data-generate="pdf" data-download="pdf">
                                        <img src="/static/images/pdf-export.svg" onload="SVGInject(this)" />
                                        <span>Izvezi u PDF</span>
                                    </button>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <button class="button button--pill-ghost button--tiny" data-generate="pdf">Prikaži PDF</button>
                    <div class="taskbar-fabs">
                        <a id="downloadCsv" href="#" class="button button--pill-ghost button--tiny">
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none"
                                data-inject-url="/static/images/download.svg">
                                <path d="M15.75 15.75H2.25M13.5 8.25L9 12.75M9 12.75L4.5 8.25M9 12.75V2.25" stroke="currentColor"
                                    stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                            <span>Preuzmi CSV</span>
                        </a>
                        <div class="dropdown show-for-medium">
                            <button class="button button--icon _animate tip" data-toggle="dropdown" data-target="tableDisplay" aria-label="Prilagodi prored">
                                <img src="/static/images/paragraph-spacing.svg" onload="SVGInject(this)" />
                            </button>
                            <div id="tableDisplay" class="dropdown-content dropdown-content--right" style="min-width: 200px">
                                <header class="dropdown-content-header">Prilagodi prored</header>
                                <ul class="dropdown-menu">
                                    <li class="dropdown-menu-item">
                                        <button type="button" class="button dropdown-menu-link" data-display="condensed"><span>Jednostruki</span></button>
                                    </li>
                                    <li class="dropdown-menu-item">
                                        <button type="button" class="button dropdown-menu-link selected" data-display="proportional"><span>Proporcionalni</span></button>
                                    </li>
                                    <li class="dropdown-menu-item">
                                        <button type="button" class="button dropdown-menu-link" data-display="relaxed"><span>Dvostruki</span></button>
                                    </li>
                                </ul>
                            </div>
                        </div>
                        <button class="button button--icon _animate tip" aria-label="Novi izračun" data-page-reload>
                            <img src="/static/images/refresh.svg" onload="SVGInject(this)" />
                        </button>
                        <div class="show-for-medium">
                            <button class="triggerFocusMode button button--icon _animate tip" aria-label="Otvori puni zaslon" data-toggle="focus-mode">
                                <img src="/static/images/expand.svg" onload="SVGInject(this)" />
                            </button>
                            <button class="triggerFocusMode button button--icon _animate tip" aria-label="Zatvori zaslon" data-toggle="focus-mode" hidden>
                                <img src="/static/images/close.svg" onload="SVGInject(this)" />
                            </button>
                        </div>
                    </div>
                </div>
    `;
}
function generirajOsnovnePodatke(result) {
    // Dohvaćam podatke o vjerovniku i dužniku
    let creditor = result.vjerovnik || {};
    let debtor = result.duznik || {};
    
    let creditorName = creditor.naziv || "";
    let creditorAddress = creditor.adresa || "";
    let creditorCity = creditor.mjesto || "";
    let creditorOib = creditor.oib || "";
    
    let debtorName = debtor.naziv || "";
    let debtorAddress = debtor.adresa || "";
    let debtorCity = debtor.mjesto || "";
    let debtorOib = debtor.oib || "";

    // Provjeravam jesu li svi podaci prazni
    let imaPodataka = (
        creditorName || creditorAddress || creditorCity || creditorOib ||
        debtorName || debtorAddress || debtorCity || debtorOib
    );

    return `
                <div class="interests-detailed-wrapper">
                    <div class="calculation-result">
                        <div class="printout-header">
                            <header class="h4">Izračun zakonskih zateznih kamata</header>
                        </div>
                        <div class="printout-data">
                            <table class="printout-settings">
                                <tbody>
                                    <tr>
                                        <th>Naziv izračuna:</th>
                                        <td>${document.getElementById("calculation-name")?.value || ""}</td>
                                    </tr>
                                    <tr>
                                        <th>Opis izračuna:</th>
                                        <td>${document.getElementById("calculation-description")?.value || ""}</td>
                                    </tr>
                                    <tr>
                                        <th>Vrsta izračuna:</th>
                                        <td>${document.querySelector("input[name='calculation-type']:checked")?.nextElementSibling.textContent
                                            || "Nije odabrano"}</td>
                                    </tr>
                                    <tr>
                                        <th>Datum izračuna:</th>
                                        <td>${document.getElementById("datepicker0")?.value || ""}</td>
                                    </tr>
                                    <tr>
                                        <th>Valuta:</th>
                                        <td>${document.getElementById("currency-list")?.value || ""}</td>
                                    </tr>
                                </tbody>
                            </table>
                            <!-- Prikazujemo podatke samo ako su uneseni -->
                            ${imaPodataka ? `
                            <div class="printout-parties">
                                <div class="printout-debtor">
                                    <header>Vjerovnik:</header>
                                    <address>
                                        ${creditor.naziv ? `${creditor.naziv}<br>` : ""}
                                        ${creditor.adresa ? `${creditor.adresa}<br>` : ""}
                                        ${creditor.mjesto ? `<span class="text-uppercase">${creditor.mjesto}</span><br>` : ""}
                                        ${creditor.oib ? `<span class="text-uppercase">OIB:</span> ${creditor.oib}` : ""}
                                </div>
                            <div class="printout-creditor">
                                <header>Dužnik:</header>
                                <address>
                                    ${creditor.naziv ? `${debtor.naziv}<br>` : ""}
                                    ${debtor.adresa ? `${debtor.adresa}<br>` : ""}
                                    ${debtor.mjesto ? `<span class="text-uppercase">${debtor.mjesto}</span><br>` : ""}
                                    ${debtor.oib ? `<span class="text-uppercase">OIB:</span> ${debtor.oib}` : ""}
                                </address>
                            </div>
                        </div> 
                    </div> 
                ` : ""}
                </div>
    `;
}





function generirajTablicuKamata(result) {
    if (!Array.isArray(result.glavnice)) result.glavnice = [];
    if (!Array.isArray(result.kamate)) result.kamate = [];
    if (!Array.isArray(result.uplate)) result.uplate = [];

    let html = `
        <div class="interests-detailed-wrapper">
            <div class="interests-detailed">
    `;

    result.racuni.forEach((racun, index) => {
        const moratorij_globalno_ukljucen = result.moratorij === true;

        if (index > 0) {
            html += `<div style="height: 30px;"></div>`;  
        }

        let idRacuna = racun.id_racuna;
        (`Račun #${index} - ID: ${idRacuna}, Glavnica: ${racun.iznos}`);
        console.log("Detalji računa:", racun);
        let uplateZaOvajRacun = racun.uplate || [];
        let trenutniDug = racun.iznos; // Glavnica na početku
        let preplata = null; // Bilježim prvu preplatu ako se dogodi

        
        // SPOJIM KAMATE I UPLATE U JEDAN NIZ
        let kombiniraniPodaci = [];

        // Prikazujemo koje kamate su prošle kroz filter
        let kamateZaGlavnicu = result.kamate.filter(kamata => {
            let isMatch = kamata.id_racuna === racun.id_racuna; // Filtriram po ID-u računa umjesto glavnice
            return isMatch;
        });

        // Dodajem SVE periode kamata za ovaj račun
        kamateZaGlavnicu.forEach(kamata => {
            kombiniraniPodaci.push({ ...kamata, tip: "kamata" });
        });

        // Prvo sortiram result.rezultat po datumu da budem sigurna da uzimam najnoviji unos
        let sortiraniRezultat = [...result.rezultat].sort((a, b) => {
            let datumA = new Date(a.datum.split('.').reverse().join('-')).getTime();
            let datumB = new Date(b.datum.split('.').reverse().join('-')).getTime();
            return datumA - datumB;
        });

        // Mapiraj sve uplate po redu kako dolaze i sparuj s istim po datumu i ID-u (ali redom)
        let preostaliRezultati = sortiraniRezultat.filter(stavka => stavka.opis === "Uplata");

        uplateZaOvajRacun.forEach(uplata => {
            let index = preostaliRezultati.findIndex(stavka =>
                stavka.id_racuna === uplata.id_racuna && stavka.datum === uplata.datum
            );

            let odgovarajuciRezultat = index !== -1 ? preostaliRezultati.splice(index, 1)[0] : null;

            kombiniraniPodaci.push({
                ...uplata,
                tip: "uplata",
                dug_kamata: odgovarajuciRezultat ? parseFloat(odgovarajuciRezultat.dug_kamata ?? 0) : 0,
                ukupni_dug: odgovarajuciRezultat ? parseFloat(odgovarajuciRezultat.ukupni_dug ?? 0) : 0
            });
        });        

        // Filtriram duplikate moratorija (kamata 0%) da ne budu prikazani više puta
        kombiniraniPodaci = kombiniraniPodaci.filter((stavka, index, self) => {
            return (
                stavka.tip === "uplata" ||  // Čuvam sve uplate
                stavka.kamata_stopa === 0 || // Moratorijum uvek ostaje
                self.findIndex(s => 
                    s.period_od === stavka.period_od && 
                    s.period_do === stavka.period_do && 
                    s.kamata_stopa === stavka.kamata_stopa &&
                    s.broj_dana === stavka.broj_dana &&
                    s.dug_kamata === stavka.dug_kamata
                ) === index
            );
    });

        // Dodajem sortKey kako bi osigurala pravilan redoslijed uplate i kamata
        kombiniraniPodaci = kombiniraniPodaci.map(stavka => {
            let datum = new Date(stavka.datum.split('.').reverse().join('-')).getTime();

            if (stavka.tip === "kamata") {
                if (stavka.period_do === stavka.datum) {
                    return { ...stavka, sortKey: datum - 10 }; // Kamate koje završavaju na datum uplate dolaze prve
                }
                if (stavka.period_od === stavka.datum) {
                    return { ...stavka, sortKey: datum + 10 }; // Kamate koje počinju nakon uplate dolaze kasnije
                }
            }
        
            if (stavka.tip === "uplata") {
                return { ...stavka, sortKey: datum }; // Uplata ostaje na točnom datumu
            }
        
            return { ...stavka, sortKey: datum };
        });
        // Sortiram koristeći sortKey
        kombiniraniPodaci.sort((a, b) => a.sortKey - b.sortKey);

        html += `
            <table class="table" data-table="interests-detailed" id="tablica-kamata">
                <caption>PREGLED IZRAČUNA</caption>
                <thead>
                    <tr>
                        <th class="description" colspan="3">Stavka / Opis</th>
                        <th class="date">Datum</th>
                        <th class="amount">Iznos</th>
                        <th class="interest-debt">Dug po kamati</th>
                        <th class="total-debt">Ukupni dug</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="glavnica-G-${index}">
                        <td class="description" data-th="Opis / Stavka" colspan="3">
                            <span class="description-label">Glavnica</span>
                            <span class="description-content">${racun.glavnica_naziv || "Neimenovani račun"}</span>
                        </td>
                        <td class="date" data-th="Datum">${racun.datum_pocetka || "N/A"}</td>
                        <td class="amount"data-th="Iznos">${(racun.iznos ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="debt" data-th="Dug po kamati">0,00</td>
                        <td class="total-debt" data-th="Ukupni dug">${(racun.iznos ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                    <tr class="period-obračuna">
                        <td class="calculationPeriod">Period obračuna</td>
                        <td class="base">Osnovica</td>
                        <td class="dateDiff">Br. dana</td>
                        <td class="interestRate">K. stopa</td>
                        <td class="interest">Kta razdoblja</td>
                        <td class="interestCumulative">Kta kumulativno</td>
                        <td class="totalDebt">Dug kumulativno</td>
                    </tr>
        `;

        let moratorij_na_ovu_glavnicu = false;

        let preplatePoDatumuIRacunu = {};
        (result.preplate || []).forEach(preplata => {
            preplatePoDatumuIRacunu[`${preplata.id_racuna}_${preplata.datum}`] = preplata.iznos;
        });

        kombiniraniPodaci.forEach((stavka, indexStavke) => {
            let jeUplata = stavka.kamata_stopa === undefined && stavka.iznos !== undefined;
        
            if (jeUplata) {
                let iznosBroj = typeof stavka.iznos === "string"
                    ? parseFloat(stavka.iznos.replace(",", "."))
                    : parseFloat(stavka.iznos);
        
                if (isNaN(iznosBroj)) {
                    console.warn("`iznos` je NaN, postavljam na 0:", stavka.iznos);
                    iznosBroj = 0;
                }
        
                // Osiguraj negativnu vrijednost uplate
                iznosBroj = -Math.abs(iznosBroj);
                trenutniDug += iznosBroj;

                // Provjeri je li za ovu uplatu evidentirana preplata
                let kljucPreplate = `${racun.id_racuna}_${stavka.datum}`;
                let iznosPreplate = preplatePoDatumuIRacunu[kljucPreplate];

                let ukupniDugZaPrikaz = trenutniDug;

                html += `
                    <tr class="uplata-U-${indexStavke}">
                        <td class="description" data-th="Opis / Stavka" colspan="3">
                            <span class="description-label">Uplata</span>
                        </td>
                        <td class="date">${stavka.datum || "N/A"}</td>
                        <td class="payment-amount">${iznosBroj.toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="debt">${(stavka.dug_kamata ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="total-debt">${(trenutniDug < 0 ? '−' : '') + Math.abs(trenutniDug).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                `;
        
                if (trenutniDug < 0 && preplata === null) {
                    preplata = {
                        datum: stavka.datum,
                        iznos: Math.abs(trenutniDug)
                    };

                    // OVDJE dodajem napomenu o moratoriju ako je rezultat preplata
                    if (moratorij_globalno_ukljucen) {
                        moratorij_na_ovu_glavnicu = true;
                    }
        
                    html += `
                        <tr class="preplata">
                            <td class="description" data-th="Opis / Stavka" colspan="3">
                                <span class="description-label">Preplata</span>
                            </td>
                            <td class="date"></td>
                            <td class="payment-amount"></td>
                            <td class="debt"></td>
                            <td class="total-debt">−${preplata.iznos.toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        </tr>
                    `;
        
                    return; // Završavam prikaz za ovaj račun
                }
            } else {
                // Kamata
                trenutniDug += stavka.kta_razdoblja ?? 0;
        
                let period = izvuciPeriod(stavka.opis);
                html += `
                    <tr class="kamata-${indexStavke}">
                        <td class="calculationPeriod">${period.period_long}</td>
                        <td class="base">${(stavka.osnovica ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="dateDiff">${stavka.broj_dana ?? 0}</td>
                        <td class="interestRate">${(stavka.kamata_stopa ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })} %</td>
                        <td class="interest">${(stavka.kta_razdoblja ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="interestCumulative">${(stavka.dug_kamata ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                        <td class="totalDebt">${(stavka.ukupni_dug ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })}</td>
                    </tr>
                `;
        
                if (stavka.kamata_stopa === 0) {
                    moratorij_na_ovu_glavnicu = true;
                }
            }
        });

        // Nakon što su svi podaci obrađeni, dodajem napomenu **na kraju tablice**
        if (moratorij_na_ovu_glavnicu) {
            html += prikaziNapomenuMoratorija();
        }
    });

    html += `</div></div>`;  
    return html;
}





// Napomena o moratoriju (ako je primijenjen)
function prikaziNapomenuMoratorija() {
    return `
        <tr class="napomena-moratorij">
            <td class="description" data-th="Napomena" colspan="7">
                <div class="calculation-notice">
                    <strong><span class="description-label sr-only">Napomena</span></strong>
                    <strong class="calculation-notice-title">Napomena:</strong>
                    <span class="calculation-notice-item">
                        Za razdoblje od 18.4.2020. do 18.10.2020. godine ne teče zatezna kamata sukladno članku 25.a i članku 25.b Zakona o provedbi ovrhe na novčanim sredstvima (NN 68/18, 02/20, 46/20, 47/20).
                    </span>
                </div>
            </td>
        </tr>
    `;
}


function generirajRekapitulaciju(result) {
    let ukupniDug = (result.ukupnaGlavnica ?? 0) + (result.ukupneKamate ?? 0) - (result.ukupneUplate ?? 0);

    if (result.ukupniDug?.iznos) {
        ukupniDug = result.ukupniDug.iznos;
    }

    let zadnjeKamatePoGlavnici = {};
    if (result.kamate && result.kamate.length > 0) {
        result.kamate.forEach(k => {
            zadnjeKamatePoGlavnici[k.id_racuna] = k.dug_kamata;
        });
    }

    if (Object.keys(zadnjeKamatePoGlavnici).length === 0) {
        console.warn("Nema podataka o kamatama, postavljamo zadanu vrijednost 0.");
        zadnjeKamatePoGlavnici = { "default": 0 };
    }

    let ukupneKamate = Object.values(zadnjeKamatePoGlavnici).reduce((sum, val) => sum + val, 0);

    let html = `
        <div class="table-summary table-summary--interests" id="rekapitulacija">
            <table class="table" data-table="interests-summary">
                <caption>Rekapitulacija</caption>
                <tbody>
    `;

    // Ovdje prekidam template string i kreće logika
    if (!result.preplate || result.preplate.length === 0) {
        html += `
                    <tr>
                        <td>Glavnica (${result.glavnice?.length ?? 0})</td>
                        <td>${(result.ukupnaGlavnica && result.ukupnaGlavnica !== 0) 
                            ? result.ukupnaGlavnica.toLocaleString("hr-HR", { minimumFractionDigits: 2 }) 
                            : result.glavnice.reduce((sum, g) => sum + (g.iznos ?? 0), 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })} 
                            ${result.valuta || "EUR"}
                        </td>
                    </tr>
                    <tr>
                        <td>Kamate</td>
                        <td>${ukupneKamate.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
                    </tr>
                    <tr>
                        <td>Uplate (${result.uplate?.length ?? 0})</td>
                        <td>${(result.ukupneUplate ?? 0).toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || dohvatiValutu()}</td>
                    </tr>
                    <tr>
                        <td>${result.ukupniDug.opis || "Ukupni dug"}</td>
                        <td>${ukupniDug.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
                    </tr>
        `;
    }

    // DODAJEM PREPLATU ako postoji
    if (result.preplate && result.preplate.length > 0) {
        const ukupnaPreplata = result.preplate.reduce((sum, p) => sum + (p.iznos ?? 0), 0);
    
        const ukupnaGlavnica = result.ukupnaGlavnica ?? result.racuni.reduce((sum, r) => sum + (r.iznos ?? 0), 0);
        const ukupneUplate = result.uplate?.reduce((sum, u) => sum + (u.iznos ?? 0), 0) ?? 0;
    
        // Dug po svakom računu - uzimam zadnji ukupni_dug po računu
        const zadnjiDugPoRacunu = {};
        (result.rezultat || []).forEach(r => {
            if (r.id_racuna && typeof r.ukupni_dug === 'number') {
                const datum = new Date(r.datum.split('.').reverse().join('-'));
                const postoji = zadnjiDugPoRacunu[r.id_racuna];
                const postojiDatum = postoji ? new Date(postoji.datum.split('.').reverse().join('-')) : null;
    
                if (!postoji || datum > postojiDatum) {
                    zadnjiDugPoRacunu[r.id_racuna] = r;
                }
            }
        });
    
        const ukupniDugBezPreplata = Object.values(zadnjiDugPoRacunu)
            .reduce((sum, r) => sum + (r.ukupni_dug ?? 0), 0);
    
        const ukupniDug = Math.round((ukupniDugBezPreplata - ukupnaPreplata) * 100) / 100;
    
        // Kamate nakon uplata (zadnji dug po kamati po računu)
        const zadnjiDugPoKamatiPoRacunu = {};
        (result.rezultat || []).forEach(r => {
            if (r.kamata_stopa !== undefined && r.id_racuna && typeof r.dug_kamata === 'number') {
                const datum = new Date(r.datum.split('.').reverse().join('-'));
                const postoji = zadnjiDugPoKamatiPoRacunu[r.id_racuna];
                const postojiDatum = postoji ? new Date(postoji.datum.split('.').reverse().join('-')) : null;
    
                if (!postoji || datum > postojiDatum) {
                    zadnjiDugPoKamatiPoRacunu[r.id_racuna] = r;
                }
            }
        });
    
        const kamateNakonUplata = Object.values(zadnjiDugPoKamatiPoRacunu)
            .reduce((sum, r) => sum + (r.dug_kamata ?? 0), 0);
    
        html += `
            <tr>
                <td>Glavnica (${result.racuni.length})</td>
                <td>${ukupnaGlavnica.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
            </tr>
            <tr>
                <td>Kamate</td>
                <td>${kamateNakonUplata.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
            </tr>
            <tr>
                <td>Uplate (${result.uplate?.length ?? 0})</td>
                <td>${ukupneUplate.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
            </tr>
            <tr>
                <td>${result.ukupniDug && result.ukupniDug.opis ? result.ukupniDug.opis : "Ukupni dug"}</td>
                <td>${ukupniDug.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
            </tr>
            <tr>
                <td>Preplata (${result.preplate.length})</td>
                <td>−${ukupnaPreplata.toLocaleString("hr-HR", { minimumFractionDigits: 2 })} ${result.valuta || "EUR"}</td>
            </tr>
        `;
    }

    html += `
                </tbody>
            </table>
        </div>
    `;

    return html;
}


// Izračun kamata i slanje podataka
async function izracunajKamate() {
    console.log("Funkcija izracunajKamate() JE POZVANA!");
    let iznos = parseFloat(document.getElementById("iznos")?.value) || 0;
    let datumPocetka = document.getElementById("datum_pocetka")?.value || "";
    let datumKraja = document.getElementById("datum_kraja")?.value || "";
    let tipSubjekta = document.querySelector('input[name="calculation-type"]:checked')?.value || "natural-person";
    let moratorium = document.getElementById("moratorium")?.checked || false;

    // Prikupljanje podataka o vjerovniku i dužniku
    let vjerovnik = {
        naziv: document.getElementById("creditor-name")?.value.trim() || "",
        adresa: document.getElementById("creditor-address")?.value.trim() || "",
        mjesto: document.getElementById("creditor-city")?.value.trim() || "",
        oib: document.getElementById("creditor-oib")?.value.trim() || ""  // OIB može biti prazan
    };

    let duznik = {
        naziv: document.getElementById("debtor-name")?.value.trim() || "",
        adresa: document.getElementById("debtor-address")?.value.trim() || "",
        mjesto: document.getElementById("debtor-city")?.value.trim() || "",
        oib: document.getElementById("debtor-oib")?.value.trim() || ""  // OIB može biti prazan
    };

    // Debug ispis odmah nakon prikupljanja podataka
    console.log("Prikupljeni podaci - Vjerovnik:", vjerovnik);
    console.log("Prikupljeni podaci - Dužnik:", duznik);

    // Prikupljanje uplata iz forme
    let uplate = Array.from(document.querySelectorAll(".uplate-row")).map(row => {
        let datum = row.querySelector(".uplata-datum")?.value || "";
        let iznosUplate = parseFloat(row.querySelector(".uplata-iznos")?.value) || 0;
        return datum && !isNaN(iznosUplate) ? { datum, iznos: iznosUplate } : null;
    }).filter(item => item !== null); // Uklanja prazne ili neispravne uplate

    // Validacija unosa (sprječava slanje praznih podataka)
    if (!iznos || !datumPocetka || !datumKraja) {
        document.getElementById("rezultat").innerText = "Molimo unesite sve potrebne podatke!";
        return;
    }

    // Sastavljanje podataka za slanje
    let podaci = {
        iznos,
        datum_pocetka: datumPocetka,
        datum_kraja: datumKraja,
        tip_subjekta: tipSubjekta,
        moratorium,
        vjerovnik,
        duznik,
        uplate
    };

    // PRIKAZUJEM ŠTO SE ŠALJE SERVERU
    console.log("Podaci poslani serveru:", JSON.stringify(podaci, null, 2));

    // Slanje podataka backendu
    try {
        let response = await fetch("/izracun", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(podaci)
        });

        let result = await response.json();

        window.jsonResponse = result;  // Spremi rezultat globalno
        console.log("Spremljen JSON odgovor u window.jsonResponse:", window.jsonResponse);

        if (result.error) {
            alert("Greška: " + result.error);p
            return;
        }

        console.log("Pozivam prikaziRezultate(result)...");  
        prikaziRezultate(result);
        console.log("prikaziRezultate(result) završio.");

    } catch (error) {
        console.error("Greška pri izračunu:", error);
        alert("Došlo je do greške. Pokušajte ponovo.");
    }
}


// Prikaz rezultata
function prikaziRezultate(result) {
    // Kreiraj jedan niz sa svim podacima (glavnica, kamate, uplate)
    let prikazPodataka = [
        ...result.glavnice.map(item => ({ ...item, tip: "glavnica" })), 
        ...result.kamate.map(item => ({ ...item, tip: "kamata" })), 
        ...result.uplate.map(item => ({ ...item, tip: "uplata" }))
    ];

    // Filtriram samo one koji imaju ispravan datum
    prikazPodataka = prikazPodataka.filter(item => item.datum);

    // Osiguraj ispravan redoslijed sortiranjem po datumu
    prikazPodataka.sort((a, b) => {
        let datumA = new Date(a.datum.split('.').reverse().join('-')); 
        let datumB = new Date(b.datum.split('.').reverse().join('-'));
        return datumA - datumB;
    });

    let outputSection = document.querySelector(".section.output.interests");

    // Ako postoji sekcija, OČISTI sadržaj, ali ne briši element
    if (!outputSection) {
        let resultDiv = document.querySelector(".calculation-result");
        if (!resultDiv) {
            console.error("Greška: .calculation-result ne postoji!");
            return;
        }
        outputSection = document.createElement("section");
        outputSection.classList.add("section", "output", "interests");
        outputSection.setAttribute("data-output", "interest");
        outputSection.setAttribute("data-tabpanel", "interest");
        resultDiv.appendChild(outputSection);
    }

    // Ako nema podataka, prikaži poruku i prekini funkciju
    if (!result || !result.rezultat || result.rezultat.length === 0) {
        console.error("Nema podataka za prikaz:", result);
        outputSection.innerHTML = "<p>Nema podataka za prikaz.</p>";
        return;
    }

    // Generiraj HTML **bez dupliciranja <section>**
    outputSection.innerHTML = `
        ${generirajTaskbar()}
        ${generirajOsnovnePodatke(result)}
        <div class="interests-detailed-wrapper">
            <div class="interests-detailed">
                <table class="table" data-table="interests-detailed" id="tablica-kamata">
                    ${generirajTablicuKamata(result)}
                </table>
            </div>
        </div>
        
        ${generirajRekapitulaciju(result)}
    `;

    const rezultatWrapper = document.getElementById("calculation-result");
    if (rezultatWrapper) {
        rezultatWrapper.classList.remove("hidden");
    }

    // Postavi MutationObserver za praćenje promjena u tablici
    const tbody = document.querySelector("table[data-table='interests-detailed'] tbody");

    if (tbody) {
        console.log("Pratim promjene u tbody tablice...");

        const observer = new MutationObserver((mutationsList, observer) => {
            if (tbody.children.length > 0) {
                console.log(`Detektirani redovi u tablici: ${tbody.children.length}`);
                observer.disconnect(); // Prekidam promatranje jer su podaci učitani
                generirajCSV(); // Tek sada pokrećem generiranje CSV-a
            }
        });

        observer.observe(tbody, { childList: true });
    }

    // Nakon što HTML ažurira, ponovno dodaj event listenere za PDF i CSV gumbe
    dodajEventListenereZaPDF();
    dodajEventListenereZaCSV();
    dodajEventListenereZaProred();
    

    // Postavi status prikaza na "success"
    outputSection.setAttribute("data-state", "success");

    // Čekaj 500ms kako bi osigurao da se DOM ažurirao, a zatim pokreni CSV generiranje
    setTimeout(() => {
        console.log("DOM ažuriran - Pokrećem generirajCSV()...");
        generirajCSV();
    }, 500);

    console.log("Pozivam inicijalizirajDropdown() iz prikaziRezultate()..."); 
    inicijalizirajDropdown();  // OVDJE DODAJEMO POZIV!
}


// Postavljanje zadnje odabrane opcije iz localStorage-a
let savedDisplay = localStorage.getItem("displayChoice");
if (savedDisplay) {
    resultsSection.setAttribute("data-display", savedDisplay);
    let selectedButton = document.querySelector(`[data-display="${savedDisplay}"]`);
    if (selectedButton) selectedButton.classList.add("selected");
}

document.getElementById("currency-list")?.addEventListener("change", function () {
    let rekapitulacija = document.getElementById("rekapitulacija");
    if (rekapitulacija) {
        rekapitulacija.innerHTML = generirajRekapitulaciju(result);  // Ponovno generiraj rekapitulaciju
    }
});


// Funkcija za preuzimanje CSV-a
function preuzmiCSV() {
    console.log("Preuzimam CSV...");
    let link = document.createElement("a");
    link.href = "/preuzmi_csv";  // Backend ruta
    link.download = "izracun_kamata.csv";  
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


function toggleDropdown(event) {
    event.stopPropagation();  // Sprječava zatvaranje odmah zbog document.addEventListener("click")

    let targetId = event.currentTarget.getAttribute("data-target");
    let dropdown = document.getElementById(targetId);
    let parentDropdown = event.currentTarget.closest(".dropdown");

    if (!dropdown || !parentDropdown) return;

    let isOpen = parentDropdown.classList.contains("open");

    // Ako je dropdown već otvoren, zatvaramo ga
    if (isOpen) {
        console.log("Dropdown zatvaram...");
        parentDropdown.classList.remove("open");
        dropdown.classList.remove("open");
        document.body.classList.remove("overlay");
        return;
    }

    // Ako dropdown nije bio otvoren, zatvorim sve druge dropdownove pre nego što ga otvorim
    zatvoriSveDropdownove();
    parentDropdown.classList.add("open");
    dropdown.classList.add("open");
    document.body.classList.add("overlay");

    // Dodajemo event listener na dropdown da se zatvori ako korisnik klikne unutra
    dropdown.addEventListener("click", function (e) {
        e.stopPropagation(); // Sprječava propagaciju do document.addEventListener
        console.log("Kliknut dropdown - zatvaram ga");
        parentDropdown.classList.remove("open");
        dropdown.classList.remove("open");
        document.body.classList.remove("overlay");
    }, { once: true }); // Listener se dodaje samo jednom
}

function filtrirajIzracune() {
    let input = document.getElementById("searchInput").value.toLowerCase();
    let rows = document.querySelectorAll("tbody tr");

    rows.forEach(row => {
        let nazivElement = row.querySelector(".stored-calculations-name span");

        if (nazivElement) {
            let naziv = nazivElement.textContent.toLowerCase();
            row.style.display = naziv.includes(input) ? "" : "none";
        }
    });
}


function dodajEventListenereZaProred() {
    const buttons = document.querySelectorAll("[data-display]");
    const resultsSection = document.querySelector(".section.output.interests");

    if (!resultsSection) return;

    buttons.forEach(button => {
        button.addEventListener("click", function () {
            const displayType = this.getAttribute("data-display");
            localStorage.setItem("displayChoice", displayType);
            resultsSection.setAttribute("data-display", displayType);

            // Ažuriraj vizualni prikaz aktivnog gumba
            buttons.forEach(btn => btn.classList.remove("selected"));
            this.classList.add("selected");
        });
    });

    // Postavi prethodno odabrani prikaz ako postoji
    const stored = localStorage.getItem("displayChoice");
    if (stored) {
        resultsSection.setAttribute("data-display", stored);
        buttons.forEach(btn => {
            btn.classList.toggle("selected", btn.getAttribute("data-display") === stored);
        });
    }
}


function popuniFormuIzracunom(izracun) {
    if (!izracun) return;

    // Naziv i datum
    document.getElementById("calculation-name").value = izracun.naziv || "";

    // Flatpickr datum
    if (window.flatpickrInstance0 && izracun.datum) {
        window.flatpickrInstance0.setDate(izracun.datum, true, "d.m.Y");
    } else {
        document.getElementById("datepicker0").value = izracun.datum || "";
    }

    // Opis
    document.getElementById("calculation-description").value = izracun.opis || "";

    // Vrsta izračuna (mapiranje punog opisa u value vrijednost radio gumba)
    const vrstaMap = {
        "Obračun zateznih kamata za fizičku osobu": "natural-person",
        "Obračun zateznih kamata za pravnu osobu": "legal-entity"
    };

    const vrstaValue = vrstaMap[izracun.vrsta];
    if (vrstaValue) {
        document.querySelector(`[name="calculation-type"][value="${vrstaValue}"]`)?.click();
    } else {
        console.warn("Nepoznata vrsta izračuna:", izracun.vrsta);
    }

    // Vjerovnik
    document.getElementById("creditor-name").value = izracun.vjerovnik.naziv || "";
    document.getElementById("creditor-address").value = izracun.vjerovnik.adresa || "";
    document.getElementById("creditor-city").value = izracun.vjerovnik.mjesto || "";
    document.getElementById("creditor-oib").value = izracun.vjerovnik.oib || "";

    // Dužnik
    document.getElementById("debtor-name").value = izracun.duznik.naziv || "";
    document.getElementById("debtor-address").value = izracun.duznik.adresa || "";
    document.getElementById("debtor-city").value = izracun.duznik.mjesto || "";
    document.getElementById("debtor-oib").value = izracun.duznik.oib || "";

    // Moratorij (checkbox)
    const moratorium = document.getElementById("moratorium");
    if (moratorium && izracun.moratorij === 1) {
        moratorium.checked = true;
    }

    // Valuta
    const valutaSelect = document.getElementById("currency-list");
    if (valutaSelect && izracun.valuta) {
        valutaSelect.value = izracun.valuta;
    }

    // Glavnice
    const dugovi = izracun.dugovi || [];
    if (dugovi.length) {
        const prviUnos = document.querySelector(".calculation-entry");
        if (prviUnos) {
            const prviDug = dugovi[0];
            prviUnos.querySelector(".js-calculationDescription").value = prviDug.opis || "";
            prviUnos.querySelector(".js-calculationAmount").value = prviDug.iznos || "";
            const dateInput = prviUnos.querySelector(".js-calculationDate");
            if (dateInput && prviDug.datum) {
                const formatted = formatirajDatum(prviDug.datum);
                console.log("Dug datum (prvi unos):", prviDug.datum);
                console.log("Formatirano (prvi unos):", formatted);
            
                if (dateInput._flatpickr) {
                    dateInput._flatpickr.setDate(formatted, true, "d.m.Y");
                } else {
                    dateInput.value = formatted;
                }
            }

            const idInput = prviUnos.querySelector(".js-calculationID");
            if (idInput) {
                idInput.value = prviDug.id || "";
            }
        }
        console.log("Svi dugovi:", izracun.dugovi);
        for (let i = 1; i < dugovi.length; i++) {
            dodajRacun(null, dugovi[i]);
        }
    }

    // Uplate
    if (izracun.uplate?.length) {
        izracun.uplate.forEach(uplata => {
            const targetEntry = document.querySelector(
                `.calculation-entry input.js-calculationID[value="${uplata.glavnica_id}"]`
            )?.closest(".calculation-entry");

            if (targetEntry) {
                console.log("Učitavam uplatu:", uplata);
                dodajUplatu(targetEntry, uplata);
            } else {
                console.warn("Nije pronađen račun za uplatu:", uplata.glavnica_id);
            }
        });
    }
}

// Pomoćna funkcija za formatiranje Excel datuma
function excelDatumUDDMYYY(excelDate) {
    if (typeof excelDate === "string") return excelDate;

    const jsDate = XLSX.SSF.parse_date_code(excelDate);
    if (!jsDate) return "";

    const day = String(jsDate.d).padStart(2, '0');
    const month = String(jsDate.m).padStart(2, '0');
    const year = jsDate.y;
    return `${day}.${month}.${year}`;
}

// Pomoćna funkcija za formatiranje Excel datuma
function ucitajPodatkeIzExcelTabele(rows) {
    resetirajUnose(); // briše sve osim prve glavnice i čisti je

    let currentRacun = null;
    let racunIndex = -1;

    rows.slice(1).forEach((row, index) => {
        const [osnova, stavka, iznos, datum] = row;
        if (!stavka) return;

        const tip = stavka.toString().trim().toLowerCase();

        if (tip === "glavnica") {
            racunIndex++;

            if (racunIndex === 0) {
                const prviUnos = document.querySelector(".calculation-entry");
                if (prviUnos) {
                    currentRacun = prviUnos;

                    const opisInput = prviUnos.querySelector(".js-calculationDescription");
                    const iznosInput = prviUnos.querySelector(".js-calculationAmount");
                    const dateInput = prviUnos.querySelector(".js-calculationDate");
                    const idInput = prviUnos.querySelector(".js-calculationID");

                    const idRacuna = crypto.randomUUID();

                    // ✅ Ako ID input ne postoji – dodaj hidden input
                    if (!idInput) {
                        const noviIdInput = document.createElement("input");
                        noviIdInput.type = "hidden";
                        noviIdInput.classList.add("js-calculationID");
                        noviIdInput.name = `calculation[${index}][id]`;
                        noviIdInput.value = idRacuna;
                        prviUnos.prepend(noviIdInput);
                    } else {
                        idInput.value = idRacuna;
                    }

                    if (opisInput) opisInput.value = osnova?.trim() || "";
                    if (iznosInput) iznosInput.value = parseFloat(iznos) || "";

                    if (dateInput && datum) {
                        const formatted = excelDatumUDDMYYY(datum);
                        if (dateInput._flatpickr) {
                            dateInput._flatpickr.setDate(formatted, true, "d.m.Y");
                        } else {
                            dateInput.value = formatted;
                        }
                    }
                }
            } else {
                // ➕ Dodaj novu glavnicu
                currentRacun = dodajRacun(null, {
                    id: crypto.randomUUID(),
                    opis: osnova?.trim(),
                    iznos: parseFloat(iznos),
                    datum: excelDatumUDDMYYY(datum)
                });
            }
        }

        else if (tip === "uplata" && currentRacun) {
            dodajUplatu(currentRacun, {
                iznos: parseFloat(iznos),
                datum: excelDatumUDDMYYY(datum)
            });
        }
    });

    console.log("✅ Podaci iz datoteke ubačeni.");
}




function showErrorAlert(poruka) {
    const errorAlert = document.getElementById("errorAlert");
    if (errorAlert) {
        errorAlert.innerHTML = poruka;
        errorAlert.style.display = "block";
        window.scrollTo({ top: 0, behavior: "smooth" });
    }
}

function dodajPorukuGreske(inputElement, poruka = "Ovo polje je obavezno.") {
    if (!inputElement) return;

    inputElement.classList.add("invalid");

    // Ne dupliciraj poruke
    if (inputElement.parentElement.querySelector(".invalid-feedback")) return;

    const span = document.createElement("span");
    span.classList.add("invalid-feedback");
    span.setAttribute("data-error-message", poruka);
    span.textContent = poruka;

    inputElement.parentElement.appendChild(span);
}