; Circular pocket with arcs
G90 G21 G17
G0 Z50
G0 X50 Y0

; Cut circle using arcs
G1 Z-5 F100
G2 X50 Y0 I-50 J0 F400 ; Full circle, center at origin

; Second pass deeper
G1 Z-10 F100
G2 X50 Y0 I-50 J0 F400

G0 Z50
G0 X0 Y0
