"""
Convert KMZ to parsed JSON lines output.

Copyright (c) 2019 Patrick Wagstrom
Licensed under the terms of the MIT license

Parses a kmz file obtained for Google My Maps and extracts the coordinates
of the primary path stored within the file

"""

import argparse
from io import BytesIO
import json
from typing import List, Tuple, Dict
from zipfile import ZipFile

from geopy.distance import distance
from lxml import etree


def parse_kmz(filename: str) -> List[Tuple[float, float]]:
    """Extract coordinates of first path from the KMZ file.

    Args:
        filename (str): the name of the file to parse

    Returns:
        A list of the coordinates that represent the path.

        Each element in the list is a tuple consisting of a pair of floats
        that represent the latitude, longitude combination for that point.

    """
    kmz = ZipFile(filename, "r")
    kml = kmz.open("doc.kml", "r").read()

    tree = etree.parse(BytesIO(kml))

    coordinates = tree.xpath(
        "/a:kml/a:Document/a:Placemark/a:LineString/a:coordinates",
        namespaces={"a": "http://www.opengis.net/kml/2.2"},
    )[0].text

    # geopy expects coordinate in the (long, lat) format
    coords = [
        (float(y[1]), float(y[0]))
        for y in [
            x.strip().split(",") for x in coordinates.split("\n") if len(x.strip())
        ]
    ]

    return coords


def calculate_distances(coords: List[Tuple[float, float]]) -> List[Dict]:
    """
    Parse a list of coordinates into a dictionary structure with distances.

    Arguments:
        coords (List): A list of tuples representing latitude, longitude pairs

    Returns:
        A list of the line segments along the path. Each line segment is
        represented as a dictionary that has the following keys:
        - "start": (latitude, longitude) tuple for the start of the segment
        - "stop": (latitude, longitude) tuple for the end of the segment
        - "distance": length of that segment
        - "total": total distance of the path up to and including this segment

        This is an example of one such record:
        {
            "start": (44.85858, -66.98359),
            "stop": (44.85858, -66.98382),
            "distance": 0.011296110181122795,
            "total": 0.011296110181122795
        }

    """
    miles = 0
    od = []
    for idx in range(len(coords)):
        if idx == 0:
            continue
        dist = distance(coords[idx], coords[idx - 1]).miles
        miles = miles + dist
        od.append(
            {
                "start": coords[idx - 1],
                "stop": coords[idx],
                "distance": dist,
                "total": miles,
            }
        )
    return od


def output_jsonl(filename: str, data: List, verbose: bool=False) -> int:
    """
    Output a list of dictionaries as JSON lines.

    This is intended as a simple helper function that takes any list of
    dictionaries and outputs it one record per line to a jsonl file. This
    file can be incrementally parsed by a web page, which is handy if you
    need to operate on records earlier in the file, don't think you'll need
    all the records, or need to seek within the file.

    Arguments:
        filename (str): the name of the file to write out
        data (List): A list of records to write out to the file, each record must
              be an object that can be dumped via `json.dump`
    Returns:
        number of lines written to the file
    """
    lines = 0
    with open(filename, "w") as outfile:
        for x in data:
            if verbose:
                print(json.dumps(x))
            json.dump(x, outfile)
            outfile.write("\n")
            lines = lines + 1
    return lines

def main(infile: str, outfile: str, verbose: bool=False):
    """Main routine to convert KMZ to JSON lines output.

    This is a convenience function to run the entire script and convert the
    inputfile from a KMZ file to a JSON lines output file.

    Arguments:
        infile (str): the name of the KMZ file to parse
        outfile (str): the name of the JSON lines output file

    """
    coords = parse_kmz(infile)
    distances = calculate_distances(coords)
    lines_converted = output_jsonl(outfile, distances, verbose)
    print(f"Wrote {lines_converted} lines to {outfile}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Convert a KMZ file to JSON lines")
    parser.add_argument('infile', metavar='infile', type=str,
                        help="KMZ file to read as input")
    parser.add_argument('outfile', metavar='outfile', type=str,
                        help="JSONL file to write as output",
                        default="output.jsonl")
    parser.add_argument('--verbose', action='store_true', default=False,
                        help="Print out each record as it is written")
    
    args = parser.parse_args()

    main(infile=args.infile, outfile=args.outfile, verbose=args.verbose)
