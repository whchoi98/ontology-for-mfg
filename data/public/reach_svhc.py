"""ECHA REACH-SVHC candidate list — curated 50-entry subset for hi-tech MFG demo.

Full list (244+ as of 2026): https://echa.europa.eu/candidate-list-table.
Subset chosen to cover plasticizers, flame retardants, heavy metals relevant to
electronics manufacturing.
"""
from __future__ import annotations
from data.schemas import Substance, Regulation

# (cas_id, name, cmr_grade)
_SVHC_SUBSET: list[tuple[str, str, str | None]] = [
    ("117-81-7",  "Bis(2-ethylhexyl) phthalate (DEHP)", "1B"),
    ("84-69-5",   "Diisobutyl phthalate (DIBP)", "1B"),
    ("84-74-2",   "Dibutyl phthalate (DBP)", "1B"),
    ("85-68-7",   "Benzyl butyl phthalate (BBP)", "1B"),
    ("1303-86-2", "Boric acid", "1B"),
    ("7440-43-9", "Cadmium", "1B"),
    ("7440-02-0", "Nickel", "2"),
    ("7439-92-1", "Lead", "1A"),
    ("7440-50-8", "Copper", None),  # not CMR but on watch list
    ("75-09-2",   "Dichloromethane", "2"),
    ("106-99-0",  "1,3-Butadiene", "1A"),
    ("75-01-4",   "Vinyl chloride", "1A"),
    ("121-14-2",  "2,4-Dinitrotoluene", "1B"),
    ("100-42-5",  "Styrene", "2"),
    ("75-21-8",   "Ethylene oxide", "1B"),
    ("96-09-3",   "Styrene oxide", "1B"),
    ("75-07-0",   "Acetaldehyde", "2"),
    ("80-05-7",   "Bisphenol A", None),
    ("85-44-9",   "Phthalic anhydride", None),
    ("123-91-1",  "1,4-Dioxane", "2"),
    ("60-35-5",   "Acetamide", "2"),
    ("78-93-3",   "Methyl ethyl ketone", None),
    ("872-50-4",  "1-Methyl-2-pyrrolidone (NMP)", "1B"),
    ("1330-43-4", "Disodium tetraborate, anhydrous", "1B"),
    ("64-19-7",   "Acetic acid", None),
    ("110-86-1",  "Pyridine", None),
    ("108-95-2",  "Phenol", None),
    ("106-89-8",  "Epichlorohydrin", "1B"),
    ("75-12-7",   "Formamide", "1B"),
    ("57-12-5",   "Cyanide", None),
    ("1330-20-7", "Xylenes", None),
    ("100-41-4",  "Ethylbenzene", "2"),
    ("71-43-2",   "Benzene", "1A"),
    ("108-88-3",  "Toluene", None),
    ("67-66-3",   "Chloroform", "2"),
    ("71-55-6",   "1,1,1-Trichloroethane", None),
    ("127-18-4",  "Tetrachloroethylene (PCE)", "2"),
    ("79-01-6",   "Trichloroethylene (TCE)", "1B"),
    ("110-54-3",  "n-Hexane", None),
    ("64-17-5",   "Ethanol", None),
    ("67-56-1",   "Methanol", None),
    ("123-86-4",  "n-Butyl acetate", None),
    ("141-78-6",  "Ethyl acetate", None),
    ("67-64-1",   "Acetone", None),
    ("75-05-8",   "Acetonitrile", None),
    ("110-71-4",  "1,2-Dimethoxyethane", "1B"),
    ("96-12-8",   "1,2-Dibromo-3-chloropropane (DBCP)", "1B"),
    ("106-93-4",  "1,2-Dibromoethane (EDB)", "1B"),
    ("79-06-1",   "Acrylamide", "1B"),
    ("107-13-1",  "Acrylonitrile", "1B"),
]


def load_svhc_substances() -> list[Substance]:
    return [
        Substance(cas_id=cas, name=name, cmr_grade=cmr, reach_svhc=True)
        for cas, name, cmr in _SVHC_SUBSET
    ]


def load_reach_regulation() -> Regulation:
    return Regulation(
        id="REACH-SVHC",
        region="EU",
        title="REACH Article 33 — Substances of Very High Concern (Candidate List)",
    )
