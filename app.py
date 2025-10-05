from flask import Flask, render_template, request, send_file, jsonify, send_from_directory, session, Response
import csv
import io
import os
import re
import time
import traceback

import sqlite3
from weasyprint import HTML
import pandas as pd
import pdfkit
import json

from datetime import datetime, timedelta
from flask_cors import CORS
from bs4 import BeautifulSoup

import sys
sys.stdout.reconfigure(encoding='utf-8')


# Kreiram Flask aplikaciju
app = Flask(__name__, static_folder="static", template_folder="templates")
app.secret_key = "moj-super-tajni-kljuc"

@app.context_processor
def inject_timestamp():
    return {'time': int(datetime.now().timestamp())}

# Postavi putanju do wkhtmltopdf
config = pdfkit.configuration(wkhtmltopdf="/usr/local/bin/wkhtmltopdf")

# Omogućavanje CORS-a
CORS(app)

# Postavljanje direktorija za prijenos datoteka
UPLOAD_FOLDER = "uploads"
ALLOWED_EXTENSIONS = {"csv", "xls", "xlsx", "ods"}
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Osiguraj da direktorij postoji
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Postavljanje direktorija za spremanje CSV-a
HISTORY_DIR = "history"
os.makedirs(HISTORY_DIR, exist_ok=True)  # Automatski kreira direktorij ako ne postoji

# Definiramo period obustave kamata
OBUSTAVA_OD = datetime.strptime("18.04.2020", "%d.%m.%Y")
OBUSTAVA_DO = datetime.strptime("18.10.2020", "%d.%m.%Y")


# Funkcija za dohvat izračuna iz baze (s opcionalnim filtriranjem)
def get_izracuni(query=None):
    conn = sqlite3.connect("baza_izracuni.db")
    c = conn.cursor()

    if query:
        query = f"%{query}%"
        c.execute("SELECT id, naziv_izracuna, datum_izracuna FROM izracuni WHERE naziv_izracuna LIKE ? ORDER BY id DESC", (query,))
    else:
        c.execute("SELECT id, naziv_izracuna, datum_izracuna FROM izracuni ORDER BY id DESC")

    izracuni = c.fetchall()

    # Uvijek dohvatimo ukupan broj izračuna u bazi (bez filtera)
    c.execute("SELECT COUNT(*) FROM izracuni")
    izracuni_broj = c.fetchone()[0]

    conn.close()
    return izracuni, izracuni_broj


# Funkcija koja provjerava je li godina prijestupna
def broj_dana_u_godini(year):
    """Vraća broj dana u godini (365 ili 366 ako je prijestupna)."""
    return 366 if (year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)) else 365


# Funkcija za dohvat kamata iz baze
def get_kamate(tip_subjekta):
    conn = sqlite3.connect("baza_kamata.db")
    c = conn.cursor()
    
    # Mapiraj tip subjekta na ispravan stupac u bazi
    MAPA_TIPOVA = {"natural-person": "fizicke_osobe", "legal-entity": "pravne_osobe"}
    kolona_stope = MAPA_TIPOVA.get(tip_subjekta, "fizicke_osobe")

    query = f"SELECT datum_pocetka, datum_kraja, {kolona_stope} FROM kamate"
    c.execute(query)
    
    data = c.fetchall()
    conn.close()
    
    return [
        {"datum_pocetka": d[0], "datum_kraja": d[1], "kamata": d[2]}  # Koristim samo jednu stopu
        for d in data
    ]

def izracunaj_broj_dana_moratorija(datum_pocetka, datum_kraja):
    """
    Funkcija koja računa koliko dana unutar datog perioda spada pod moratorij.
    - datum_pocetka i datum_kraja su stringovi u formatu "%d.%m.%Y"
    - Vraća broj dana unutar perioda moratorija.
    """
    global OBUSTAVA_OD, OBUSTAVA_DO  # Moram koristiti globalne varijable

    datum_pocetka = datetime.strptime(datum_pocetka, "%d.%m.%Y")
    datum_kraja = datetime.strptime(datum_kraja, "%d.%m.%Y")

    moratorij_pocetak = datetime.strptime("18.04.2020", "%d.%m.%Y")
    moratorij_kraj = datetime.strptime("18.10.2020", "%d.%m.%Y")

    # Računaj preklapanje
    stvarni_pocetak = max(datum_pocetka, moratorij_pocetak)
    stvarni_kraj = min(datum_kraja, moratorij_kraj)

    # Ako se period ne preklapa, broj dana je 0
    if stvarni_pocetak > stvarni_kraj:
        return 0

    return (stvarni_kraj - stvarni_pocetak).days + 1



def generiraj_period_kamata(datum_pocetka, datum_kraja, uplate):
    """
    Generira periode kamata, ali uzima uplate u obzir i dijeli periode prema njima.
    """
    periodi = []
    trenutni_pocetak = datum_pocetka

    # Sortiram uplate po datumu
    uplate = sorted(uplate, key=lambda u: datetime.strptime(u["datum"], "%d.%m.%Y"))

    for uplata in uplate:
        datum_uplate = datetime.strptime(uplata["datum"], "%d.%m.%Y")

        # Ako uplata pada unutar trenutnog perioda, podijelim ga
        if trenutni_pocetak < datum_uplate < datum_kraja:
            # Prvi dio prije uplate
            periodi.append((trenutni_pocetak, datum_uplate))

            # Uplata kao zaseban događaj (možemo je dodati kasnije)
            trenutni_pocetak = datum_uplate + timedelta(days=1)

    # Dodajemo zadnji period ako još postoji dug
    if trenutni_pocetak < datum_kraja:
        periodi.append((trenutni_pocetak, datum_kraja))

    return periodi


def podijeli_kamatne_periode(kamatne_stope, uplate):
    """
    Dijeli periode kamata ako postoji uplata unutar perioda.
    - Ne briše periode ako uplata dolazi prije njih.
    - Dijeli period nakon uplate.
    """
    novi_periodi = []

    for period in kamatne_stope:
        datum_pocetka = datetime.strptime(period["datum_pocetka"], "%d.%m.%Y")
        datum_kraja = datetime.strptime(period["datum_kraja"], "%d.%m.%Y")
        stopa = period["kamata"]

        # Pronađi uplate unutar ovog perioda
        uplate_u_periodu = [u for u in uplate if datum_pocetka <= datetime.strptime(u["datum"], "%d.%m.%Y") <= datum_kraja]
        uplate_u_periodu.sort(key=lambda u: datetime.strptime(u["datum"], "%d.%m.%Y"))

        trenutni_pocetak = datum_pocetka

        for uplata in uplate_u_periodu:
            datum_uplate = datetime.strptime(uplata["datum"], "%d.%m.%Y")

            # Prvi dio perioda završava NA DAN uplate
            novi_periodi.append({
                "datum_pocetka": trenutni_pocetak.strftime("%d.%m.%Y"),
                "datum_kraja": datum_uplate.strftime("%d.%m.%Y"),
                "kamata": stopa
            })

            # Novi period kreće OD DANA NAKON UPLATE
            trenutni_pocetak = datum_uplate + timedelta(days=1)

        # Dodaj preostali dio perioda nakon zadnje uplate
        if trenutni_pocetak <= datum_kraja:
            novi_periodi.append({
                "datum_pocetka": trenutni_pocetak.strftime("%d.%m.%Y"),
                "datum_kraja": datum_kraja.strftime("%d.%m.%Y"),
                "kamata": stopa
            })

    return novi_periodi


