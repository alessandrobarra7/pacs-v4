from __future__ import annotations

import sys
from pathlib import Path
from collections import Counter, defaultdict

import pydicom


def value(ds, name, default=""):
    raw = getattr(ds, name, default)
    if isinstance(raw, (list, tuple)):
        return tuple(str(item) for item in raw)
    return str(raw)


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: analyze_dicom_order.py <study_cache_dir>")
        return 2

    root = Path(sys.argv[1])
    files = list(root.glob("*.dcm"))
    records = []
    for path in files:
        ds = pydicom.dcmread(path, stop_before_pixels=True, force=True)
        position = value(ds, "ImagePositionPatient", "")
        records.append({
            "filename": path.name,
            "series_uid": value(ds, "SeriesInstanceUID", ""),
            "series_number": value(ds, "SeriesNumber", ""),
            "series_description": value(ds, "SeriesDescription", ""),
            "instance_number": int(getattr(ds, "InstanceNumber", 0) or 0),
            "sop_instance_uid": value(ds, "SOPInstanceUID", ""),
            "position": position,
        })

    print(f"files={len(records)}")
    print("series_counts=")
    for series_uid, count in Counter(item["series_uid"] for item in records).most_common():
        sample = next(item for item in records if item["series_uid"] == series_uid)
        print(f"  {count} | series_number={sample['series_number']} | description={sample['series_description']} | uid={series_uid}")

    print("\nlexicographic_first_30=")
    for index, item in enumerate(sorted(records, key=lambda current: current["filename"])[:30], 1):
        print(f"{index:03d} | instance={item['instance_number']:03d} | series={item['series_number']} | {item['series_description']} | {item['filename']}")

    print("\narrival_first_30=")
    for index, item in enumerate(records[:30], 1):
        print(f"{index:03d} | instance={item['instance_number']:03d} | series={item['series_number']} | {item['series_description']} | {item['filename']}")

    print("\nby_series_and_instance_first_30=")
    ordered = sorted(records, key=lambda current: (
        int(current["series_number"] or 0),
        current["instance_number"],
        current["sop_instance_uid"],
    ))
    for index, item in enumerate(ordered[:30], 1):
        print(f"{index:03d} | instance={item['instance_number']:03d} | series={item['series_number']} | {item['series_description']} | {item['filename']}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
