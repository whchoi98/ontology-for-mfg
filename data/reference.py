"""Real-world reference nodes from `data/public/` (Region / Standard / Regulation / Substance).

These are frozen, non-synthetic sets — the graph loader materialises them as
nodes so synthetic FK lists (component standards / substances, lane
regulations, ...) resolve to real `Standard` / `Substance` / `Regulation` /
`Region` nodes instead of dangling strings.
"""

from __future__ import annotations

from data.public.aec_q import load_aec_q_standards
from data.public.cbam import load_cbam_regulation
from data.public.geo import load_regions
from data.public.ipc import load_ipc_standards
from data.public.iso_iatf import load_iso_iatf_standards
from data.public.jedec import load_jedec_standards
from data.public.materials import load_common_materials
from data.public.reach_svhc import load_reach_regulation, load_svhc_substances
from data.public.rohs import load_rohs_regulation, load_rohs_substances
from data.public.us_trade import load_ira_regulation, load_usmca_regulation
from data.schemas import Substance


def _dedupe(models: list, key: str) -> list[dict]:
    seen: dict[str, dict] = {}
    for m in models:
        d = m.model_dump(mode="json")
        seen.setdefault(d[key], d)
    return list(seen.values())


def regions() -> list[dict]:
    return _dedupe(load_regions(), "id")


def standards() -> list[dict]:
    return _dedupe(
        load_jedec_standards()
        + load_ipc_standards()
        + load_aec_q_standards()
        + load_iso_iatf_standards(),
        "id",
    )


def regulations() -> list[dict]:
    return _dedupe(
        [
            load_reach_regulation(),
            load_rohs_regulation(),
            load_cbam_regulation(),
            load_ira_regulation(),
            load_usmca_regulation(),
        ],
        "id",
    )


def substances() -> list[dict]:
    """REACH-SVHC ∪ RoHS ∪ common non-restricted materials, merged by CAS id
    (flags OR-ed, distinct names joined) with `regulation_ids` naming every
    regulation that lists the substance."""
    reach_id = load_reach_regulation().id
    rohs_id = load_rohs_regulation().id
    merged: dict[str, Substance] = {}
    names: dict[str, list[str]] = {}
    for s in load_svhc_substances() + load_rohs_substances() + load_common_materials():
        names.setdefault(s.cas_id, [])
        if s.name not in names[s.cas_id]:
            names[s.cas_id].append(s.name)
        prev = merged.get(s.cas_id)
        if prev is None:
            merged[s.cas_id] = s
        else:
            merged[s.cas_id] = prev.model_copy(
                update={
                    "cmr_grade": prev.cmr_grade or s.cmr_grade,
                    "rohs_restricted": prev.rohs_restricted or s.rohs_restricted,
                    "reach_svhc": prev.reach_svhc or s.reach_svhc,
                }
            )
    out: list[dict] = []
    for cas, s in merged.items():
        regs = ([reach_id] if s.reach_svhc else []) + ([rohs_id] if s.rohs_restricted else [])
        out.append(
            s.model_copy(
                update={"name": " / ".join(names[cas]), "regulation_ids": regs}
            ).model_dump(mode="json")
        )
    return out


REFERENCE_SOURCES = {
    "regions": regions,
    "standards": standards,
    "regulations": regulations,
    "substances": substances,
}


def load_reference(key: str) -> list[dict]:
    try:
        fn = REFERENCE_SOURCES[key]
    except KeyError:
        raise KeyError(
            f"unknown reference source {key!r}; known: {sorted(REFERENCE_SOURCES)}"
        ) from None
    return fn()