def izracunaj_kamatu_precizno(datum_pocetka, datum_kraja, glavnica, kamatne_stope, uplate, id_racuna, moratorium):
    """
    Izračunava kamatu precizno, uzimajući u obzir promene kamatnih stopa, uplate i moratorijum.

    - datum_pocetka: str (format "%d.%m.%Y")
    - datum_kraja: str (format "%d.%m.%Y")
    - glavnica: početni iznos glavnice
    - kamatne_stope: lista perioda sa stopama [(datum_od, datum_do, stopa)]
    - uplate: lista uplata [(datum_uplate, iznos_uplate)]
    - id_racuna: identifikator glavnice (za povezivanje uplata i kamata)
    - moratorium: bool, da li je primenjen moratorijum
    """
    datum_pocetka = datetime.strptime(datum_pocetka, "%d.%m.%Y")
    datum_kraja = datetime.strptime(datum_kraja, "%d.%m.%Y")

    # Prilagodi periode kamata kako bi uključili moratorijum
    if moratorium:
        kamatne_stope = prilagodi_periode(kamatne_stope)

    događaji = []  # Lista svih događaja (kamate i uplate)

    # Dodaj kamatne periode u listu događaja
    for period in kamatne_stope:
        događaji.append({
            "datum": datetime.strptime(period["datum_pocetka"], "%d.%m.%Y"),
            "tip": "kamata",
            "kamata_stopa": float(period["kamata"]),
            "datum_kraja": datetime.strptime(period["datum_kraja"], "%d.%m.%Y")
        })

    # Dodaj uplate u listu događaja
    for uplata in uplate:
        događaji.append({
            "datum": datetime.strptime(uplata[0], "%d.%m.%Y"),
            "tip": "uplata",
            "iznos": float(uplata[1])
        })

    # Sortiraj događaje po datumu
    događaji.sort(key=lambda x: x["datum"])

    trenutna_glavnica = glavnica
    trenutni_datum = datum_pocetka
    ukupna_kamata = 0.0
    rezultat = []
    dug_po_kamati = 0.0  # Dug po kamati prije umanjenja glavnice

    for i, dogadjaj in enumerate(događaji):
        if trenutni_datum >= datum_kraja:
            break  # Ne računam poslije krajnjeg datuma

        if dogadjaj["tip"] == "kamata":
            period_pocetak = max(trenutni_datum, dogadjaj["datum"])
            period_kraj = min(datum_kraja, dogadjaj["datum_kraja"])

            if period_pocetak >= period_kraj:
                continue  # Ako je period nevalidan, preskačem

            broj_dana = (period_kraj - period_pocetak).days + 1
            stopa = dogadjaj["kamata_stopa"]
            broj_dana_godine = broj_dana_u_godini(period_pocetak.year)

            kamata_perioda = 0
            trenutni_datum = period_pocetak

            while trenutni_datum <= period_kraj:
                godina = trenutni_datum.year
                kraj_godine = datetime(godina, 12, 31) if trenutni_datum.year != period_kraj.year else period_kraj

                # Osiguraj da ne prelazi stvarni period
                kraj_godine = min(kraj_godine, period_kraj)
                
                broj_dana_godine = broj_dana_u_godini(godina)
                broj_dana_u_periodu = (kraj_godine - trenutni_datum).days + 1

                kamata_za_godinu = (trenutna_glavnica * stopa * broj_dana_u_periodu) / (broj_dana_godine * 100)
                kamata_perioda += kamata_za_godinu

                print(f"Godina: {godina}, Broj dana: {broj_dana_u_periodu}, Dana u godini: {broj_dana_godine}, Kamata: {kamata_za_godinu}")

                # Prelazak na sljedeću godinu
                trenutni_datum = kraj_godine + timedelta(days=1)

            dug_po_kamati += kamata_perioda
            ukupna_kamata += kamata_perioda

            rezultat.append({
                "datum": period_kraj.strftime("%d.%m.%Y"),
                "period_od": period_pocetak.strftime("%d.%m.%Y"),
                "period_do": period_kraj.strftime("%d.%m.%Y"), 
                "opis": f"{period_pocetak.strftime('%d.%m.%Y')} - {period_kraj.strftime('%d.%m.%Y')}",
                "iznos": round(kamata_perioda, 2),
                "broj_dana": broj_dana,
                "kamata_stopa": stopa,
                "kta_razdoblja": round(kamata_perioda, 2),
                "glavnica": round(trenutna_glavnica, 2),
                "dug_kamata": round(dug_po_kamati, 2),
                "ukupna_kamata": round(ukupna_kamata, 2),
                "ukupni_dug": round(trenutna_glavnica + ukupna_kamata, 2),
                "osnovica": round(trenutna_glavnica, 2),
                "id_racuna": id_racuna
            })

            trenutni_datum = period_kraj + timedelta(days=1)

        elif dogadjaj["tip"] == "uplata":
            iznos_uplate = dogadjaj["iznos"]
            datum_uplate = dogadjaj["datum"]

            print(f"Uplata pronađena: datum={datum_uplate.strftime('%d.%m.%Y')}, iznos={iznos_uplate}, dug_po_kamati={dug_po_kamati}, trenutna_glavnica={trenutna_glavnica}")

            trenutni_datum = min(trenutni_datum, datum_uplate)

            if datum_uplate < trenutni_datum:
                print(f"DEBUG: datum_uplate={datum_uplate}, trenutni_datum={trenutni_datum}")
                continue

            # Pohranjujem vrijednosti prije umanjenja
            osnovica_prije_uplate = round(trenutna_glavnica, 2)
            dug_po_kamati_prije_uplate = round(dug_po_kamati, 2)
            ukupni_dug_prije_uplate = round(trenutna_glavnica + ukupna_kamata, 2)

            print(f"   Prije smanjenja duga po kamati: iznos_uplate={iznos_uplate}, dug_po_kamati={dug_po_kamati}")
            print(f"   Prije obrade uplate: iznos_uplate={iznos_uplate}, dug_po_kamati={dug_po_kamati}, trenutna_glavnica={trenutna_glavnica}")
            print(f"   Provjera UPLATE prije smanjenja duga po kamati: {datum_uplate.strftime('%d.%m.%Y')}")
            print(f"   Iznos uplate: {iznos_uplate}")
            print(f"   Dug po kamati prije obrade: {dug_po_kamati}")
            print(f"   Glavnica prije obrade: {trenutna_glavnica}")

            # Prvo smanjujem dug po kamati
            if dug_po_kamati > 0:
                print(f"Dug po kamati postoji ({dug_po_kamati}) - ulazimo u smanjenje")
                if iznos_uplate >= dug_po_kamati:
                    iznos_uplate -= dug_po_kamati
                    dug_po_kamati = 0
                else:
                    dug_po_kamati -= iznos_uplate
                    iznos_uplate = 0
                print(f"Nakon plaćanja kamate: dug_po_kamati={dug_po_kamati}, preostala uplata={iznos_uplate}")

                ukupna_kamata = dug_po_kamati  # Resetiraj ukupnu kamatu na novi dug po kamati
                print(f"Nakon ažuriranja: ukupna_kamata={ukupna_kamata}")


            else:
                print(f"Dug po kamati je 0, uplata ne smanjuje kamate!")
            # Smanjujem glavnicu nakon što sam riješila dug po kamati
            trenutna_glavnica -= iznos_uplate
            
            if trenutna_glavnica < 0:
                # Izračunam koliki je zapravo višak nakon umanjenja glavnice
                visak_uplate = abs(trenutna_glavnica)
                trenutna_glavnica = 0  # Glavnica ne može biti negativna
            else:
                visak_uplate = 0

            print(f"Nakon smanjenja glavnice: nova_glavnica={trenutna_glavnica}, preostala uplata={iznos_uplate}, višak={visak_uplate}")

            print(f"Nakon uplate {datum_uplate.strftime('%d.%m.%Y')}: glavnica={trenutna_glavnica}, dug po kamati={dug_po_kamati}, ukupna_kamata={ukupna_kamata}")

            # Ako je uplata bila veća i još ima viška
            if visak_uplate > 0:
                rezultat.append({
                    "datum": datum_uplate.strftime("%d.%m.%Y"),
                    "opis": "Preplata",
                    "iznos": round(visak_uplate, 2),
                    "dug_kamata": 0.0,
                    "ukupni_dug": -round(visak_uplate, 2),  # Preplata je negativan dug
                    "id_racuna": id_racuna
                })
                print(f"Preplata detektirana (nakon umanjenja glavnice): {visak_uplate} EUR na dan {datum_uplate.strftime('%d.%m.%Y')}")

            # Ažuriram ukupni dug nakon uplate
            ukupni_dug_nakon_uplate = round(trenutna_glavnica + ukupna_kamata, 2)
            print(f"DEBUG: trenutna_glavnica={trenutna_glavnica}, ukupna_kamata={ukupna_kamata}, ukupni_dug_nakon_uplate={ukupni_dug_nakon_uplate}")

            # Dodajem uplatu u rezultat sa svim vrijednostima
            rezultat.append({
                "datum": datum_uplate.strftime("%d.%m.%Y"),
                "opis": "Uplata",
                "iznos": -dogadjaj["iznos"],
                "dug_kamata": round(dug_po_kamati, 2),
                "ukupni_dug": ukupni_dug_nakon_uplate,
                "osnovica": osnovica_prije_uplate,
                "kta_razdoblja": dug_po_kamati_prije_uplate,
                "id_racuna": id_racuna
            })

            trenutni_datum = datum_uplate + timedelta(days=1)

    return rezultat, round(ukupna_kamata, 2)


def prilagodi_periode(kamatne_stope):
    """Prilagođava periode kamata tako da ispravno obuhvate moratorijum kao jedan blok."""
    prilagodjeni_periodi = []
    moratorij_dodan = False  

    for period in kamatne_stope:
        datum_pocetka = datetime.strptime(period["datum_pocetka"], "%d.%m.%Y")
        datum_kraja = datetime.strptime(period["datum_kraja"], "%d.%m.%Y")
        stopa = period["kamata"]

        print(f"Prilagođavanje perioda: {period['datum_pocetka']} - {period['datum_kraja']} (prije promjene)")

        # Ako period završava prije moratorijuma, ostaje nepromijenjen
        if datum_kraja < OBUSTAVA_OD:
            prilagodjeni_periodi.append(period)
            continue

        # Ako period počinje poslije moratorijuma, ostaje nepromijenjen
        if datum_pocetka > OBUSTAVA_DO:
            prilagodjeni_periodi.append(period)
            continue

        # Ako period POČINJE PRIJE i završava U MORATORIJUMU → podijeli na 2
        if datum_pocetka < OBUSTAVA_OD and OBUSTAVA_OD <= datum_kraja <= OBUSTAVA_DO:
            prilagodjeni_periodi.append({
                "datum_pocetka": datum_pocetka.strftime("%d.%m.%Y"),
                "datum_kraja": (OBUSTAVA_OD - timedelta(days=1)).strftime("%d.%m.%Y"),
                "kamata": stopa
            })
            datum_pocetka = OBUSTAVA_OD  # Ažuriram datum početka za moratorijum

        # Ako period je UNUTAR moratorijuma → koristim samo jedan period sa kamatom 0
        if OBUSTAVA_OD <= datum_pocetka and datum_kraja <= OBUSTAVA_DO:
            if not moratorij_dodan:
                prilagodjeni_periodi.append({
                    "datum_pocetka": OBUSTAVA_OD.strftime("%d.%m.%Y"),
                    "datum_kraja": OBUSTAVA_DO.strftime("%d.%m.%Y"),
                    "kamata": 0
                })
                moratorij_dodan = True
            continue  # Ne dodajem ga ponovo

        # Ako period POČINJE U MORATORIJUMU i završava NAKON njega → podijeli na 2
        if OBUSTAVA_OD <= datum_pocetka <= OBUSTAVA_DO and datum_kraja > OBUSTAVA_DO:
            if not moratorij_dodan:
                prilagodjeni_periodi.append({
                    "datum_pocetka": OBUSTAVA_OD.strftime("%d.%m.%Y"),
                    "datum_kraja": OBUSTAVA_DO.strftime("%d.%m.%Y"),
                    "kamata": 0
                })
                moratorij_dodan = True
            prilagodjeni_periodi.append({
                "datum_pocetka": (OBUSTAVA_DO + timedelta(days=1)).strftime("%d.%m.%Y"),
                "datum_kraja": datum_kraja.strftime("%d.%m.%Y"),
                "kamata": stopa
            })
            continue

        # Ako period POČINJE PRIJE i završava POSLIJE moratorijuma → podijeli na 3
        if datum_pocetka < OBUSTAVA_OD and datum_kraja > OBUSTAVA_DO:
            prilagodjeni_periodi.append({
                "datum_pocetka": datum_pocetka.strftime("%d.%m.%Y"),
                "datum_kraja": (OBUSTAVA_OD - timedelta(days=1)).strftime("%d.%m.%Y"),
                "kamata": stopa
            })
            if not moratorij_dodan:
                prilagodjeni_periodi.append({
                    "datum_pocetka": OBUSTAVA_OD.strftime("%d.%m.%Y"),
                    "datum_kraja": OBUSTAVA_DO.strftime("%d.%m.%Y"),
                    "kamata": 0
                })
                moratorij_dodan = True
            prilagodjeni_periodi.append({
                "datum_pocetka": (OBUSTAVA_DO + timedelta(days=1)).strftime("%d.%m.%Y"),
                "datum_kraja": datum_kraja.strftime("%d.%m.%Y"),
                "kamata": stopa
            })
            continue

    # Da li sam dodala moratorijum?
    if not moratorij_dodan:
        prilagodjeni_periodi.append({
            "datum_pocetka": OBUSTAVA_OD.strftime("%d.%m.%Y"),
            "datum_kraja": OBUSTAVA_DO.strftime("%d.%m.%Y"),
            "kamata": 0
        })
        print("Moratorijum je bio odsutan! Ručno dodajemo period.")

    print("DEBUG: Generirani periodi nakon prilagodbe moratorija:")
    for p in prilagodjeni_periodi:
        print(f"   - {p['datum_pocetka']} → {p['datum_kraja']}, kamata: {p['kamata']}")

    return prilagodjeni_periodi


