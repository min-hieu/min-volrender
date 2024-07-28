#
# Written by Nguyen Minh Hieu (Charlie), 2024
#
import numpy as np
import sys
import json, codecs

# source: https://web.cs.ucdavis.edu/~okreylos/PhDStudies/Spring2000/ECS277/DataSets.html

header = dict([
    ('dimX', ('>i4',int)), ('dimY', ('>i4', int)), ('dimZ', ('>i4',int)),
    ('savedBorderSize', ('>i4', int)),
    ('trueSizeX', ('>f4',float)), ('trueSizeY', ('>f4',float)), ('trueSizeZ', ('>f4',float)),
])

header_out = dict()

fname = "Skull"

with open(f"./{fname}.vol", "rb") as f:
    for hname, (htype, ntype) in header.items():
        header_out[hname] = np.frombuffer(f.read(np.dtype(htype).itemsize), htype)[0]
        header_out[hname] = ntype(header_out[hname])
        print(hname, header_out[hname])

    size = header_out['dimX'] * header_out['dimY'] * header_out['dimZ']
    data = np.frombuffer(f.read(size), '>u1').reshape(header_out['dimX'], header_out['dimY'], header_out['dimZ'])
    data = data.T.reshape(-1)

    json_content = {
        **header_out,
        'data': data.tolist()
    }

    with open(f"./{fname}.json", 'w') as f:
        json.dump(json_content, f, indent=4)
