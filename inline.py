import os

from bs4 import BeautifulSoup

soup = BeautifulSoup(open("static/meshtv.html", "r"), "html.parser")
scripts = soup.find_all("script")
for script in scripts:
    if "src" in script.attrs:
        with open(script["src"], "r") as file:
            script.string = file.read()
        del script["src"]


os.makedirs("static/build", exist_ok=True)
with open("static/build/inline.html", "w") as file:
    file.write(soup.prettify())