def izracunaj_kamate(datum_pocetka, datum_kraja, iznos, tip_subjekta, moratorium, uplate, naziv_racuna, id_racuna):

    if isinstance(datum_pocetka, str):
        datum_pocetka = datetime.strptime(datum_pocetka, "%d.%m.%Y") + timedelta(days=1)

    if isinstance(datum_kraja, str):
        datum_kraja = datetime.strptime(datum_kraja, "%d.%m.%Y")

    # Datum početka nije nakon datuma kraja
    if datum_pocetka > datum_kraja:
        return {"error": "Datum početka ne može biti nakon datuma kraja."}, 400

    # Validacija uplata - uplata ne može biti prije glavnice
    for uplata in uplate:
        try:
            datum_uplate = datetime.strptime(uplata["datum"], "%d.%m.%Y")
        except ValueError:
            return {"error": f"Neispravan format datuma uplate: {uplata['datum']}. Koristi format DD.MM.YYYY."}, 400

    # Dohvati kamatne stope iz baze
    kamatne_stope = get_kamate(tip_subjekta)
    kamatne_stope = podijeli_kamatne_periode(kamatne_stope, uplate)  # Dodaj ovu liniju
    print("Kamate prije filtriranja:", get_kamate(tip_subjekta))
    # Filtriraj samo periode koji su unutar intervala izračuna
    kamatne_stope = [
        {
            "datum_pocetka": p["datum_pocetka"],
            "datum_kraja": p["datum_kraja"],
            "kamata": p["kamata"]
        }
        for p in kamatne_stope
        if datetime.strptime(p["datum_pocetka"], "%d.%m.%Y") <= datum_kraja and
        datetime.strptime(p["datum_kraja"], "%d.%m.%Y") >= datum_pocetka
    ]
    print("Kamate nakon filtriranja:", kamatne_stope)
    # Osiguravam da prvi period ne počinje prije glavnice
    for period in kamatne_stope:
        datum_pocetka_perioda = datetime.strptime(period["datum_pocetka"], "%d.%m.%Y")
        if datum_pocetka_perioda < datum_pocetka:
            period["datum_pocetka"] = datum_pocetka.strftime("%d.%m.%Y")  # Korekcija perioda

    print("Kamate iz baze nakon dodatne korekcije:", kamatne_stope)  # Debugging ispis
    print(f"Datum glavnice: {datum_pocetka.strftime('%d.%m.%Y')}")
    print(f"Datum kraja obračuna: {datum_kraja.strftime('%d.%m.%Y')}")
    print("Kamate iz baze nakon filtriranja:", kamatne_stope)  # Debugging ispis

    print("Periodi PRIJRE prilagodbe moratorija:", kamatne_stope)
    # Ako je checkbox za moratorij označen, prilagodi periode **prije** petlje
    if moratorium:
        print(f"Primjena moratorija za glavnicu {naziv_racuna} ({datum_pocetka.strftime('%d.%m.%Y')})")
        print("Periodi prije prilagodbe:", kamatne_stope)
        kamatne_stope = prilagodi_periode(kamatne_stope)
    print("Periodi NAKON prilagodbe moratorija:", kamatne_stope)

    print("DEBUG: Periodi nakon prilagodbe (finalna lista):")
    for period in kamatne_stope:
        print(f"   - {period['datum_pocetka']} → {period['datum_kraja']}, kamata: {period['kamata']}")


    # 4️⃣ Konvertiraj uplate u odgovarajući format [(datum, iznos)]
    uplate_lista = [(u["datum"], u["iznos"]) for u in uplate] if uplate else []
    print("Kamate prije slanja u precizni izračun:", kamatne_stope)
    print("Uplate prije slanja u izračun kamata:", uplate_lista)
        # 5️⃣ Pozivamo preciznu funkciju za obračun kamata
    rezultat, ukupna_kamata = izracunaj_kamatu_precizno(
        datum_pocetka.strftime("%d.%m.%Y"),
        datum_kraja.strftime("%d.%m.%Y"),
        iznos,
        kamatne_stope,
        uplate_lista,
        id_racuna,
        moratorium
    )

    print("Finalni rezultat koji backend šalje frontend-u:", json.dumps(rezultat, indent=4, ensure_ascii=False))

    return rezultat, round(ukupna_kamata, 2), moratorium

@app.route("/static/<path:filename>")
def serve_static(filename):
    response = send_from_directory("static", filename)
    response.headers["Cache-Control"] = "no-store"
    return response

# Funkcija za provjeru ekstenzije datoteke
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS

# Ruta za prikaz početne stranice
@app.route("/")
def index():
    # Resetiraj aktivni naziv na početku stranice
    session["aktivni_izracun"] = "Novi izračun"

    conn = sqlite3.connect("baza_izracuni.db")
    c = conn.cursor()
    
    # Dohvati broj izračuna
    c.execute("SELECT COUNT(*) FROM izracuni")
    izracuni_broj = c.fetchone()[0]  # Broj spremljenih izračuna

    # Dohvati **samo zadnjih 10 izračuna**
    c.execute("SELECT id, naziv_izracuna, datum_izracuna FROM izracuni ORDER BY id DESC LIMIT 10")
    izracuni = c.fetchall()

    # Dodaj za ispis u terminal
    print("Izracuni dohvaceni u index():", izracuni)

    conn.close()

    return render_template("index.html", izracuni_broj=izracuni_broj, izracuni=izracuni)

# Ruta za prijenos datoteke
@app.route("/upload", methods=["POST"])
def upload_file():
    if "fileSelect" not in request.files:
        return jsonify({"error": "Nema datoteke"}), 400

    file = request.files["fileSelect"]

    if file.filename == "":
        return jsonify({"error": "Nema odabrane datoteke"}), 400

    if file and allowed_file(file.filename):
        file_path = os.path.join(app.config["UPLOAD_FOLDER"], file.filename)
        file.save(file_path)

        try:
            if file.filename.endswith(".csv"):
                df = pd.read_csv(file_path, delimiter=",", encoding="utf-8")
            else:
                df = pd.read_excel(file_path)

            data = df.to_dict(orient="records")

            return jsonify({"success": True, "data": data})

        except Exception as e:
            import traceback
            print("Problem s čitanjem datoteke:", str(e))
            print(traceback.format_exc())  # Ispis stack trace-a
            return jsonify({"error": f"Problem s čitanjem datoteke: {str(e)}"}), 500

    return jsonify({"error": "Neispravan format datoteke"}), 400

# Ruta za dohvat kamata
@app.route("/kamate", methods=["GET"])
def kamate():
    conn = sqlite3.connect("baza_kamata.db")
    c = conn.cursor()
    c.execute("SELECT datum_pocetka, datum_kraja, fizicke_osobe, pravne_osobe FROM kamate")
    data = c.fetchall()
    conn.close()

    # Pravilno formatiranje podataka u JSON listu
    return jsonify([
        {"datum_pocetka": d[0], "datum_kraja": d[1], "fizicka_osoba": d[2], "pravna_osoba": d[3]}
        for d in data
    ])

