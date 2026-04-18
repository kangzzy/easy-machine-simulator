; Toolpath that exceeds 3-axis CNC bounds (X: -200 to 200, Y: -150 to 150)
G90 G21 G17
G0 Z50
G0 X0 Y0

G1 Z10 F300
G1 X100 Y100 F500
G1 X250 Y100      ; X EXCEEDS +200 bound
G1 X250 Y200      ; BOTH X and Y exceed bounds
G1 X0 Y0

G0 Z50
