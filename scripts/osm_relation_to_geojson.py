"""Convert an OSM relation (fetched with `out geom;`) to a GeoJSON Polygon.

Usage:
    python scripts/osm_relation_to_geojson.py /tmp/morioka_osm.json data/morioka_city.geojson
"""

import json
import sys
from typing import Any


def way_to_coords(way: dict[str, Any]) -> list[tuple[float, float]]:
    return [(node["lon"], node["lat"]) for node in way.get("geometry", [])]


def close_ring(coords: list[tuple[float, float]]) -> list[tuple[float, float]]:
    if coords and coords[0] != coords[-1]:
        coords = coords + [coords[0]]
    return coords


def ring_area(coords: list[tuple[float, float]]) -> float:
    """Shoelace formula. Positive = counter-clockwise, negative = clockwise."""
    area = 0.0
    n = len(coords)
    for i in range(n):
        x1, y1 = coords[i]
        x2, y2 = coords[(i + 1) % n]
        area += (x2 - x1) * (y2 + y1)
    return area / 2


def join_ways(ways: list[list[tuple[float, float]]]) -> list[tuple[float, float]]:
    """Join way coordinate sequences into a single closed ring."""
    if not ways:
        return []

    remaining = ways[:]
    current = remaining.pop(0)

    while remaining:
        last = current[-1]
        first = current[0]
        for i, way in enumerate(remaining):
            if not way:
                continue
            w_first, w_last = way[0], way[-1]
            if w_first == last:
                current.extend(way[1:])
                remaining.pop(i)
                break
            if w_last == last:
                current.extend(list(reversed(way[:-1])))
                remaining.pop(i)
                break
            if w_first == first:
                current = way[:-1] + current
                remaining.pop(i)
                break
            if w_last == first:
                current = list(reversed(way[1:])) + current
                remaining.pop(i)
                break
        else:
            raise ValueError("ways are not connected")

    return close_ring(current)


def relation_to_polygon(relation: dict[str, Any]) -> dict[str, Any]:
    outer_ways = []
    for member in relation.get("members", []):
        if member.get("type") == "way" and member.get("role") == "outer":
            outer_ways.append(way_to_coords(member))

    exterior = join_ways(outer_ways)
    # GeoJSON RFC 7946: exterior rings must be counter-clockwise.
    if ring_area(exterior) < 0:
        exterior.reverse()
    return {
        "type": "Feature",
        "properties": {
            "name": "盛岡市",
            "source": "OpenStreetMap relation 963784",
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [exterior],
        },
    }


def main() -> None:
    src_path = sys.argv[1]
    out_path = sys.argv[2]
    with open(src_path, encoding="utf-8") as fh:
        data = json.load(fh)

    relations = [el for el in data.get("elements", []) if el.get("type") == "relation"]
    if not relations:
        raise SystemExit("no relation found")

    feature = relation_to_polygon(relations[0])
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(feature, fh, ensure_ascii=False, indent=2)


if __name__ == "__main__":
    main()