# Ruta za generiranje i preuzimanje PDF-a
@app.route("/preuzmi_pdf", methods=["POST"])
def preuzmi_pdf():
    try:
        data = request.json
        html_content = data.get("html")

        if not html_content:
            return jsonify({"error": "Nema sadržaja za PDF"}), 400

        # Uklanjamo taskbar iz HTML-a
        soup = BeautifulSoup(html_content, "html.parser")
        taskbar = soup.find(id="taskbar")
        if taskbar:
            taskbar.decompose()
        cleaned_html = str(soup)

        # Konfiguracija za wkhtmltopdf
        config = pdfkit.configuration(wkhtmltopdf="/usr/local/bin/wkhtmltopdf")

        options = {
            "orientation": "Landscape",
            "page-size": "A4",
            "zoom": "1.3",
            "viewport-size": "1280x1024",
            "dpi": 300
        }

        # Generiranje PDF-a (pretvaramo u BytesIO)
        pdf_bytes = pdfkit.from_string(cleaned_html, False, configuration=config, options=options)
        pdf_stream = io.BytesIO(pdf_bytes)

        # Ispravno provjeravamo `prikazi` parametar (pretvaramo u bool)
        prikazi = request.args.get("prikazi", "false").lower() == "true"

        return send_file(
            pdf_stream,
            mimetype="application/pdf",
            as_attachment=not prikazi,  # Ako prikazi=True, otvara u novom tabu
            download_name="izracun.pdf" if not prikazi else None  # Samo kod preuzimanja postavlja ime
        )

    except Exception as e:
        import traceback
        print("Greška pri generiranju PDF-a:", str(e))
        print(traceback.format_exc())  # Ispis stack trace-a
        return jsonify({"error": f"Greška pri generiranju PDF-a: {str(e)}"}), 500


@app.route("/generiraj_pdf", methods=["POST"])
def generiraj_pdf():
    try:
        # Dohvati HTML sadržaj iz POST zahtjeva (ispravan način za JSON)
        data = request.get_json()
        html_content = data["html"]  # JSON objekt umjesto request.form

        # Pretvori HTML u PDF
        pdf_file_path = "static/izracun.pdf"
        HTML(string=html_content).write_pdf(pdf_file_path)

        # Vrati PDF korisniku
        return send_file(pdf_file_path, as_attachment=True, download_name="izracun.pdf")
    
    except Exception as e:
        import traceback
        print("Greška pri generiranju PDF-a:", str(e))
        print(traceback.format_exc())  # Ispis stack trace-a
        return f"Greška pri generiranju PDF-a: {str(e)}", 500



# Ruta za posluživanje slika
@app.route("/images/<path:filename>")
def serve_images(filename):
    return send_from_directory("static/images", filename)

@app.route("/images/instructions/<path:filename>")
def serve_instruction_images(filename):
    return send_from_directory("static/images/instructions", filename)

@app.route("/bill")
def bill():
    return render_template("bill.html")

@app.route("/instructions")
def instructions():
    return render_template("instructions.html")

@app.route("/moratorium")
def moratorium():
    return render_template("moratorium.html")

@app.route("/interest-rates-list")
def interest_rates_list():
    return render_template("interest_rates_list.html")

@app.route("/delete-calculation/<int:izracun_id>")
def prikazi_modal_brisanja(izracun_id):
    """Vrati HTML modal za potvrdu brisanja izračuna"""
    return render_template("modals/delete_modal.html", izracun_id=izracun_id)

@app.route("/novi_izracun")
def novi_izracun():
    session["aktivni_izracun"] = "Novi izračun" # Reset naziva izračuna

    conn = sqlite3.connect("baza_izracuni.db")
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM izracuni")
    izracuni_broj = c.fetchone()[0]

    c.execute("SELECT id, naziv_izracuna, datum_izracuna FROM izracuni ORDER BY id DESC LIMIT 10")
    izracuni = c.fetchall()

    conn.close()
    return render_template("index.html", izracuni_broj=izracuni_broj, izracuni=izracuni)

# Ruta za posluživanje CSV predloška
@app.route("/preuzmi_predlozak")
def preuzmi_predlozak():
    return send_from_directory("predlosci", "predlozak_zat-kamata.csv", as_attachment=True)

@app.route("/preuzmi_csv")
def preuzmi_csv():
    # Dohvati sve CSV datoteke iz history direktorija
    csv_files = [f for f in os.listdir(HISTORY_DIR) if f.endswith(".csv")]

    if not csv_files:
        return jsonify({"error": "Nema dostupnih CSV datoteka!"}), 404

    # Pronađi najnoviju CSV datoteku prema vremenu kreiranja
    csv_files.sort(key=lambda f: os.path.getctime(os.path.join(HISTORY_DIR, f)), reverse=True)
    latest_csv = os.path.join(HISTORY_DIR, csv_files[0])

    print(f"DEBUG: Preuzimam CSV -> {latest_csv}")

    return send_file(latest_csv, mimetype="text/csv", as_attachment=True, download_name="izracun_kamata.csv")


