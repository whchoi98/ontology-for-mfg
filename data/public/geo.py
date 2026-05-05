"""ISO-3166 alpha-2 region metadata for the 7 countries in the global SCM scope.

Note: GeoJSON polygons themselves are loaded by the web frontend (Plan 2)
via Natural Earth (1:50m countries). This module only carries name/code metadata
for graph nodes.
"""
from __future__ import annotations
from data.schemas import Region

_RAW: list[tuple[str, str, str]] = [
    ("KR", "Korea, Republic of", "대한민국"),
    ("CN", "China",               "중국"),
    ("VN", "Vietnam",             "베트남"),
    ("MX", "Mexico",              "멕시코"),
    ("PL", "Poland",              "폴란드"),
    ("US", "United States",       "미국"),
    ("IN", "India",               "인도"),
]


def load_regions() -> list[Region]:
    return [Region(id=i, name=n, name_ko=k) for i, n, k in _RAW]