@app.route("/spremi_izracun", methods=["POST"])
def spremi_izracun():
    """Sprema osnovne podatke, glavnice i uplate prije izračuna."""
    print(" Backend primio zahtjev na /spremi_izracun!")

    try:
        data = request.get_json()  # Koristim JSON podatke
        print(" Primljeni podaci /spremi_izracun:", json.dumps(data, indent=4, ensure_ascii=False))

        if not data:
            print("Greška: Nema podataka u zahtjevu za spremanje!")
            return jsonify({"error": "Nema podataka za spremanje"}), 400

        # Provjera da li naziv izračuna postoji
        naziv_izracuna = data.get("naziv_izracuna", "").strip()
        if not naziv_izracuna:
            return jsonify({"error": "Naziv izračuna je obavezno polje i ne može biti prazno!"}), 400

        conn = sqlite3.connect("baza_izracuni.db")
        conn.row_factory = sqlite3.Row  # omogućuje pristup po ključu
        c = conn.cursor()

        # Osiguravamo da naziv i opis nisu prazni (ako su prazni, postavljam default vrijednost)
        opis_izracuna = data.get("opis_izracuna", "").strip()
        datum_izracuna = data.get("datum_izracuna", "1970-01-01")  # Default vrijednost ako ne postoji
        vrsta_izracuna = (data or {}).get("vrsta_izracuna") or "Obračun za fizičku osobu"
        valuta = data.get("valuta", "EUR")  # Default "EUR" ako nije zadano
        moratorij = int(data.get("moratorij", False))  # Konvertira True/False u 1/0 za SQLite

        # Spremanje podataka u tablicu izracuni
        c.execute("""
            INSERT INTO izracuni (naziv_izracuna, opis_izracuna, vrsta_izracuna, datum_izracuna, valuta, moratorij)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            naziv_izracuna,
            opis_izracuna,
            vrsta_izracuna,
            datum_izracuna,
            valuta,
            int(data.get("moratorij", False)),  # Konvertira True/False u 1/0 za SQLite
        ))

        izracun_id = c.lastrowid  # Dohvati ID unosa
        print(f"Izracun spremljen! ID: {izracun_id}")

        # Spremanje subjekata (vjerovnika i dužnika)
        for subjekt in ["vjerovnik", "duznik"]:
            subjekt_data = data.get(subjekt, {})

            c.execute("""
                INSERT INTO subjekti (izracun_id, naziv, adresa, mjesto, oib, vrsta_subjekta)
                VALUES (?, ?, ?, ?, ?, ?)
            """, (
                izracun_id,
                subjekt_data.get("naziv", "Nepoznat subjekt"),
                subjekt_data.get("adresa", ""),
                subjekt_data.get("mjesto", ""),
                subjekt_data.get("oib", ""),
                subjekt  # "vjerovnik" ili "duznik"
            ))

        # Spremanje glavnice
        dugovi_ids = {}
        for racun in data.get("racuni", []):
            datum_raw = racun.get("datum_pocetka", "")
            try:
                datum_duga = datetime.strptime(datum_raw, "%d.%m.%Y").date().isoformat()
            except ValueError:
                print(f"Neispravan datum glavnice: '{datum_raw}' — koristim default.")
                datum_duga = "1970-01-01"

            c.execute("""
                INSERT INTO dugovi (izracun_id, opis, datum_duga, iznos)
                VALUES (?, ?, ?, ?)
            """, (
                izracun_id,
                racun.get("glavnica_naziv", "Početni dug"),
                datum_duga,
                racun.get("iznos", 0.0)
            ))
            
            dug_id = c.lastrowid
            dugovi_ids[str(racun.get("id_racuna"))] = dug_id  # Točno mapiranje za uplate

        # Spremanje uplata
        for racun in data.get("racuni", []):
            id_racuna = str(racun.get("id_racuna"))
            dug_id = dugovi_ids.get(id_racuna)

            for uplata in racun.get("uplate", []):
                if dug_id:
                    datum_uplate_str = uplata.get("datum", "")
                    try:
                        datum_uplate = datetime.strptime(datum_uplate_str, "%d.%m.%Y").date().isoformat()
                    except ValueError:
                        print(f"Neispravan datum uplate: '{datum_uplate_str}' — koristim default.")
                        datum_uplate = "1970-01-01"

                    c.execute("""
                        INSERT INTO uplate (izracun_id, dug_id, glavnica_id, datum_uplate, iznos_uplate)
                        VALUES (?, ?, ?, ?, ?)
                    """, (
                        izracun_id,
                        dug_id,
                        dug_id,
                        datum_uplate,
                        uplata.get("iznos", 0.0)
                    ))
                    print(f"Uplata spremljena za dug ID={dug_id}: {datum_uplate}, {uplata.get('iznos')}")
                else:
                    print(f"Skipping uplatu – nema dug_id za racun: {id_racuna}")

        conn.commit() 
        return jsonify({"message": "Osnovni podaci, glavnice i uplate spremljeni!", "izracun_id": izracun_id})

    except Exception as e:
        print(f"GREŠKA: {str(e)}")
        return jsonify({"error": str(e)}), 500

    finally:
        conn.close()


@app.route("/obrisi_izracun/<int:izracun_id>", methods=["POST", "DELETE"])
def obrisi_izracun(izracun_id):
    """Briše izračun iz baze podataka"""
    try:
        conn = sqlite3.connect("baza_izracuni.db")
        conn.execute("PRAGMA foreign_keys = ON")
        c = conn.cursor()

        # Brišem izračun po ID-u
        c.execute("DELETE FROM izracuni WHERE id = ?", (izracun_id,))
        conn.commit()
        conn.close()

        return jsonify({"success": True})
    
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 500


@app.route("/ucitaj_izracun", methods=["POST"])
def ucitaj_izracun():
    izracun_id = request.form.get("calculation-id")
    if not izracun_id:
        return redirect(url_for("index"))

    conn = sqlite3.connect("baza_izracuni.db")
    conn.row_factory = sqlite3.Row
    c = conn.cursor()

    # Zadnjih 10 za dropdown
    c.execute("SELECT id, naziv_izracuna, datum_izracuna FROM izracuni ORDER BY id DESC LIMIT 10")
    izracuni = c.fetchall()

    # Naziv izračuna iz baze → za prikaz u gumbu i kvačicu u dropdownu
    c.execute("SELECT naziv_izracuna FROM izracuni WHERE id = ?", (izracun_id,))
    row = c.fetchone()
    naziv_izracuna = row["naziv_izracuna"] if row else "Novi izračun"
    session["aktivni_izracun"] = naziv_izracuna

    # Dohvati osnovne podatke o izračunu
    c.execute("SELECT * FROM izracuni WHERE id = ?", (izracun_id,))
    izracun = c.fetchone()
    if not izracun:
        return redirect(url_for("index"))

    # Glavnice (dugovi)
    c.execute("""
        SELECT id, izracun_id, opis, datum_duga AS datum, iznos
        FROM dugovi 
        WHERE izracun_id = ?
    """, (izracun_id,))
    dugovi = c.fetchall()

    # Uplate
    c.execute("""
        SELECT id, izracun_id, dug_id, glavnica_id, datum_uplate AS datum, iznos_uplate AS iznos
        FROM uplate 
        WHERE izracun_id = ?
    """, (izracun_id,))
    uplate = c.fetchall()

    # Vjerovnik
    c.execute("SELECT * FROM subjekti WHERE izracun_id = ? AND vrsta_subjekta = 'vjerovnik'", (izracun_id,))
    vjerovnik_row = c.fetchone()
    vjerovnik = dict(vjerovnik_row) if vjerovnik_row else {
        "naziv": "", "adresa": "", "mjesto": "", "oib": ""
    }

    # Dužnik
    c.execute("SELECT * FROM subjekti WHERE izracun_id = ? AND vrsta_subjekta = 'duznik'", (izracun_id,))
    duznik_row = c.fetchone()
    duznik = dict(duznik_row) if duznik_row else {
        "naziv": "", "adresa": "", "mjesto": "", "oib": ""
    }

    conn.close()

    # Složeni podatak koji šaljem u template
    ucitani_izracun = {
        "naziv": izracun["naziv_izracuna"],
        "opis": izracun["opis_izracuna"],
        "vrsta": izracun["vrsta_izracuna"],
        "datum": izracun["datum_izracuna"],
        "valuta": izracun["valuta"],
        "moratorij": izracun["moratorij"],
        "vjerovnik": vjerovnik,
        "duznik": duznik,
        "dugovi": [dict(row) for row in dugovi],
        "uplate": [dict(row) for row in uplate]
    }

    return render_template("index.html", ucitani_izracun=ucitani_izracun, izracuni=izracuni)



@app.route("/izracuni")
def prikazi_izracune():
    print("IZRACUNI prikaz ruta pokrenuta!")
    izracuni, izracuni_broj = get_izracuni()  # Bez filtera
    return render_template("izracuni.html", izracuni=izracuni, izracuni_broj=izracuni_broj)

@app.route("/izracuni_broj")
def broj_izracuna():
    """Vraća broj spremljenih izračuna kao JSON."""
    conn = sqlite3.connect("baza_izracuni.db")
    c = conn.cursor()

    c.execute("SELECT COUNT(*) FROM izracuni")
    broj = c.fetchone()[0]  # Dohvaća samo broj zapisa
    conn.close()

    return jsonify({"broj_izracuna": broj})  # Vraćam JSON

# Ruta za pretragu izračuna
@app.route("/pretrazi_izracune")
def pretrazi_izracune():
    query = request.args.get("query", "").strip()
    izracuni, izracuni_broj = get_izracuni(query)  # Dohvati filtrirane rezultate

    return render_template("izracuni.html", izracuni=izracuni, izracuni_broj=izracuni_broj, query=query, broj=len(izracuni))


# Ruta za izračun kamata
@app.route("/izracun", methods=["POST"])
def izracun():
    data = request.json  # 🚀 Podaci koje je frontend poslao
    print("Backend primio podatke:", json.dumps(data, indent=4, ensure_ascii=False))
    print("Primljeni JSON od frontend-a:")
    print(json.dumps(request.get_json(), indent=4, ensure_ascii=False))

    naziv_obracuna = data.get("naziv_izracuna", "").strip() or "Izračun"
    opis_obracuna = data.get("opis_izracuna", "").strip() or ""

    # provjeri da li backend stvarno vidi uplate
    for racun in data.get("racuni", []):
        print(f"Račun {racun['id_racuna']} ima uplate:", racun.get("uplate", "Nema uplata!"))

    try:
        # Provjeri je li zahtjev JSON
        if request.content_type != "application/json":
            return jsonify({"error": "Request must be JSON"}), 415

        data = request.get_json()
        print("Primljeni podaci:", json.dumps(data, indent=4, ensure_ascii=False))

        if not data:
            return jsonify({"error": "No data received"}), 400


        # Dobavljanje vjerovnika i dužnika iz JSON-a
        vjerovnik = data.get("vjerovnik", {})
        duznik = data.get("duznik", {})

        datum_kraja = data.get("datum_kraja")
        valuta = data.get("valuta", "EUR")
        vrsta_izracuna = data.get("vrsta_izracuna", "Nije odabrano")
        tip_subjekta = data.get("tip_subjekta", "natural-person")
        moratorium = data.get("moratorium", False)
        racuni = data.get("racuni", [])  # Svi računi dolaze ovdje
        print(f"Backend primio vrstu izračuna: {vrsta_izracuna}")
        if not racuni:
            return jsonify({"error": "Nema računa za obračun kamata!"}), 400  # Vrati grešku ako nema računa

        # Provjera nedostaju li ključni podaci
        if not datum_kraja:
            return jsonify({"error": "Nedostaje datum obračuna kamata"}), 400

        try:
            datum_kraja = datetime.strptime(datum_kraja, "%d.%m.%Y")  # Datum obračuna
        except ValueError:
            return jsonify({"error": "Neispravan format datuma obračuna!"}), 400

        # Kreiram skup (set) za praćenje ID-ova dodanih uplata
        dodani_uplata_ids = set()

        rezultat = []
        ukupni_dug = 0  # Ukupni dug kroz sve račune

        for racun in racuni:
            iznos = racun.get("iznos", 0)
            datum_pocetka = racun.get("datum_pocetka", "")
            naziv_racuna = racun.get("glavnica_naziv", "Početni dug").strip()  # Dohvati naziv računa

            # Ako nema naziva, postavi "Početni dug"
            if not naziv_racuna:
                naziv_racuna = "Početni dug"

            if iznos <= 0 or not datum_pocetka:
                continue  # Preskoči nevažeće račune

            try:
                datum_pocetka = datetime.strptime(datum_pocetka, "%d.%m.%Y")  # Pretvaranje datuma
            except ValueError:
                return jsonify({"error": f"Neispravan format datuma za račun: {datum_pocetka}"}), 400

            # Dodavanje početnog duga za svaki račun
            ukupni_dug += iznos
            rezultat.append({
                "datum": datum_pocetka.strftime("%d.%m.%Y"),
                "glavnica_naziv": naziv_racuna,
                "iznos": iznos,
                "dug_kamata": 0,
                "ukupni_dug": ukupni_dug
            })

            # Osiguraj da id_racuna postoji (ako ga frontend ne pošalje, postavi ga na None)
            id_racuna = racun.get("id_racuna", None)

            # Izračun kamata za ovaj račun
            izracunate_kamate, ukupna_kamata, moratorij_koristen = izracunaj_kamate(
                datum_pocetka.strftime("%d.%m.%Y"), 
                datum_kraja.strftime("%d.%m.%Y"), 
                iznos, 
                tip_subjekta, 
                moratorium, 
                racun.get("uplate", []),
                naziv_racuna,
                id_racuna
            )

            # Osiguraj da svaka kamata ima ID računa
            for kamata in izracunate_kamate:
                kamata["id_racuna"] = racun.get("id_racuna")  # Dodaj ID računa

            # Debugging ispis
            print(f"Kamate za račun ID {racun.get('id_racuna')}:")
            for kamata in izracunate_kamate:
                print(f"    - {kamata['datum']} | {kamata['opis']} | ID računa: {kamata.get('id_racuna', 'N/A')}")

            # Prvo sortiraj da se osigura pravilan redoslijed uplata i kamata
            izracunate_kamate = sorted(izracunate_kamate, key=lambda x: datetime.strptime(x["datum"], "%d.%m.%Y"))

            # Dodaj izračunate kamate u ukupni rezultat
            rezultat.extend(izracunate_kamate)

            preostali_dug = iznos

            # Dodavanje uplata
            print("Provjera ukupni_dug tipa:", type(ukupni_dug), "Vrijednost:", ukupni_dug)

            # Debug ispis prije dodavanja ukupnog duga
            print(f"Glavnica: {ukupni_dug}, Kamata: {ukupna_kamata}, Ukupan dug: {round(ukupni_dug + ukupna_kamata, 2)}")
            # Dodavanje ukupne kamate na kraju
            ukupni_dug += ukupna_kamata
            print(f"DEBUG: Inicijalna vrijednost ukupni_dug nakon dodavanja glavnice: {ukupni_dug}")

            # Inicijalizacija mapa za praćenje završnog duga po svakom računu
            zadnji_dug_po_racunu = {}

            for r in rezultat:
                if "ukupni_dug" in r and "id_racuna" in r:
                    zadnji_dug_po_racunu[r["id_racuna"]] = r["ukupni_dug"]  # Uvijek prepisuje zadnju vrijednost

            # Zbroji SAMO završne dugove za sve glavnice
            ukupni_dug = sum(zadnji_dug_po_racunu.values())

            print("DEBUG: Završni dugovi po računima:")
            for racun_id, dug in zadnji_dug_po_racunu.items():
                print(f"   Račun {racun_id}: {dug} EUR")

            print(f"DEBUG: Ukupni dug nakon korekcije: {ukupni_dug}")


            # Prvo izračunaj ispravnu vrijednost ukupneKamate
            zadnje_kamate_po_racunu = {}

            for r in rezultat:
                if "dug_kamata" in r and "id_racuna" in r:
                    zadnje_kamate_po_racunu[r["id_racuna"]] = r["dug_kamata"]  # Čuvamo samo zadnje stanje kamata za svaki račun

            # Sumiraj samo zadnje dug_kamata za svaki račun
            ukupneKamate = round(sum(zadnje_kamate_po_racunu.values()), 2)

            print(f"DEBUG: Ispravno ukupneKamate prije zapisivanja u JSON: {ukupneKamate}")

        print("DEBUG: Provjera uplata prije sumiranja:")
        for r in rezultat:
            if "Uplata" in r.get("opis", ""):
                print(f"DEBUG uplata: {r['datum']} | {r['opis']} | iznos={r['iznos']}")
            if "Ukupan dug nakon obračuna kamata" in r.get("opis", ""):
                print(f"{r.get('opis')}: {r.get('ukupni_dug', 0.0)} EUR")


        print("DEBUG: Svi ukupni dugovi u rezultat listi:")
        for r in rezultat:
            if "ukupni_dug" in r:
                print(f"{r.get('datum', 'N/A')} | {r.get('opis', 'N/A')} | {r.get('ukupni_dug', 0.0)} EUR")

        print("DEBUG: Svi dugovi po kamati u rezultatu:")
        for r in rezultat:
            if "dug_kamata" in r:
                print(f"{r.get('datum', 'N/A')} | {r.get('opis', 'N/A')} | dug_po_kamati={r.get('dug_kamata', 0.0)}")

        
        datum_obračuna = datum_kraja.strftime("%d.%m.%Y")  # Pretvaramo datum u string

        print("DEBUG: Podaci prije kreiranja json_response:", json.dumps(data, indent=4, ensure_ascii=False))

        # Kreiranje JSON odgovora
        json_response = {
            "vjerovnik": vjerovnik,  
            "duznik": duznik,        
            "rezultat": rezultat if rezultat else [],
            "glavnice": [
                {
                    "glavnica_naziv": r.get("glavnica_naziv", "Početni dug"),  
                    "iznos": round(r.get("iznos", 0.0), 2),
                    "datum_pocetka": r.get("datum", "N/A")
                }
                for r in rezultat if r.get("glavnica_naziv")
            ],
            "kamate": [
                {
                    "id_racuna": r.get("id_racuna", "N/A"),
                    "datum": r.get("datum", "N/A"),
                    "opis": r.get("opis", "Nema opisa"),
                    "iznos": round(r.get("iznos", 0.0), 2),
                    "dug_kamata": round(r.get("dug_kamata", 0.0), 2),
                    "ukupni_dug": round(r.get("ukupni_dug", 0.0), 2),
                    "period_od": r.get("period_od", "N/A"),
                    "period_do": r.get("period_do", "N/A"),
                    "osnovica": round(r.get("osnovica", 0.0), 2),
                    "broj_dana": r.get("broj_dana", 0),
                    "kamata_stopa": round(r.get("kamata_stopa", 0.0), 2),
                    "kta_razdoblja": round(r.get("kta_razdoblja", 0.0), 2)
                }
                # Nova provjera: Uklanjam periode koji su "N/A" i one sa osnovicom 0
                for r in rezultat
                if r.get("period_od") and r.get("period_do") and r.get("osnovica", 0) > 0
            ],
            "preplate": [
                {
                    "datum": r.get("datum"),
                    "opis": "Preplata",
                    "iznos": round(r.get("iznos", 0.0), 2),
                    "ukupni_dug": round(r.get("ukupni_dug", 0.0), 2),
                    "id_racuna": r.get("id_racuna")
                }
                for r in rezultat
                if r.get("opis") == "Preplata"
            ],
            "uplate": [
                {
                "datum": r.get("datum", "N/A"),
                "opis": r.get("opis", "Nema opisa"),
                "iznos": round(r.get("iznos", 0.0), 2),
                "dug_kamata": r.get("dug_kamata", 0.0),
                "ukupni_dug": round(r.get("ukupni_dug", 0.0), 2)
            }
            for r in rezultat if "Uplata" in r.get("opis", "")
            ],
            "ukupnaGlavnica": round(sum(r.get("iznos", 0.0) for r in rezultat if "glavnica_naziv" in r), 2),
            "ukupneKamate": ukupneKamate,
            "ukupneUplate": round(sum(r.get("iznos", 0.0) for r in rezultat if "Uplata" in r.get("opis", "")), 2),
            "ukupniDug": {
                "datum": datum_obračuna,
                "iznos": round(ukupni_dug, 2),
                "opis": f"Ukupni dug na dan {datum_obračuna}"
            },
            "moratorij": any(
                r.get("iznos", 0) == 0
                and r.get("kamata_stopa", 1) == 0.0  # Kamata mora biti 0%
                and r.get("period_od") not in ["N/A", None]
                and r.get("period_do") not in ["N/A", None]
                for r in rezultat
            ),
            "valuta": valuta
        }


        print("DEBUG: JSON odgovor frontend-u prije sortiranja:")
        print(json.dumps(json_response, indent=4, ensure_ascii=False))
        print(f"DEBUG: Backend računa rekapitulaciju:")
        print(f"  ➝ Glavnica: {json_response['ukupnaGlavnica']}")
        print(f"  ➝ Kamate: {json_response['ukupneKamate']}")
        print(f"  ➝ Uplate: {json_response['ukupneUplate']}")
        print(f"  ➝ Ukupni dug: {json_response['ukupniDug']['iznos']}")


        # Dodaj nazive u JSON odgovor
        json_data = request.get_json()  # Parse JSON iz requesta
        json_response["datum_izracuna"] = json_response.get("ukupniDug", {}).get("datum", "N/A")
        json_response["naziv_izracuna"] = json_data.get("naziv_izracuna", "N/A")
        json_response["opis_izracuna"] = json_data.get("opis_izracuna", "N/A")
        json_response["vrsta_izracuna"] = json_data.get("vrsta_izracuna", "Nije odabrano")
        json_response["tip_subjekta"] = data.get("tip_subjekta", "natural-person")
        
        # Dodaj račune u odgovor backend-a
        json_response["racuni"] = racuni
        print("DEBUG - Sirovi podaci u JSON-u za uplate:", json.dumps(json_response.get("uplate", []), indent=4, ensure_ascii=False))
        json_response["uplate"] = [
            {
                "datum": datetime.strptime(r["datum"], "%d.%m.%Y").strftime("%d.%m.%Y") if r.get("datum") else "N/A",
                "opis": r.get("opis", "Nema opisa"),
                "iznos": round(r.get("iznos", 0.0), 2),
                "dug_kamata": round(r.get("dug_kamata", 0.0), 2),
                "ukupni_dug": round(r.get("ukupni_dug", 0.0), 2),
                "id_racuna": r.get("id_racuna", None)  # Dodaj id_racuna u uplate
            }
            for r in json_response["rezultat"] if "Uplata" in r.get("opis", "")
        ]

        # Osiguraj da backend vraća vjerovnika, dužnika i vrstu izračuna
        json_response["vjerovnik"] = data.get("vjerovnik", {})
        json_response["duznik"] = data.get("duznik", {})
        json_response["vrsta_izracuna"] = data.get("vrsta_izracuna", "Nije odabrano")


        # Debug ispisi
        print("Backend šalje JSON sa uplatama:", json.dumps(json_response["uplate"], indent=4, ensure_ascii=False))
        print("Backend šalje JSON sa računima:", json.dumps(json_response["racuni"], indent=4, ensure_ascii=False))
        print("Backend šalje JSON sa podacima o izračunu:", json.dumps({
            "naziv_izracuna": json_response["naziv_izracuna"],
            "opis_izracuna": json_response["opis_izracuna"],
            "vrsta_izracuna": json_response["vrsta_izracuna"]
        }, indent=4, ensure_ascii=False))

        # Sortiraj rezultat po datumu
        json_response["rezultat"] = sorted(
            json_response["rezultat"],
            key=lambda x: datetime.strptime(x["datum"], "%d.%m.%Y") if x.get("datum") else datetime.min
        )

        # Formatiraj datume u rezultatu
        for r in json_response["rezultat"]:
            if r.get("datum"):
                r["datum"] = datetime.strptime(r["datum"], "%d.%m.%Y").strftime("%d.%m.%Y")
        print("Finalni rezultat koji backend šalje frontend-u:", json.dumps(json_response["rezultat"], indent=4, ensure_ascii=False))

        print("DEBUG: JSON odgovor koji se salje frontend-u:")
        print(json.dumps(json_response, indent=4, ensure_ascii=False))

        # Dohvati i formatiraj datum kraja izračuna
        datum_kraja = data.get("datum_kraja", "").strip()
        try:
            datum_kraja = datetime.strptime(datum_kraja, "%d.%m.%Y").strftime("%Y%m%d")
        except ValueError:
            datum_kraja = datetime.now().strftime("%Y%m%d")  # Ako datum nije ispravan, koristi današnji datum

        # Dohvati naziv izračuna i očisti ga od nedozvoljenih znakova
        naziv_obracuna = data.get("naziv_izracuna", "Izracun").strip()

        # Zamijeni nedozvoljene znakove (_ ostavljamo sigurno)
        naziv_obracuna = re.sub(r"[^\w\s\-_]", "_", naziv_obracuna)

        # Zamijeni razmake s _
        naziv_obracuna = naziv_obracuna.replace(" ", "_")

        # Generiraj osnovni naziv CSV-a koristeći datum kraja
        csv_base = f"{datum_kraja}_{naziv_obracuna}"
        csv_filename = f"{csv_base}.csv"
        csv_path = os.path.join(HISTORY_DIR, csv_filename)

        # Ako je naziv prazan, postavi "Izracun"
        if not naziv_obracuna:
            naziv_obracuna = "Izracun"

        # Provjeri postojeće CSV-ove u `history/` direktoriju
        existing_files = os.listdir(HISTORY_DIR)
        matching_files = [f for f in existing_files if f.startswith(csv_base) and f.endswith(".csv")]

        # Ako postoji više CSV-ova s istim imenom, dodaj broj (_1, _2, _3...)
        if csv_filename in matching_files:
            counter = 1
            while f"{csv_base}_{counter}.csv" in matching_files:
                counter += 1
            csv_filename = f"{csv_base}_{counter}.csv"

        csv_path = os.path.join(HISTORY_DIR, csv_filename)

        # Spremam putanju generiranog CSV-a za preuzimanje
        global ZADNJI_CSV_PATH
        ZADNJI_CSV_PATH = csv_path  # Sprema putanju zadnjeg CSV-a
        
        print(f"Generiran naziv CSV-a: {csv_filename}")


        print(f"Generiran naziv CSV-a: {csv_filename}")

        print(f"DEBUG: Ukupni dug prije kreiranja CSV-a 2: {json_response['ukupniDug']['iznos']}")

        # Spremi podatke u CSV
        def extract_date(text):
            """ Ekstrahira prvi datum iz stringa u formatu 'dd.mm.yyyy' """
            match = re.search(r"(\d{2}\.\d{2}\.\d{4})", text)
            return datetime.strptime(match.group(1), "%d.%m.%Y") if match else datetime.min

        # Ispravno dohvaćanje podataka iz JSON-a
        vjerovnik = json_response.get("vjerovnik", {})
        duznik = json_response.get("duznik", {})

        # Ispravno dohvaćanje valute
        valuta = json_response.get("valuta", "N/A")

        # Simulirani podaci iz main.js (ako ih nema u JSON-u, koristim "N/A")
        naziv_izracuna = json_response.get("naziv_izracuna", "N/A")
        opis_izracuna = json_response.get("opis_izracuna", "N/A")
        vrsta_izracuna = json_response.get("vrsta_izracuna", "Nije odabrano")

        # Formatiranje datuma izračuna
        datum_izracuna = json_response.get("ukupniDug", {}).get("datum", "N/A")
        if datum_izracuna != "N/A":
            datum_izracuna = datetime.strptime(datum_izracuna, "%d.%m.%Y").strftime("%d.%m.%Y")

        # Formatiram vjerovnika i dužnika u stringove razdvojene zarezima
        vjerovnik_str = ", ".join(filter(None, [
            vjerovnik.get("naziv", ""),
            vjerovnik.get("adresa", ""),
            vjerovnik.get("mjesto", ""),
            f"OIB: {vjerovnik.get('oib', '')}" if vjerovnik.get("oib") else ""
        ])) or ""

        duznik_str = ", ".join(filter(None, [
            duznik.get("naziv", ""),
            duznik.get("adresa", ""),
            duznik.get("mjesto", ""),
            f"OIB: {duznik.get('oib', '')}" if duznik.get("oib") else ""
        ])) or ""

        # Debug ispis (provjerim jesu li podaci sada ispravni)
        print(f"Naziv izračuna: {naziv_izracuna}")
        print(f"Opis izračuna: {opis_izracuna}")
        print(f"Vrsta izračuna: {vrsta_izracuna}")
        print(f"Datum izračuna: {datum_izracuna}")
        print(f"Valuta: {valuta}")
        print(f"Vjerovnik: {vjerovnik_str}")
        print(f"Dužnik: {duznik_str}")
        

        # Korak 1: Prestrukturiranje JSON-a kako bi lako dohvaćala podatke
        preformatirani_podaci = {}

        # Kreiram mapu (dictionary) za brzi pristup uplatama iz "racuni"
        mapa_uplata = {}

        for racun in json_response["racuni"]:
            racun_id = racun["id_racuna"]

            # Konvertiram datum_pocetka u `datetime` ako postoji
            datum_pocetka = racun.get("datum_pocetka", "N/A")
            if datum_pocetka != "N/A":
                datum_pocetka = datetime.strptime(datum_pocetka, "%d.%m.%Y")

            # Dodajem račun u preformatirani_podaci
            preformatirani_podaci[racun_id] = {
                "glavnica_naziv": racun.get("glavnica_naziv", "Neimenovani račun"),
                "datum_pocetka": datum_pocetka,
                "iznos": racun.get("iznos", 0.0),
                "obračuni": [],
                "uplate": [],
                "preplate": []
            }

            # Spremam uplate u mapu za kasnije pridruživanje
            for uplata in racun.get("uplate", []):
                datum = uplata["datum"]

                # Ako već postoji lista za taj datum, dodajem uplatu
                if datum not in mapa_uplata:
                    mapa_uplata[datum] = []  # Svaki datum može imati više uplata

                mapa_uplata[datum].append({
                    "id_racuna": racun_id,
                    "iznos": uplata["iznos"],
                    "dug_kamata": uplata.get("dug_kamata", 0.0),
                    "ukupni_dug": uplata.get("ukupni_dug", 0.0)
                })

        print("DEBUG: Mapa uplata (datum -> računi):", json.dumps(mapa_uplata, indent=4, ensure_ascii=False))

        # Dodajem obračunske periode u odgovarajući račun
        for kamata in json_response["kamate"]:
            racun_id = kamata["id_racuna"]
            if racun_id in preformatirani_podaci:
                preformatirani_podaci[racun_id]["obračuni"].append({
                    "datum": datetime.strptime(kamata["datum"], "%d.%m.%Y"),
                    "opis": kamata["opis"],  # Uklanjam nepotrebni tekst
                    "osnovica": kamata["osnovica"],
                    "broj_dana": kamata["broj_dana"],
                    "kamata_stopa": f"{kamata['kamata_stopa']}%",  # Dodajem "%” uz kamatnu stopu
                    "kta_razdoblja": kamata["kta_razdoblja"],
                    "dug_kamata": kamata["dug_kamata"],
                    "ukupni_dug": kamata["ukupni_dug"],
                })

        # Dodajem uplate u odgovarajući račun
        for uplata in json_response["uplate"]:
            racun_id = uplata.get("id_racuna")  # Pokušavam direktno dohvatiti ID

            # Ako nema `id_racuna`, pokušavamo ga naći u "racuni"
            if racun_id is None:
                print(f"Upozorenje: Uplata nema 'id_racuna', pokušavam pronaći... {uplata}")

                # Dohvaćam sve račune koji imaju uplatu tog datuma
                potencijalne_uplate = mapa_uplata.get(uplata["datum"], [])

                # Ako postoji više računa, dodjeljujem ih pravilno
                for podaci_uplate in potencijalne_uplate:
                    if podaci_uplate["iznos"] == uplata["iznos"]:  # Pronađem uplatu istog iznosa
                        racun_id = podaci_uplate["id_racuna"]
                        break  # Pronalazim prvi ispravan račun i izlazimo iz petlje

                if racun_id:
                    print(f"Uplata {uplata['datum']} pridružena računu {racun_id}")
                else:
                    print(f"Uplata {uplata['datum']} nije pronašla odgovarajući račun!")

            if racun_id and racun_id in preformatirani_podaci:
                # DEBUG: pogledaj sve kandidate iz rezultat
                print(f"Tražim ukupni_dug za uplatu: datum={uplata['datum']}, iznos={uplata['iznos']}, račun={racun_id}")
                for r in json_response["rezultat"]:
                    if r.get("opis") in ("Uplata", "Preplata"):
                        print("TEST KANDIDAT ----------------------")
                        print(f"datum:   {r.get('datum')} ==? {uplata['datum']}")
                        print(f"iznos:   {r.get('iznos')} ==? {uplata['iznos']} (diff: {abs(r.get('iznos', 0.0) - uplata['iznos'])})")
                        print(f"račun:   {r.get('id_racuna')} ==? {racun_id}")
                        print(f"ukupni:  {r.get('ukupni_dug')}")

                # Prvo pokušaj dohvatiti vrijednost iz preplate, ako postoji
                ukupni_dug_iz_rezultata = next(
                    (
                        r.get("ukupni_dug") for r in json_response["rezultat"]
                        if r.get("opis") == "Preplata"
                        and r.get("datum") == uplata["datum"]
                        and str(r.get("id_racuna")) == str(racun_id)
                    ),
                    None
                )

                # Ako nije našao preplatu, pokušaj dohvatiti iz originalne uplate
                if ukupni_dug_iz_rezultata is None:
                    ukupni_dug_iz_rezultata = next(
                        (
                            r.get("ukupni_dug") for r in json_response["rezultat"]
                            if r.get("opis") == "Uplata"
                            and r.get("datum") == uplata["datum"]
                            and abs(r.get("iznos", 0.0) - uplata["iznos"]) < 0.01
                            and str(r.get("id_racuna")) == str(racun_id)
                        ),
                        0.0
                    )

                print(f"Finalni ukupni_dug_iz_rezultata = {ukupni_dug_iz_rezultata} (tip: {type(ukupni_dug_iz_rezultata)})")

                preformatirani_podaci[racun_id]["uplate"].append({
                    "datum": datetime.strptime(uplata["datum"], "%d.%m.%Y"),
                    "opis": "Uplata",
                    "iznos": round(uplata["iznos"], 2),
                    "dug_po_kamati": round(uplata.get("dug_kamata", 0.0), 2),
                    "ukupni_dug": round(ukupni_dug_iz_rezultata, 2),
                })

                print(f"Dodana uplata za racun {racun_id}: {uplata['datum']} | {uplata['iznos']}")
                print(f"ukupni_dug_iz_rezultata = {ukupni_dug_iz_rezultata} (tip: {type(ukupni_dug_iz_rezultata)})")
                print(f"Uplata za racun {racun_id} | datum: {uplata['datum']} | iznos: {uplata['iznos']} | ukupni_dug iz rezultat: {ukupni_dug_iz_rezultata}")
                print(f"Uplata za racun zadnje {racun_id} | datum: {uplata['datum']} | iznos: {uplata['iznos']} | ukupni_dug iz rezultat: {ukupni_dug_iz_rezultata}")

                print(f"Uplata za racun {racun_id} | datum: {uplata['datum']} | iznos: {uplata['iznos']} | ukupni_dug iz rezultat: {ukupni_dug_iz_rezultata}")
                print(f"Uplata za racun {racun_id} | datum: {uplata['datum']} | iznos: {uplata['iznos']} | dug_kamata: {uplata.get('dug_kamata', 0.0)} | ukupni_dug: {uplata.get('ukupni_dug', 0.0)}")
                print(f"Dodana uplata za racun {racun_id}: {uplata['datum']} | {uplata['iznos']}") 
        print("DEBUG: JSON sa uplatama nakon dodavanja id_racuna:", json.dumps(json_response["uplate"], indent=4, ensure_ascii=False))
        print(f"DEBUG: Vrijednost ukupneKamate prije zapisivanja u CSV: {json_response['ukupneKamate']}")


        def json_serializer(obj):
            if isinstance(obj, datetime):
                return obj.strftime("%d.%m.%Y")  # Format: DD.MM.YYYY
            raise TypeError(f"Type {type(obj)} not serializable")

        print("DEBUG: Preformatirani podaci za CSV:")
        print(json.dumps(preformatirani_podaci, indent=4, ensure_ascii=False, default=json_serializer))

        # Dodajem preplate u odgovarajući račun
        for preplata in json_response.get("preplate", []):
            racun_id = preplata.get("id_racuna")

            if racun_id and racun_id in preformatirani_podaci:
                preformatirani_podaci[racun_id].setdefault("preplate", [])  # osiguraj da lista postoji

                iznos_preplate = round(preplata.get("iznos", 0.0), 2)
                ukupni_dug_preplate = round(preplata.get("ukupni_dug", 0.0), 2)

                preformatirani_podaci[racun_id]["preplate"].append({
                    "datum": datetime.strptime(preplata["datum"], "%d.%m.%Y"),
                    "opis": "Preplata",
                    "iznos": -abs(iznos_preplate),
                    "ukupni_dug": -abs(ukupni_dug_preplate)
                })
                print(f"Preplata pridruzena racunu {racun_id}: {preplata['datum']} | {preplata['iznos']}")
                print(f"Preplata pridruzena racunu {racun_id}: {preplata['datum']} | iznos={preplata.get('iznos')} | ukupni_dug={preplata.get('ukupni_dug')}")

        # Spremi podatke u CSV
        with open(csv_path, mode="w", newline="", encoding="utf-8-sig") as file:
            writer = csv.writer(file, delimiter=";")

            # Upisujem podatke iz izračuna
            writer.writerow(["Naziv izračuna", "Opis izračuna", "Vrsta izračuna", "Datum izračuna", "Valuta", "Vjerovnik", "Dužnik"])
            writer.writerow([naziv_izracuna, opis_izracuna, vrsta_izracuna, datum_izracuna, valuta, vjerovnik_str, duznik_str])
            writer.writerow([])  # Prazan red za razdvajanje

            def format_number(value):
                """Formatira broj u europski format: 1.332,00 umjesto 1332.00"""
                return "{:,.2f}".format(value).replace(",", "X").replace(".", ",").replace("X", ".")

            for racun_id, podaci in preformatirani_podaci.items():
                # Upisujem glavnicu
                writer.writerow(["Stavka / Opis", "", "", "Datum", "Iznos", "Dug po kamati", "Ukupni dug"])
                writer.writerow([
                    podaci["glavnica_naziv"],
                    "", "",
                    podaci["datum_pocetka"].strftime("%d.%m.%Y") if isinstance(podaci["datum_pocetka"], datetime) else podaci["datum_pocetka"],
                    format_number(podaci["iznos"]),
                    "0,00",
                    format_number(podaci["iznos"]),
                ])

                # Dohvaćam i sortiram sve obračunske periode i uplate
                svi_zapisi = sorted(
                    podaci["obračuni"] + podaci["uplate"] + podaci.get("preplate", []),
                    key=lambda x: x["datum"]
                )

                # Upisujem obračunske periode, uplate i preplate u CSV
                writer.writerow(["Period obračuna", "Osnovica", "Br. dana", "K. stopa", "Kta razdoblja", "Kta kumulativno", "Dug kumulativno"])
                prvi_period_prikazan = False
                for zapis in svi_zapisi:
                    if "osnovica" in zapis:  # Obračunski period
                        writer.writerow([
                            zapis["opis"],
                            format_number(zapis["osnovica"]),
                            zapis["broj_dana"],
                            zapis["kamata_stopa"] if zapis["kamata_stopa"].endswith("%") else f"{zapis['kamata_stopa']}%",
                            format_number(zapis["kta_razdoblja"]),
                            format_number(zapis["dug_kamata"]),
                            format_number(zapis["ukupni_dug"]),
                        ])
                        prvi_period_prikazan = True

                    elif zapis.get("opis") == "Uplata" and prvi_period_prikazan:
                        writer.writerow([
                            "Uplata", "", "",
                            zapis["datum"].strftime("%d.%m.%Y"),
                            format_number(zapis["iznos"]),
                            format_number(zapis["dug_po_kamati"]),
                            format_number(zapis["ukupni_dug"]),
                        ])

                    elif zapis.get("opis") == "Preplata":
                        writer.writerow([
                            "Preplata", "", "",
                            zapis["datum"].strftime("%d.%m.%Y"),
                            "", "",  # Preplata nema iznos ni dug po kamati
                            format_number(zapis["ukupni_dug"]),
                        ])


                writer.writerow([])  # Prazan redak između računa

            # Rekapitulacija
            writer.writerow(["Rekapitulacija"])

            # Glavnica, kamate, uplate iz json_response
            ukupna_glavnica = round(json_response.get("ukupnaGlavnica", 0.0), 2)
            ukupne_kamate = round(json_response.get("ukupneKamate", 0.0), 2)
            ukupne_uplate = round(json_response.get("ukupneUplate", 0.0), 2)

            # Zbroji sve preplate
            ukupne_preplate = round(sum(
                r.get("iznos", 0.0)
                for racun in preformatirani_podaci.values()
                for r in racun.get("preplate", [])
            ), 2)

            # Ukupni dug računam kao posljednji `ukupni_dug` u zadnjem zapisu SVAKOG računa
            zadnji_dugovi = []
            for racun in preformatirani_podaci.values():
                svi_zapisi = sorted(
                    racun["obračuni"] + racun["uplate"] + racun.get("preplate", []),
                    key=lambda x: x["datum"]
                )
                print(f"Račun: {racun.get('glavnica_naziv')}")
                for z in svi_zapisi:
                    print(f"{z['datum'].strftime('%d.%m.%Y')} | {z.get('opis')} | ukupni_dug: {z.get('ukupni_dug')}")

                if svi_zapisi:
                    zadnji = svi_zapisi[-1]
                    dug = zadnji.get("ukupni_dug") or 0.0
                    zadnji_dugovi.append(dug)
                    print(f"Zadnji zapis: {zadnji['datum'].strftime('%d.%m.%Y')} | {zadnji.get('opis')} | ukupni_dug: {dug}")

            ukupni_dug = round(sum(zadnji_dugovi), 2)

            # Upis rekapitulacije
            # Broj stavki
            broj_glavnica = len(json_response.get("glavnice", []))
            broj_uplata = len(json_response.get("uplate", []))
            broj_preplata = len(json_response.get("preplate", []))

            # Upis rekapitulacije u CSV
            writer.writerow([f"Glavnica ({broj_glavnica})", format_number(ukupna_glavnica)])
            writer.writerow(["Kamate", format_number(ukupne_kamate)])
            writer.writerow([f"Uplate ({broj_uplata})", format_number(ukupne_uplate)])
            writer.writerow(["Ukupni dug", format_number(ukupni_dug)])
            if broj_preplata > 0:
                writer.writerow([f"Preplate ({broj_preplata})", format_number(ukupne_preplate)])

        print(f"CSV spremljen: {csv_path}")  # 🛠 Debug ispis

        print(f"DEBUG: Ukupni dug prije slanja JSON odgovora: {json_response['ukupniDug']['iznos']}")

        print("DEBUG: JSON koji šaljemo na frontend iz /izracun:")
        print(json.dumps(json_response, indent=4, ensure_ascii=False))
        return jsonify(json_response)

    except Exception as e:
        import traceback
        print("Greška na backendu:", str(e))
        print(traceback.format_exc())  # OVO ĆE ISPISATI DETALJAN STACK TRACE
        return jsonify({"error": "Internal Server Error"}), 500


# Pokretanje Flask aplikacije
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)